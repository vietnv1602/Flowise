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
import { isEqual } from 'lodash'
import logger from '../../utils/logger'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { StatusCodes } from 'http-status-codes'
import nodesService from '../nodes'

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
    flowType?: 'chatflow' | 'agentflow'
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

    // ========================================================================
    // Node Initialization Helpers (ported from genericHelper.js)
    // ========================================================================

    /**
     * Initialize default values for node inputs
     */
    private initializeDefaultNodeData(nodeParams: any[]): Record<string, any> {
        const initialValues: Record<string, any> = {}

        for (const input of nodeParams) {
            initialValues[input.name] = input.default !== undefined ? input.default : ''
        }

        return initialValues
    }

    /**
     * Create output anchors for agentflow
     */
    private createAgentFlowOutputs(nodeData: any, newNodeId: string): any[] {
        if (nodeData.hideOutput) return []

        if (nodeData.outputs?.length) {
            return nodeData.outputs.map((_: any, index: number) => ({
                id: `${newNodeId}-output-${index}`,
                label: nodeData.label,
                name: nodeData.name
            }))
        }

        return [
            {
                id: `${newNodeId}-output-${nodeData.name}`,
                label: nodeData.label,
                name: nodeData.name
            }
        ]
    }

    /**
     * Create output option for standard outputs
     */
    private createOutputOption(output: any, newNodeId: string): any {
        const outputBaseClasses = output.baseClasses ?? []
        const baseClasses = outputBaseClasses.length > 1 ? outputBaseClasses.join('|') : outputBaseClasses[0] || ''
        const type = outputBaseClasses.length > 1 ? outputBaseClasses.join(' | ') : outputBaseClasses[0] || ''

        return {
            id: `${newNodeId}-output-${output.name}-${baseClasses}`,
            name: output.name,
            label: output.label,
            description: output.description ?? '',
            type,
            isAnchor: output?.isAnchor,
            hidden: output?.hidden
        }
    }

    /**
     * Create standard outputs for chatflow
     */
    private createStandardOutputs(nodeData: any, newNodeId: string): any[] {
        if (nodeData.hideOutput) return []

        if (nodeData.outputs?.length) {
            const outputOptions = nodeData.outputs.map((output: any) => this.createOutputOption(output, newNodeId))

            return [
                {
                    name: 'output',
                    label: 'Output',
                    type: 'options',
                    description: nodeData.outputs[0].description ?? '',
                    options: outputOptions,
                    default: nodeData.outputs[0].name
                }
            ]
        }

        return [
            {
                id: `${newNodeId}-output-${nodeData.name}-${nodeData.baseClasses.join('|')}`,
                name: nodeData.name,
                label: nodeData.type,
                description: nodeData.description ?? '',
                type: nodeData.baseClasses.join(' | ')
            }
        ]
    }

    /**
     * Initialize output anchors based on flow type
     */
    private initializeOutputAnchors(nodeData: any, newNodeId: string, isAgentflow: boolean): any[] {
        return isAgentflow ? this.createAgentFlowOutputs(nodeData, newNodeId) : this.createStandardOutputs(nodeData, newNodeId)
    }

    /**
     * Apply show/hide logic to input params and anchors
     */
    private applyShowHideLogic(nodeData: any, params: any[], inputValues: Record<string, any>): any[] {
        const processedParams: any[] = []

        for (const inputParam of params) {
            const param = { ...inputParam }
            param.display = true

            if (param.show) {
                this.processShowHideConditions(nodeData, param, param.show, inputValues, true)
            }
            if (param.hide) {
                this.processShowHideConditions(nodeData, param, param.hide, inputValues, false)
            }

            processedParams.push(param)
        }

        return processedParams
    }

    /**
     * Process show/hide conditions for a parameter
     */
    private processShowHideConditions(
        _nodeData: any,
        inputParam: any,
        conditions: Record<string, any>,
        inputValues: Record<string, any>,
        isShow: boolean
    ): void {
        Object.keys(conditions).forEach((path) => {
            const comparisonValue = conditions[path]
            let groundValue = inputValues[path]

            // Handle array values
            if (groundValue && typeof groundValue === 'string' && groundValue.startsWith('[') && groundValue.endsWith(']')) {
                try {
                    groundValue = JSON.parse(groundValue)
                } catch (e) {
                    // Keep as string
                }
            }

            if (Array.isArray(groundValue)) {
                if (Array.isArray(comparisonValue)) {
                    const hasIntersection = comparisonValue.some((val) => groundValue.includes(val))
                    if (isShow && !hasIntersection) {
                        inputParam.display = false
                    }
                    if (!isShow && hasIntersection) {
                        inputParam.display = false
                    }
                } else if (typeof comparisonValue === 'string') {
                    const matchFound = groundValue.some((val) => comparisonValue === val)
                    if (isShow && !matchFound) {
                        inputParam.display = false
                    }
                    if (!isShow && matchFound) {
                        inputParam.display = false
                    }
                } else if (typeof comparisonValue === 'boolean' || typeof comparisonValue === 'number') {
                    const matchFound = groundValue.includes(comparisonValue)
                    if (isShow && !matchFound) {
                        inputParam.display = false
                    }
                    if (!isShow && matchFound) {
                        inputParam.display = false
                    }
                } else if (typeof comparisonValue === 'object' && comparisonValue !== null) {
                    // Object comparison for array elements
                    const matchFound = groundValue.some((val) => isEqual(comparisonValue, val))
                    if (isShow && !matchFound) {
                        inputParam.display = false
                    }
                    if (!isShow && matchFound) {
                        inputParam.display = false
                    }
                }
            } else {
                if (Array.isArray(comparisonValue)) {
                    if (isShow && !comparisonValue.includes(groundValue)) {
                        inputParam.display = false
                    }
                    if (!isShow && comparisonValue.includes(groundValue)) {
                        inputParam.display = false
                    }
                } else if (typeof comparisonValue === 'string') {
                    if (isShow && comparisonValue !== groundValue) {
                        inputParam.display = false
                    }
                    if (!isShow && comparisonValue === groundValue) {
                        inputParam.display = false
                    }
                } else if (typeof comparisonValue === 'boolean') {
                    if (isShow && comparisonValue !== groundValue) {
                        inputParam.display = false
                    }
                    if (!isShow && comparisonValue === groundValue) {
                        inputParam.display = false
                    }
                } else if (typeof comparisonValue === 'number') {
                    if (isShow && comparisonValue !== groundValue) {
                        inputParam.display = false
                    }
                    if (!isShow && comparisonValue === groundValue) {
                        inputParam.display = false
                    }
                } else if (typeof comparisonValue === 'object' && comparisonValue !== null) {
                    // Object comparison for non-array values
                    const objectsAreEqual = isEqual(comparisonValue, groundValue)
                    if (isShow && !objectsAreEqual) {
                        inputParam.display = false
                    }
                    if (!isShow && objectsAreEqual) {
                        inputParam.display = false
                    }
                }
            }
        })
    }

    /**
     * Initialize node data similar to frontend's initNode function
     * This creates the exact same structure as when dragging and dropping manually
     */
    private initNodeData(nodeTemplate: any, newNodeId: string, aiParams: Record<string, any>, isAgentflow: boolean): any {
        const inputAnchors: any[] = []
        const inputParams: any[] = []

        const whitelistTypes = [
            'asyncOptions',
            'asyncMultiOptions',
            'options',
            'multiOptions',
            'array',
            'datagrid',
            'string',
            'number',
            'boolean',
            'password',
            'json',
            'code',
            'date',
            'file',
            'folder',
            'tabs',
            'conditionFunction'
        ]

        // Process inputs - separate into inputAnchors and inputParams
        if (nodeTemplate.inputs) {
            for (const input of nodeTemplate.inputs) {
                const newInput = {
                    ...input,
                    id: `${newNodeId}-input-${input.name}-${input.type}`
                }
                if (whitelistTypes.includes(input.type)) {
                    inputParams.push(newInput)
                } else {
                    inputAnchors.push(newInput)
                }
            }

            // Handle credential
            if (nodeTemplate.credential) {
                const newInput = {
                    ...nodeTemplate.credential,
                    id: `${newNodeId}-input-${nodeTemplate.credential.name}-${nodeTemplate.credential.type}`
                }
                inputParams.unshift(newInput)
            }
        }

        // Initialize default values for inputs
        const defaultInputs = this.initializeDefaultNodeData(nodeTemplate.inputs || [])

        // Merge AI params on top of defaults
        const mergedInputs = { ...defaultInputs }
        for (const key in aiParams) {
            mergedInputs[key] = aiParams[key]
        }

        // Initialize output anchors
        const outputAnchors = this.initializeOutputAnchors(nodeTemplate, newNodeId, isAgentflow)

        // Apply show/hide logic
        const nodeWithInputs = {
            ...nodeTemplate,
            inputs: mergedInputs
        }

        const processedInputAnchors = this.applyShowHideLogic(nodeWithInputs, inputAnchors, mergedInputs)
        const processedInputParams = this.applyShowHideLogic(nodeWithInputs, inputParams, mergedInputs)

        // Build final node data
        const nodeData: any = {
            id: newNodeId,
            name: nodeTemplate.name,
            label: nodeTemplate.label,
            type: nodeTemplate.type,
            category: nodeTemplate.category,
            baseClasses: nodeTemplate.baseClasses,
            icon: nodeTemplate.icon,
            color: nodeTemplate.color,
            description: nodeTemplate.description,
            inputs: mergedInputs,
            inputAnchors: processedInputAnchors,
            inputParams: processedInputParams,
            outputAnchors: outputAnchors,
            outputs: this.initializeDefaultNodeData(outputAnchors),
            selected: false
        }

        // Handle credential
        if (nodeTemplate.credential) {
            nodeData.credential = ''
        }

        return nodeData
    }

    // ========================================================================
    // Safe Flow Builder
    // ========================================================================

    /**
     * Safely construct a flow from simplified AI output
     */
    private async constructFlow(simplifiedNodes: any[], simplifiedEdges: any[], flowType: string, idMap: Record<string, string>): Promise<any> {
        let fullNodes: any[] = []
        const fullEdges: any[] = []
        // idMap is now passed by reference and persisted across calls

        const normalizedFlowType = (flowType || 'chatflow').toLowerCase()
        const reactFlowType = normalizedFlowType === 'agentflow' ? 'agentFlow' : 'customNode'

        // 0. Pre-processing: Ensure Agentflow has Start Node
        if (normalizedFlowType === 'agentflow') {
            const hasStart = simplifiedNodes.some(n => n.type === 'Start' || n.label === 'Start')
            if (!hasStart) {
                // Only add start node if we haven't already (check using a stable pseudo-ID)
                if (!idMap['start_auto']) {
                    simplifiedNodes.unshift({
                        id: 'start_auto',
                        type: 'Start',
                        label: 'Start',
                        params: {}
                    })
                }
            }
        }
        // 1. First pass: Assign UUIDs and Initialize Nodes using initNodeData (same as manual drag-drop)
        for (const sNode of simplifiedNodes) {
            try {
                // Generate robust ID or reuse existing
                if (!idMap[sNode.id]) {
                    idMap[sNode.id] = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                }
                const uuid = idMap[sNode.id]

                // Fetch full node spec
                const nodeTemplate = await nodesService.getNodeByName(sNode.type) as any

                // Validate node template exists
                if (!nodeTemplate) {
                    logger.warn(`[constructFlow] Node type '${sNode.type}' not found, skipping node`)
                    continue
                }

                // Use initNodeData to create the exact same structure as when dragging and dropping manually
                // This ensures proper inputParams, inputAnchors, outputAnchors, and default values
                const nodeData = this.initNodeData(nodeTemplate, uuid, sNode.params || {}, normalizedFlowType === 'agentflow')

                // Override label if AI provided one
                if (sNode.label) {
                    nodeData.label = sNode.label
                }

                // Construct the node with ReactFlow structure
                const node: any = {
                    id: uuid,
                    data: nodeData,
                    type: reactFlowType, // 'agentFlow' or 'customNode'
                    position: { x: 0, y: 0 }
                }

                // Sanitize Position
                if (sNode.position && typeof sNode.position === 'object') {
                    const x = parseFloat(sNode.position.x)
                    const y = parseFloat(sNode.position.y)

                    if (!isNaN(x) && !isNaN(y)) {
                        node.position = { x, y }
                        ;(node as any).manualLayout = true
                    }
                }

                fullNodes.push(node)
            } catch (e) {
                logger.warn(`[SafeBuilder] Failed to hydrate node ${sNode.type}`, e)
            }
        }

        // 2. Second pass: Construct Edges & Auto-Layout
        let layoutX = 100
        const layoutY = 200
        const spacingX = 400

        // Simple layout: Linear using topological sort approximation or just order
        // For now: Linear

        for (let i = 0; i < fullNodes.length; i++) {
            if (!(fullNodes[i] as any).manualLayout) {
                fullNodes[i].position = { x: layoutX, y: layoutY }
                layoutX += spacingX
            } else {
                // If manual, we clean up the marker property before sending to client
                delete (fullNodes[i] as any).manualLayout
            }
        }

        for (const sEdge of simplifiedEdges) {
            const sourceId = idMap[sEdge.source]
            const targetId = idMap[sEdge.target]

            if (sourceId && targetId) {
                // Find source and target nodes to resolve handles
                const sourceNode = fullNodes.find(n => n.id === sourceId)
                const targetNode = fullNodes.find(n => n.id === targetId)

                let sourceHandle = sEdge.sourceHandle
                let targetHandle = sEdge.targetHandle

                // For Agentflow v2: connections are from node ID to node ID (no handles)
                if (normalizedFlowType === 'agentflow') {
                    sourceHandle = sourceId
                    targetHandle = targetId
                } else {
                    // For Chatflow: Validate and resolve handles

                    // Validate Source Handle - find first matching output anchor
                    if (sourceNode?.data?.outputAnchors) {
                        const outputAnchors = sourceNode.data.outputAnchors

                        // Handle options type (dropdown outputs)
                        if (outputAnchors.length > 0 && outputAnchors[0].type === 'options') {
                            const options = outputAnchors[0].options || []
                            const exists = options.some((a: any) => a.id === sourceHandle)
                            if (!exists) {
                                if (options.length > 0) {
                                    sourceHandle = options[0].id
                                } else {
                                    // No output options available - skip this edge
                                    logger.warn(`[constructFlow] No output options available for node ${sourceId}, skipping edge`)
                                    continue
                                }
                            }
                        } else {
                            // Handle direct output anchors
                            const exists = outputAnchors.some((a: any) => a.id === sourceHandle)
                            if (!exists) {
                                if (outputAnchors.length > 0) {
                                    sourceHandle = outputAnchors[0].id
                                } else {
                                    logger.warn(`[constructFlow] No output anchors available for node ${sourceId}, skipping edge`)
                                    continue
                                }
                            }
                        }
                    }

                    // Validate Target Handle
                    if (targetNode?.data?.inputAnchors) {
                        const exists = targetNode.data.inputAnchors.some((a: any) => a.id === targetHandle)
                        if (!exists) {
                            if (targetNode.data.inputAnchors.length > 0) {
                                targetHandle = targetNode.data.inputAnchors[0].id
                            } else {
                                logger.warn(`[constructFlow] No input anchors available for node ${targetId}, skipping edge`)
                                continue
                            }
                        }
                    }
                }

                fullEdges.push({
                    source: sourceId,
                    sourceHandle: sourceHandle || null,
                    target: targetId,
                    targetHandle: targetHandle || null,
                    type: normalizedFlowType === 'agentflow' ? 'agentFlow' : 'custom',
                    id: `edge_${sourceId}_${targetId}`
                })
            }
        }

        return {
            nodes: fullNodes,
            edges: fullEdges,
            viewport: { x: 0, y: 0, zoom: 1 },
            __hydrated: true
        }
    }
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
                conversationId,
                flowType: request.flowType
            })

            const history = await historyStore.getHistory(conversationId)
            const userMessage = request.messages[request.messages.length - 1]

            // 1. Tool Definitions
            const getNodeDetailsTool = {
                type: 'function',
                function: {
                    name: 'get_node_details',
                    description: 'Get detailed specific inputs, parameters, and description of a specific node by its name.',
                    parameters: {
                        type: 'object',
                        properties: {
                            nodeName: {
                                type: 'string',
                                description: 'The exact name of the node to look up (e.g. "chatOpenAI", "bufferMemory")'
                            }
                        },
                        required: ['nodeName']
                    }
                }
            }

            const addNodeTool = {
                type: 'function',
                function: {
                    name: 'add_node',
                    description: 'Simulates dragging and dropping a node onto the canvas.',
                    parameters: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: 'Unique ID for this node (e.g. "node1", "agent1")' },
                            type: { type: 'string', description: 'Node name from Available Nodes (e.g. "chatOpenAI", "mcpTool")' },
                            params: { type: 'object', description: 'Input parameters for the node' },
                            label: { type: 'string', description: 'Display name for the node' },
                            position: {
                                type: 'object',
                                description: 'Optional: Drop position {x, y}. If omitted, auto-layout will be used.',
                                properties: {
                                    x: { type: 'number' },
                                    y: { type: 'number' }
                                }
                            }
                        },
                        required: ['id', 'type']
                    }
                }
            }

            const connectNodesTool = {
                type: 'function',
                function: {
                    name: 'connect_nodes',
                    description: 'Simulates connecting two nodes with a wire on the canvas.',
                    parameters: {
                        type: 'object',
                        properties: {
                            source: { type: 'string', description: 'Source node ID' },
                            target: { type: 'string', description: 'Target node ID' },
                            sourceHandle: { type: 'string' },
                            targetHandle: { type: 'string' }
                        },
                        required: ['source', 'target']
                    }
                }
            }

            const finishFlowTool = {
                type: 'function',
                function: {
                    name: 'finish_flow',
                    description: 'Simulates clicking the Save button to persist the flow and render it.',
                    parameters: {
                        type: 'object',
                        properties: {},
                        required: []
                    }
                }
            }

            const tools = [getNodeDetailsTool, addNodeTool, connectNodesTool, finishFlowTool]

            // Inject available nodes into system prompt (Static high-level list)
            let systemContextMessages: BaseMessage[] = []
            if (request.flowType) {
                try {
                    const normalizedFlowType = (request.flowType || 'chatflow').toLowerCase()
                    const filteredNodes = await nodesService.getAllNodes({ flowType: normalizedFlowType })

                    // Group for display
                    const grouped: Record<string, string[]> = {}
                    for (const node of filteredNodes) {
                        if (!grouped[node.category]) grouped[node.category] = []
                        grouped[node.category].push(`- ${node.label} (Name: ${node.name}): ${node.description}`)
                    }

                    let nodesList = ''
                    for (const [cat, items] of Object.entries(grouped)) {
                        nodesList += `\n> ${cat}:\n${items.join('\n')}\n`
                    }

                    let systemPrompt = `You are a helpful assistant for building Flowise flows.
Current context: ${normalizedFlowType === 'agentflow' ? 'Agentflow (Multi-Agent System)' : 'Chatflow (Standard Chatbot)'}.

AVAILABLE NODES (Reference):
${nodesList}


1. To understand a node's specific inputs (required params, options), use 'get_node_details(nodeName)'.
2. Do NOT guess inputs. Always check details for complex nodes.
3. SIMULATE USER ACTIONS to build the flow:
   - "Drag & Drop": Call 'add_node' for each node (you can provide optional x,y coordinates).
   - "Connect": Call 'connect_nodes' to wire them up.
   - "Save": FINALLY call 'finish_flow' to render the result.
4. 'finish_flow' will handle layout and UUID generation.
5. If the user just wants to chat, just reply with text.

IMPORTANT:
- Agentflow: Must start with 'Start' node (search for 'Start' node).
- Agentflow: Use 'Agent', 'Tool', 'Chat Model' nodes. NO Chains.
`
                    systemContextMessages.push(new SystemMessage(systemPrompt))
                } catch (e) {
                    logger.error('[LangChainService] Failed to generate system prompt', e)
                }
            }

            // Add user message to history
            await history.addMessage(new HumanMessage(userMessage.content))
            const historyMessages = await history.getMessages()

            // Safe Builder Reminder
            const reminderMessage = new SystemMessage("REMINDER: Simulate user actions: Drag nodes (add_node) -> Connect them (connect_nodes) -> Save (finish_flow).")

            let currentMessages = [...systemContextMessages, ...historyMessages, reminderMessage]

            // 2. Loop Execution (Manual Agent Loop)
            const MAX_ITERATIONS = 25
            const llm = this.createChatInstance(request.model, request.temperature).bindTools(tools)

            let finalResponseText = ''
            const accumulatedNodes: any[] = []
            const accumulatedEdges: any[] = []
            const idMap: Record<string, string> = {} // Consistent IDs across iterations

            for (let i = 0; i < MAX_ITERATIONS; i++) {
                // Call LLM
                const response = await llm.invoke(currentMessages)

                // Append AI response to messages context
                currentMessages.push(response)

                const toolCalls = response.tool_calls

                if (toolCalls && toolCalls.length > 0) {
                    // Handle Tool Calls
                    for (const toolCall of toolCalls) {
                        let toolResult = ''

                        if (toolCall.name === 'get_node_details') {
                            const { nodeName } = toolCall.args
                            onChunk(`\n*Checking node details for: ${nodeName}...*\n`)
                            try {
                                const node = await nodesService.getNodeByName(nodeName)
                                const slimNode = {
                                    name: node.name,
                                    label: node.label,
                                    inputs: node.inputs,
                                    category: node.category,
                                    description: node.description
                                }
                                toolResult = JSON.stringify(slimNode)
                            } catch (error) {
                                toolResult = `Error: Node '${nodeName}' not found.`
                            }
                        } else if (toolCall.name === 'add_node') {
                            const nodeData = toolCall.args
                            accumulatedNodes.push(nodeData)
                            onChunk(`\n*Added node: ${nodeData.label || nodeData.type}*\n`)

                            // Incremental Render
                            try {
                                const flowData = await this.constructFlow(accumulatedNodes, accumulatedEdges, request.flowType || 'chatflow', idMap)
                                const jsonBlock = `\`\`\`json\n${JSON.stringify(flowData, null, 2)}\n\`\`\`\n`
                                onChunk(jsonBlock)
                                toolResult = `Node '${nodeData.id}' added and rendered.`
                            } catch (e: any) {
                                toolResult = `Node added but render failed: ${e.message}`
                            }

                        } else if (toolCall.name === 'connect_nodes') {
                            const edgeData = toolCall.args
                            accumulatedEdges.push(edgeData)
                            onChunk(`\n*Connected: ${edgeData.source} -> ${edgeData.target}*\n`)

                            // Incremental Render
                            try {
                                const flowData = await this.constructFlow(accumulatedNodes, accumulatedEdges, request.flowType || 'chatflow', idMap)
                                const jsonBlock = `\`\`\`json\n${JSON.stringify(flowData, null, 2)}\n\`\`\`\n`
                                onChunk(jsonBlock)
                                toolResult = 'Connection recorded and rendered.'
                            } catch (e: any) {
                                toolResult = `Connection recorded but render failed: ${e.message}`
                            }

                        } else if (toolCall.name === 'finish_flow') {
                            onChunk(`\n*Finalizing flow...*\n`)

                            try {
                                // Final Render
                                const flowData = await this.constructFlow(accumulatedNodes, accumulatedEdges, request.flowType || 'chatflow', idMap)

                                const jsonBlock = `\`\`\`json
${JSON.stringify(flowData, null, 2)}
\`\`\`
`
                                finalResponseText += jsonBlock
                                onChunk(jsonBlock)
                                toolResult = 'Flow generated successfully.'

                                // End the loop
                                i = MAX_ITERATIONS
                            } catch (e: any) {
                                logger.error('[LangChainService] Error constructing flow', e)
                                toolResult = `Error constructing flow: ${e.message}`
                                onChunk(`\n*Error: ${e.message}*\n`)
                            }
                        }

                        currentMessages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: toolResult,
                            name: toolCall.name
                        } as any)
                    }
                } else {
                    // Normal text response
                    const content = response.content.toString()
                    finalResponseText += content
                    onChunk(content)
                    break // Stop loop if no tool calls
                }
            }

            // Save final valid response to history
            await history.addMessage(new AIMessage(finalResponseText))

            onComplete(finalResponseText)


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

                // Helper to deduplicate messages
                const cleanMessages = (msgs: BaseMessage[]) => {
                    const cleaned: BaseMessage[] = []

                    // 1. Remove adjacent duplicates
                    for (let i = 0; i < msgs.length; i++) {
                        const current = msgs[i]
                        const prev = cleaned[cleaned.length - 1]

                        if (prev &&
                            prev.content.toString() === current.content.toString() &&
                            prev.constructor.name === current.constructor.name) {
                            continue
                        }
                        cleaned.push(current)
                    }

                    // 2. Check for full history duplication (A, B, C, A, B, C)
                    // Only check if we have even number of messages and length > 2
                    if (cleaned.length > 2 && cleaned.length % 2 === 0) {
                        const mid = cleaned.length / 2
                        const firstHalf = cleaned.slice(0, mid)
                        const secondHalf = cleaned.slice(mid)

                        let isExactDup = true
                        for (let i = 0; i < mid; i++) {
                            if (firstHalf[i].content.toString() !== secondHalf[i].content.toString() ||
                                firstHalf[i].constructor.name !== secondHalf[i].constructor.name) {
                                isExactDup = false
                                break
                            }
                        }

                        if (isExactDup) {
                            return firstHalf
                        }
                    }

                    return cleaned
                }

                const uniqueMessages = cleanMessages(messages)

                return {
                    conversationId,
                    flowId: conversationData?.flowId,
                    flowType: conversationData?.flowType,
                    title: conversationData?.title,
                    createdAt: conversationData?.createdAt,
                    updatedAt: conversationData?.updatedAt,
                    messages: uniqueMessages.map((msg, index) => ({
                        role: msg.constructor.name.toLowerCase().replace('message', ''),
                        content: msg.content.toString(),
                        timestamp: new Date(), // LangChain doesn't store timestamp
                        id: `${conversationId}_${index}` // Stable ID creation
                    }))
                }
            }

            // In-memory fallback
            const history = await historyStore.getHistory(conversationId)
            const messages = await history.getMessages()

            return {
                conversationId,
                messages: messages.map((msg, index) => ({
                    role: msg.constructor.name.toLowerCase().replace('message', ''),
                    content: msg.content.toString(),
                    timestamp: new Date(),
                    id: `${conversationId}_${index}`
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
