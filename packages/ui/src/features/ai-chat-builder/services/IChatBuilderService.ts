/**
 * Chat Builder Service Interface
 *
 * This interface defines the contract for chat builder services.
 * Following clean architecture, this interface is independent of
 * implementation details and can be mocked for testing.
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

/**
 * Main service interface for AI Chat Builder functionality
 */
export interface IChatBuilderService {
    /**
     * Generate a flow based on natural language description
     * @param request The generation request
     * @returns Promise with generated flow response
     */
    generateFlow(request: ChatBuilderRequest): Promise<ChatBuilderResponse>

    /**
     * Validate a generated flow before saving
     * @param flowData The flow data to validate
     * @returns Promise with validation result
     */
    validateFlow(flowData: FlowJSON): Promise<ValidationResult>

    /**
     * Get available AI providers
     * @returns Promise with array of provider configurations
     */
    getAvailableProviders(): Promise<ProviderConfig[]>

    /**
     * Get user's configured credentials
     * @param provider Optional provider filter
     * @returns Promise with array of credential info
     */
    getCredentials(provider?: AIProvider): Promise<CredentialInfo[]>

    /**
     * Estimate generation cost
     * @param request The generation request
     * @returns Promise with cost estimate
     */
    estimateCost(request: ChatBuilderRequest): Promise<CostEstimate>

    /**
     * Cancel ongoing generation
     */
    cancelGeneration(): void

    /**
     * Check if service is ready to use
     * @returns Promise with boolean indicating readiness
     */
    isReady(): Promise<boolean>

    /**
     * Chat with streaming response
     * @param message User message
     * @param model Model to use
     * @param flowId Flow ID (chatflow/agentflow ID)
     * @param flowType Flow type ('chatflow' or 'agentflow')
     * @param conversationId Optional conversation ID for memory
     * @param onChunk Callback for streaming chunks
     * @param onComplete Callback when complete
     * @param onError Callback for errors
     * @returns Promise with full response
     */
    chatStream(
        message: string,
        model: string,
        flowId: string,
        flowType: 'chatflow' | 'agentflow',
        conversationId?: string,
        onChunk?: (chunk: string) => void,
        onComplete?: (fullResponse: string) => void,
        onError?: (error: string) => void
    ): Promise<string>

    /**
     * Create a new conversation
     * @param flowId Flow ID
     * @param flowType Flow type (chatflow or agentflow)
     * @param title Optional conversation title
     * @returns Promise with conversation ID
     */
    createConversation(flowId: string, flowType: 'chatflow' | 'agentflow', title?: string): Promise<string>

    /**
     * Get list of conversations for a flow
     * @param flowId Flow ID
     * @param flowType Flow type
     * @returns Promise with array of conversations
     */
    getConversations(flowId: string, flowType: 'chatflow' | 'agentflow'): Promise<Conversation[]>

    /**
     * Get conversation detail with messages
     * @param conversationId Conversation ID
     * @returns Promise with conversation detail
     */
    getConversationDetail(conversationId: string): Promise<ConversationDetail>

    /**
     * Delete a conversation
     * @param conversationId Conversation ID
     * @returns Promise when deleted
     */
    deleteConversation(conversationId: string): Promise<void>
}

/**
 * Options for service configuration
 */
export interface ChatBuilderServiceOptions {
    apiBaseURL?: string
    timeout?: number
    maxRetries?: number
    enableLogging?: boolean
}

/**
 * Service configuration
 */
export interface ChatBuilderServiceConfig {
    apiBaseURL: string
    timeout: number
    maxRetries: number
    enableLogging: boolean
}

/**
 * Event types for service callbacks
 */
export type ServiceEventType = 'generationStarted' | 'generationProgress' | 'generationComplete' | 'generationError' | 'validationComplete'

/**
 * Service event callback
 */
export type ServiceEventCallback<T = any> = (data: T) => void
