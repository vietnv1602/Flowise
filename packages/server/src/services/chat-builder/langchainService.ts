/**
 * LangChain Service for Chat Builder (Simplified Version)
 *
 * Basic integration with LangChain and langchain-openai:
 * - ChatOpenAI integration with LLM Hub
 * - Basic chat (non-streaming)
 * - Streaming chat
 * - MongoDB-backed memory for conversation history
 */

import { ChatOpenAI } from '@langchain/openai'
import { BaseMessage, HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages'
import { BaseChatMessageHistory } from '@langchain/core/chat_history'
import { MongoDBChatMessageHistory } from '@langchain/mongodb'
import { MongoClient } from 'mongodb'
import { z } from 'zod'
import logger from '../../utils/logger'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { StatusCodes } from 'http-status-codes'

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface LangChainMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export interface LangChainRequestOptions {
    model: string
    messages: LangChainMessage[]
    stream?: boolean
    temperature?: number
    max_tokens?: number
    conversationId?: string // For memory management
}

// ============================================================================
// MongoDB Connection & Memory Management
// ============================================================================

/**
 * MongoDB connection singleton
 */
class MongoDBConnection {
    private static client: MongoClient | null = null
    private static isConnected: boolean = false

    static async getCollection(collectionName: string = 'chat_messages'): Promise<any | null> {
        const mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URI

        if (!mongoUrl) {
            logger.warn('[MongoDBConnection] No MONGODB_URL configured')
            return null
        }

        try {
            if (!this.isConnected || !this.client) {
                logger.info('[MongoDBConnection] Connecting to MongoDB', { mongoUrl })
                this.client = new MongoClient(mongoUrl)
                await this.client.connect()
                this.isConnected = true
                logger.info('[MongoDBConnection] Connected to MongoDB successfully')
            }

            const dbName = process.env.MONGODB_DB_NAME || 'flowise_chat_history'
            const db = this.client.db(dbName)

            logger.info(`[MongoDBConnection] Getting collection: ${collectionName}`)
            return db.collection(collectionName)
        } catch (error: any) {
            logger.warn('[MongoDBConnection] Failed to connect', { error: error.message })
            return null
        }
    }

    static async close(): Promise<void> {
        if (this.client) {
            await this.client.close()
            this.isConnected = false
            this.client = null
            logger.info('[MongoDBConnection] MongoDB connection closed')
        }
    }
}

/**
 * Store for conversation histories with MongoDB fallback to in-memory
 */
class ConversationHistoryStore {
    private histories: Map<string, BaseChatMessageHistory> = new Map()

    async getHistory(conversationId: string): Promise<BaseChatMessageHistory> {
        // Check cache first
        if (this.histories.has(conversationId)) {
            return this.histories.get(conversationId)!
        }

        // Try MongoDB first
        try {
            const collection = await MongoDBConnection.getCollection('chat_messages')

            if (collection) {
                // Create MongoDBChatMessageHistory
                const history = new MongoDBChatMessageHistory({
                    collection,
                    sessionId: conversationId
                })

                this.histories.set(conversationId, history)
                logger.info('[ConversationHistoryStore] Using MongoDB for history', { conversationId })
                return history
            }
        } catch (error: any) {
            logger.warn('[ConversationHistoryStore] MongoDB failed, using in-memory', {
                error: error.message
            })
        }

        // Fallback to in-memory
        const { ChatMessageHistory } = await import('langchain/memory')
        const fallbackHistory = new ChatMessageHistory()
        this.histories.set(conversationId, fallbackHistory)

        logger.info('[ConversationHistoryStore] Using in-memory for history', { conversationId })
        return fallbackHistory
    }

    async clearHistory(conversationId: string): Promise<void> {
        this.histories.delete(conversationId)
        logger.info('[ConversationHistoryStore] History cleared', { conversationId })
    }

    async clearAllHistories(): Promise<void> {
        this.histories.clear()
        logger.info('[ConversationHistoryStore] All histories cleared')
    }
}

const historyStore = new ConversationHistoryStore()

// ============================================================================
// LangChain Service (Simplified)
// ============================================================================

class LangChainService {
    private baseURL: string
    private apiKey: string | undefined
    private timeout: number
    private defaultModel: string

    constructor() {
        this.baseURL = process.env.LLM_HUB_URL || 'https://llm-hub.roxane.one'
        this.apiKey = process.env.LLM_HUB_API_KEY
        this.timeout = parseInt(process.env.LLM_HUB_TIMEOUT || '120000')
        this.defaultModel = process.env.LLM_HUB_DEFAULT_MODEL || 'gpt-4o-mini'
    }

    /**
     * Create or get a ChatOpenAI instance
     */
    private createChatInstance(model: string, temperature: number = 0.7): ChatOpenAI {
        return new ChatOpenAI({
            model,
            temperature,
            maxTokens: 4096,
            apiKey: this.apiKey || 'dummy-key', // Fallback for LLM Hub without auth
            configuration: {
                baseURL: `${this.baseURL}/v1`
            },
            timeout: this.timeout
        })
    }

    /**
     * Convert messages to LangChain format
     */
    private convertToLangChainMessages(messages: LangChainMessage[]): BaseMessage[] {
        return messages.map((msg) => {
            switch (msg.role) {
                case 'system':
                    return new SystemMessage(msg.content)
                case 'user':
                    return new HumanMessage(msg.content)
                case 'assistant':
                    return new AIMessage(msg.content)
                default:
                    return new HumanMessage(msg.content)
            }
        })
    }

    // ========================================================================
    // 1. Basic Chat (Non-streaming)
    // ========================================================================

    /**
     * Basic chat completion (non-streaming)
     */
    async chat(request: LangChainRequestOptions): Promise<string> {
        try {
            logger.info('[LangChainService] Calling chat completion', {
                model: request.model,
                messagesCount: request.messages.length
            })

            const llm = this.createChatInstance(request.model, request.temperature)
            const messages = this.convertToLangChainMessages(request.messages)

            const response = await llm.invoke(messages)

            logger.info('[LangChainService] Chat completion successful', {
                responseLength: response.content.toString().length
            })

            return response.content.toString()
        } catch (error: any) {
            logger.error('[LangChainService] Chat completion failed', {
                error: error.message,
                stack: error.stack
            })
            throw new InternalFlowiseError(StatusCodes.BAD_GATEWAY, `LangChain chat failed: ${error.message}`)
        }
    }

    // ========================================================================
    // 2. Streaming Chat
    // ========================================================================

    /**
     * Chat completion with streaming
     */
    async chatStream(
        request: LangChainRequestOptions,
        onChunk: (chunk: string) => void,
        onComplete: () => void,
        onError: (error: Error) => void
    ): Promise<void> {
        try {
            logger.info('[LangChainService] Calling chat completion with streaming', {
                model: request.model,
                messagesCount: request.messages.length
            })

            const llm = this.createChatInstance(request.model, request.temperature)
            const messages = this.convertToLangChainMessages(request.messages)

            const stream = await llm.stream(messages)

            for await (const chunk of stream) {
                const content = chunk.content.toString()
                if (content) {
                    onChunk(content)
                }
            }

            onComplete()
        } catch (error: any) {
            logger.error('[LangChainService] Streaming chat failed', {
                error: error.message,
                stack: error.stack
            })
            onError(error)
        }
    }

    // ========================================================================
    // 3. Chat with Memory
    // ========================================================================

    /**
     * Chat with memory support
     * Maintains conversation history across multiple turns
     */
    async chatWithMemory(request: LangChainRequestOptions, conversationId: string): Promise<string> {
        try {
            logger.info('[LangChainService] Chat with memory', { model: request.model, conversationId })

            const history = await historyStore.getHistory(conversationId)
            const userMessage = request.messages[request.messages.length - 1]

            // Add user message to history
            await history.addMessage(new HumanMessage(userMessage.content))

            // Get all messages and call LLM
            const historyMessages = await history.getMessages()
            const llm = this.createChatInstance(request.model, request.temperature)
            const response = await llm.invoke(historyMessages)

            // Add AI response to history
            await history.addMessage(new AIMessage(response.content.toString()))

            return response.content.toString()
        } catch (error: any) {
            logger.error('[LangChainService] Chat with memory failed', {
                error: error.message,
                stack: error.stack
            })
            throw error
        }
    }

    // ========================================================================
    // 4. Streaming Chat with Memory
    // ========================================================================

    /**
     * Chat with memory and streaming
     */
    async chatWithMemoryStream(
        request: LangChainRequestOptions,
        conversationId: string,
        onChunk: (chunk: string) => void,
        onComplete: (fullResponse: string) => void,
        onError: (error: Error) => void
    ): Promise<void> {
        try {
            logger.info('[LangChainService] Chat with memory and streaming', {
                model: request.model,
                conversationId
            })

            const history = await historyStore.getHistory(conversationId)
            const userMessage = request.messages[request.messages.length - 1]

            // Add user message to history
            await history.addMessage(new HumanMessage(userMessage.content))

            // Get all messages and stream LLM response
            const historyMessages = await history.getMessages()
            const llm = this.createChatInstance(request.model, request.temperature)
            const stream = await llm.stream(historyMessages)

            let fullResponse = ''
            for await (const chunk of stream) {
                const content = chunk.content.toString()
                if (content) {
                    fullResponse += content
                    onChunk(content)
                }
            }

            // Add AI response to history
            await history.addMessage(new AIMessage(fullResponse))

            onComplete(fullResponse)
        } catch (error: any) {
            logger.error('[LangChainService] Chat with memory streaming failed', {
                error: error.message,
                stack: error.stack
            })
            onError(error)
        }
    }

    // ========================================================================
    // Memory Management
    // ========================================================================

    /**
     * Clear conversation history
     */
    async clearConversation(conversationId: string): Promise<void> {
        await historyStore.clearHistory(conversationId)
        logger.info('[LangChainService] Conversation cleared', { conversationId })
    }

    /**
     * Get conversation history
     */
    async getConversationHistory(conversationId: string): Promise<BaseMessage[]> {
        const history = await historyStore.getHistory(conversationId)
        return await history.getMessages()
    }

    /**
     * Clear all conversation histories
     */
    async clearAllConversations(): Promise<void> {
        await historyStore.clearAllHistories()
        logger.info('[LangChainService] All conversations cleared')
    }

    // ========================================================================
    // Health Check
    // ========================================================================

    /**
     * Check if LangChain service is available
     */
    async healthCheck(): Promise<boolean> {
        try {
            const llm = this.createChatInstance(this.defaultModel)
            await llm.invoke([new HumanMessage('ping')])
            return true
        } catch (error) {
            logger.warn('[LangChainService] Health check failed', { error })
            return false
        }
    }

    // ========================================================================
    // Conversation Management
    // ========================================================================

    /**
     * Ensure conversation metadata exists
     * Used when a conversation is created implicitly via chat
     */
    async ensureConversationMetadata(conversationId: string, flowId: string, flowType: string): Promise<void> {
        try {
            const collection = await MongoDBConnection.getCollection('chat_builder_conversations')

            if (collection) {
                // Check if exists
                const existing = await collection.findOne({ conversationId })

                if (!existing) {
                    const now = new Date()
                    const title = `Conversation ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

                    // Create new metadata
                    await collection.insertOne({
                        conversationId,
                        flowId,
                        flowType,
                        title,
                        createdAt: now,
                        updatedAt: now
                    })
                    logger.info('[LangChainService] Created missing conversation metadata', { conversationId, flowId })
                }
            }
        } catch (error: any) {
            logger.error('[LangChainService] Failed to ensure conversation metadata', {
                error: error.message
            })
            // Don't throw, just log - we don't want to break the chat if this fails
        }
    }

    /**
     * Create a new conversation
     */
    async createConversation(flowId: string, flowType: string, title?: string): Promise<string> {
        const conversationId = `${flowId}_${Date.now()}`

        try {
            const collection = await MongoDBConnection.getCollection('chat_builder_conversations')

            if (collection) {
                // Save conversation metadata to MongoDB
                await collection.insertOne({
                    conversationId,
                    flowId,
                    flowType,
                    title: title || `Conversation ${new Date().toLocaleString()}`,
                    createdAt: new Date(),
                    updatedAt: new Date()
                })

                logger.info('[LangChainService] Conversation created in MongoDB', { conversationId, flowId })
            } else {
                // In-memory fallback - just return ID
                logger.info('[LangChainService] Conversation created (in-memory)', { conversationId, flowId })
            }

            return conversationId
        } catch (error: any) {
            logger.error('[LangChainService] Failed to create conversation', {
                error: error.message
            })
            throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Failed to create conversation: ${error.message}`)
        }
    }

    /**
     * Get list of conversations for a flow
     */
    async getConversations(flowId: string, flowType: string): Promise<any[]> {
        try {
            const collection = await MongoDBConnection.getCollection('chat_builder_conversations')

            if (collection) {
                // Query conversations from MongoDB
                const conversations = await collection
                    .find({ flowId, flowType })
                    .sort({ createdAt: -1 })
                    .project({ _id: 0, conversationId: 1, title: 1, createdAt: 1, updatedAt: 1 })
                    .toArray()

                return conversations
            }

            // In-memory fallback - return empty
            return []
        } catch (error: any) {
            logger.error('[LangChainService] Failed to get conversations', {
                error: error.message
            })
            return []
        }
    }

    /**
     * Get conversation detail with messages
     */
    async getConversationDetail(conversationId: string): Promise<any> {
        try {
            const collection = await MongoDBConnection.getCollection('chat_builder_conversations')

            let conversationData: any = null

            if (collection) {
                // Get conversation metadata
                conversationData = await collection.findOne({ conversationId })

                // Get messages from history
                const history = await historyStore.getHistory(conversationId)
                const messages = await history.getMessages()

                return {
                    conversationId,
                    flowId: conversationData?.flowId,
                    flowType: conversationData?.flowType,
                    title: conversationData?.title,
                    createdAt: conversationData?.createdAt,
                    updatedAt: conversationData?.updatedAt,
                    messages: messages.map((msg) => ({
                        role: msg.constructor.name.toLowerCase().replace('message', ''),
                        content: msg.content.toString(),
                        timestamp: new Date() // LangChain doesn't store timestamp
                    }))
                }
            }

            // In-memory fallback
            const history = await historyStore.getHistory(conversationId)
            const messages = await history.getMessages()

            return {
                conversationId,
                messages: messages.map((msg) => ({
                    role: msg.constructor.name.toLowerCase().replace('message', ''),
                    content: msg.content.toString(),
                    timestamp: new Date()
                }))
            }
        } catch (error: any) {
            logger.error('[LangChainService] Failed to get conversation detail', {
                error: error.message
            })
            throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Failed to get conversation detail: ${error.message}`)
        }
    }

    /**
     * Delete conversation
     */
    async deleteConversation(conversationId: string): Promise<void> {
        try {
            const collection = await MongoDBConnection.getCollection('chat_builder_conversations')

            if (collection) {
                // Delete from MongoDB
                await collection.deleteMany({ conversationId })
                logger.info('[LangChainService] Conversation deleted from MongoDB', { conversationId })
            }

            // Clear from memory store
            await historyStore.clearHistory(conversationId)
        } catch (error: any) {
            logger.error('[LangChainService] Failed to delete conversation', {
                error: error.message
            })
            throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Failed to delete conversation: ${error.message}`)
        }
    }

    // ========================================================================
    // Structured Output (For Flow Generation)
    // ========================================================================

    /**
     * Simple chat - for testing only
     * Returns plain text response
     */
    async simpleChat(prompt: string, model: string, temperature: number = 0.7): Promise<string> {
        try {
            logger.info('[LangChainService] Simple chat', { model })

            const llm = this.createChatInstance(model, temperature)
            const messages: BaseMessage[] = [new HumanMessage(prompt)]

            const response = await llm.invoke(messages)

            logger.info('[LangChainService] Simple chat successful', {
                responseLength: response.content.toString().length
            })

            return response.content.toString()
        } catch (error: any) {
            logger.error('[LangChainService] Simple chat failed', {
                error: error.message,
                stack: error.stack
            })
            throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Failed to chat: ${error.message}`)
        }
    }

    /**
     * Generate flow with structured output
     * Uses zod schema to validate JSON response
     */
    async generateFlowWithStructuredOutput(
        prompt: string,
        model: string,
        _availableNodes: string,
        temperature: number = 0.7
    ): Promise<FlowData> {
        try {
            logger.info('[LangChainService] Generating flow with structured output', { model })

            const llm = this.createChatInstance(model, temperature)

            // Define the schema for validation
            const flowSchema = z.object({
                nodes: z.array(
                    z.object({
                        id: z.string(),
                        type: z.string(),
                        position: z.object({
                            x: z.number(),
                            y: z.number()
                        }),
                        data: z
                            .object({
                                id: z.string(),
                                label: z.string(),
                                name: z.string(),
                                type: z.string(),
                                category: z.string(),
                                inputs: z.record(z.any()).optional()
                            })
                            .optional()
                    })
                ),
                edges: z.array(
                    z.object({
                        id: z.string(),
                        source: z.string(),
                        target: z.string(),
                        sourceHandle: z.string().optional(),
                        targetHandle: z.string().optional()
                    })
                ),
                viewport: z
                    .object({
                        x: z.number(),
                        y: z.number(),
                        zoom: z.number()
                    })
                    .optional()
            })

            // Simple prompt - just ask for JSON
            const systemPrompt = `You are a helpful assistant. Return valid JSON response.

Format:
{
  "nodes": [{"id": "1", "type": "customNode", "position": {"x": 100, "y": 100}}],
  "edges": [],
  "viewport": {"x": 0, "y": 0, "zoom": 1}
}`

            const messages: BaseMessage[] = [new SystemMessage(systemPrompt), new HumanMessage(prompt)]

            // Invoke LLM
            const response = await llm.invoke(messages)
            const responseText = response.content.toString()

            logger.info('[LangChainService] LLM response received', { responseLength: responseText.length })

            // Extract JSON from response
            let jsonText = responseText.trim()

            // Remove markdown code blocks if present
            const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
            if (codeBlockMatch) {
                jsonText = codeBlockMatch[1]
            }

            // Try to find JSON object in the text
            const objectMatch = jsonText.match(/\{[\s\S]*\}/)
            if (objectMatch) {
                jsonText = objectMatch[0]
            }

            // Parse JSON
            let parsedData: any
            try {
                parsedData = JSON.parse(jsonText)
            } catch (parseError) {
                logger.error('[LangChainService] JSON parse failed', { jsonText, parseError })
                throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, 'Failed to parse JSON response from LLM')
            }

            // Validate with zod schema
            const validationResult = flowSchema.safeParse(parsedData)
            if (!validationResult.success) {
                logger.error('[LangChainService] Schema validation failed', {
                    errors: validationResult.error.errors
                })
                throw new InternalFlowiseError(
                    StatusCodes.INTERNAL_SERVER_ERROR,
                    `Generated flow has invalid structure: ${validationResult.error.errors.map((e) => e.message).join(', ')}`
                )
            }

            const result = validationResult.data

            logger.info('[LangChainService] Flow generation with structured output successful', {
                nodesCount: result.nodes.length,
                edgesCount: result.edges.length
            })

            return result
        } catch (error: any) {
            if (error instanceof InternalFlowiseError) {
                throw error
            }
            logger.error('[LangChainService] Structured output generation failed', {
                error: error.message,
                stack: error.stack
            })
            throw new InternalFlowiseError(
                StatusCodes.INTERNAL_SERVER_ERROR,
                `Failed to generate flow with structured output: ${error.message}`
            )
        }
    }
}

// ============================================================================
// Export Interfaces
// ============================================================================

export interface FlowNode {
    id: string
    type: string
    position: { x: number; y: number }
    data?: {
        id: string
        label: string
        name: string
        type: string
        category: string
        inputs?: Record<string, any>
    }
}

export interface FlowEdge {
    id: string
    source: string
    target: string
    sourceHandle?: string
    targetHandle?: string
}

export interface FlowData {
    nodes: FlowNode[]
    edges: FlowEdge[]
    viewport?: {
        x: number
        y: number
        zoom: number
    }
}

// Export singleton instance
export default new LangChainService()
