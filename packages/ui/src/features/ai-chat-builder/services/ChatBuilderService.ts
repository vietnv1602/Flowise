/**
 * Chat Builder Service Implementation
 *
 * Main service for AI-powered flow generation.
 * Implements the IChatBuilderService interface.
 */

import {
    ChatBuilderRequest,
    ChatBuilderResponse,
    FlowJSON,
    ValidationResult,
    CostEstimate,
    AIProvider,
    CredentialInfo,
    ProviderConfig,
    Conversation,
    ConversationDetail
} from '../types'
import { IChatBuilderService } from './IChatBuilderService'
import { buildGenerationPrompt, estimateTokens } from '../utils/promptTemplates'
import { validateFlow, sanitizeFlowData } from '../utils/flowValidators'

/**
 * Default service configuration
 */
const DEFAULT_CONFIG = {
    apiBaseURL: '/api/v1',
    timeout: 120000, // 2 minutes
    maxRetries: 3,
    enableLogging: false
}

/**
 * Main Chat Builder Service
 */
export class ChatBuilderService implements IChatBuilderService {
    private config: ChatBuilderServiceConfig
    private abortController: AbortController | null = null

    constructor(config?: Partial<ChatBuilderServiceOptions>) {
        this.config = {
            ...DEFAULT_CONFIG,
            ...config
        }
    }

    /**
     * Chat with streaming response
     */
    async chatStream(
        message: string,
        model: string,
        flowId: string,
        flowType: 'chatflow' | 'agentflow',
        conversationId?: string,
        onChunk?: (chunk: string) => void,
        onComplete?: (fullResponse: string) => void,
        onError?: (error: string) => void,
        onSessionId?: (sessionId: string) => void
    ): Promise<string> {
        const response = await fetch(`${this.config.apiBaseURL}/chat-builder/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                model,
                flowId,
                flowType,
                conversationId
            })
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }))
            throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`)
        }

        const reader = response.body?.getReader()
        if (!reader) {
            throw new Error('Response body is not readable')
        }

        const decoder = new TextDecoder()
        let fullResponse = ''
        let responseConversationId = ''

        try {
            while (true) {
                const { done, value } = await reader.read()

                if (done) break

                const chunk = decoder.decode(value, { stream: true })
                const lines = chunk.split('\n')

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6))

                            if (data.type === 'conversationId') {
                                responseConversationId = data.data
                                onSessionId?.(responseConversationId)
                            } else if (data.type === 'chunk') {
                                fullResponse += data.data
                                onChunk?.(data.data)
                            } else if (data.type === 'done') {
                                fullResponse = data.data
                                onComplete?.(fullResponse)
                            } else if (data.type === 'error') {
                                onError?.(data.data)
                                throw new Error(data.data)
                            }
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }

            return fullResponse
        } finally {
            reader.releaseLock()
        }
    }

    /**
     * Generate a flow based on natural language description
     */
    async generateFlow(request: ChatBuilderRequest): Promise<ChatBuilderResponse> {
        // Use simple chat instead of complex flow generation
        const responseText = await this.chatStream(
            request.description,
            request.model || 'gpt-4o-mini',
            'default',
            'chatflow'
        )

        // Return a simple response (not flow data for now)
        return {
            flowData: {
                nodes: [],
                edges: [],
                viewport: { x: 0, y: 0, zoom: 1 }
            },
            metadata: {
                provider: request.selectedProvider || 'llmhub',
                model: request.model || 'gpt-4o-mini',
                tokensUsed: responseText.length,
                timestamp: new Date(),
                version: '1.0.0'
            },
            nodes: [],
            edges: []
        }
    }

    /**
     * Validate a generated flow
     */
    async validateFlow(flowData: FlowJSON): Promise<ValidationResult> {
        // Client-side validation
        const clientValidation = validateFlow(flowData)

        // Server-side validation (additional checks)
        try {
            const response = await fetch(`${this.config.apiBaseURL}/chat-builder/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ flowData })
            })

            if (response.ok) {
                const serverValidation = await response.json()

                // Merge client and server validation results
                return {
                    isValid: clientValidation.isValid && serverValidation.isValid,
                    errors: [...clientValidation.errors, ...(serverValidation.errors || [])],
                    warnings: [...clientValidation.warnings, ...(serverValidation.warnings || [])]
                }
            }
        } catch (error) {
            // If server validation fails, return client validation only
            if (this.config.enableLogging) {
                console.warn('Server validation failed, using client validation only:', error)
            }
        }

        return clientValidation
    }

    /**
     * Get available AI providers
     */
    async getAvailableProviders(): Promise<ProviderConfig[]> {
        try {
            const response = await fetch(`${this.config.apiBaseURL}/chat-builder/providers`)
            if (response.ok) {
                const data = await response.json()
                return data.providers || []
            }
        } catch (error) {
            if (this.config.enableLogging) {
                console.error('Failed to fetch providers:', error)
            }
        }

        // Return default providers if API call fails
        return this.getDefaultProviders()
    }

    /**
     * Get user's configured credentials
     */
    async getCredentials(provider?: AIProvider): Promise<CredentialInfo[]> {
        try {
            const url = provider ? `${this.config.apiBaseURL}/credentials?provider=${provider}` : `${this.config.apiBaseURL}/credentials`

            const response = await fetch(url)
            if (response.ok) {
                const data = await response.json()
                return (data.credentials || []).map((cred: any) => ({
                    id: cred.id,
                    name: cred.name,
                    provider: cred.credentialName,
                    isSelected: false
                }))
            }
        } catch (error) {
            if (this.config.enableLogging) {
                console.error('Failed to fetch credentials:', error)
            }
        }

        return []
    }

    /**
     * Estimate generation cost
     */
    async estimateCost(request: ChatBuilderRequest): Promise<CostEstimate> {
        const prompt = buildGenerationPrompt(request)
        const estimatedTokens = estimateTokens(prompt) * 2 // Account for response

        // Default cost estimates (per 1M tokens)
        const costPerMillionTokens: Record<AIProvider, number> = {
            openai: 30, // GPT-4
            anthropic: 30, // Claude
            'azure-openai': 30,
            cohere: 15,
            google: 10,
            custom: 5,
            llmhub: 5
        }

        const provider = request.selectedProvider
        const costPerToken = costPerMillionTokens[provider] / 1_000_000

        return {
            estimatedTokens,
            estimatedCostUSD: estimatedTokens * costPerToken,
            provider,
            model: 'estimated'
        }
    }

    /**
     * Cancel ongoing generation
     */
    cancelGeneration(): void {
        if (this.abortController) {
            this.abortController.abort()
            this.abortController = null
        }
    }

    /**
     * Check if service is ready
     */
    async isReady(): Promise<boolean> {
        try {
            const response = await fetch(`${this.config.apiBaseURL}/chat-builder/health`)
            return response.ok
        } catch {
            return false
        }
    }

    /**
     * Create a new conversation
     */
    async createConversation(flowId: string, flowType: 'chatflow' | 'agentflow', title?: string): Promise<string> {
        const response = await fetch(`${this.config.apiBaseURL}/chat-builder/conversations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ flowId, flowType, title })
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }))
            throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        return data.conversationId
    }

    /**
     * Get list of conversations for a flow
     */
    async getConversations(flowId: string, flowType: 'chatflow' | 'agentflow'): Promise<Conversation[]> {
        const response = await fetch(
            `${this.config.apiBaseURL}/chat-builder/conversations?flowId=${encodeURIComponent(flowId)}&flowType=${encodeURIComponent(flowType)}`
        )

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }))
            throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        return data.conversations || []
    }

    /**
     * Get conversation detail with messages
     */
    async getConversationDetail(conversationId: string): Promise<ConversationDetail> {
        const response = await fetch(`${this.config.apiBaseURL}/chat-builder/conversations/${encodeURIComponent(conversationId)}`)

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }))
            throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`)
        }

        return await response.json()
    }

    /**
     * Delete a conversation
     */
    async deleteConversation(conversationId: string): Promise<void> {
        const response = await fetch(`${this.config.apiBaseURL}/chat-builder/conversations/${encodeURIComponent(conversationId)}`, {
            method: 'DELETE'
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }))
            throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`)
        }
    }

    /**
     * Get default providers (fallback)
     */
    private getDefaultProviders(): ProviderConfig[] {
        return [
            {
                id: 'openai',
                name: 'openai',
                displayName: 'OpenAI (GPT-4)',
                models: ['gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo'],
                requiresCredential: true,
                defaultModel: 'gpt-4-turbo-preview'
            },
            {
                id: 'anthropic',
                name: 'anthropic',
                displayName: 'Anthropic (Claude)',
                models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-2.1'],
                requiresCredential: true,
                defaultModel: 'claude-3-opus-20240229'
            },
            {
                id: 'google',
                name: 'google',
                displayName: 'Google (Gemini)',
                models: ['gemini-pro', 'gemini-ultra'],
                requiresCredential: true,
                defaultModel: 'gemini-pro'
            },
            {
                id: 'cohere',
                name: 'cohere',
                displayName: 'Cohere (Command)',
                models: ['command', 'command-light'],
                requiresCredential: true,
                defaultModel: 'command'
            }
        ]
    }
}

/**
 * Service configuration types
 */
interface ChatBuilderServiceConfig {
    apiBaseURL: string
    timeout: number
    maxRetries: number
    enableLogging: boolean
}

export interface ChatBuilderServiceOptions {
    apiBaseURL?: string
    timeout?: number
    maxRetries?: number
    enableLogging?: boolean
}

/**
 * Singleton instance
 */
let serviceInstance: ChatBuilderService | null = null

/**
 * Get or create the service instance
 */
export function getChatBuilderService(config?: Partial<ChatBuilderServiceOptions>): ChatBuilderService {
    if (!serviceInstance) {
        serviceInstance = new ChatBuilderService(config)
    }
    return serviceInstance
}

/**
 * Reset the service instance (useful for testing)
 */
export function resetChatBuilderService(): void {
    serviceInstance = null
}
