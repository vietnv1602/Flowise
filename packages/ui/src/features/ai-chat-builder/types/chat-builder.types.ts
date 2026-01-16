/**
 * AI Chat Builder - Type Definitions
 *
 * This file contains all core domain types for the AI Chat Builder feature.
 * Following clean architecture principles, these types are framework-agnostic
 * and represent the business domain.
 */

/**
 * Core request for generating a flow
 */
export interface ChatBuilderRequest {
    description: string
    requirements?: ChatBuilderRequirements
    selectedProvider: AIProvider
    credentialId?: string
    flowType?: 'chatflow' | 'agentflow'
    model?: string // Model ID from LLM Hub
}

/**
 * Optional requirements that can refine the generation
 */
export interface ChatBuilderRequirements {
    tone?: 'professional' | 'casual' | 'friendly'
    features?: string[]
    integrations?: string[]
    complexity?: 'simple' | 'medium' | 'complex'
}

/**
 * Supported AI providers
 */
export type AIProvider = 'openai' | 'anthropic' | 'azure-openai' | 'cohere' | 'google' | 'custom' | 'llmhub'

/**
 * Response from flow generation
 */
export interface ChatBuilderResponse {
    flowData: FlowJSON
    metadata: GenerationMetadata
    nodes: GeneratedNode[]
    edges: GeneratedEdge[]
}

/**
 * Metadata about the generation process
 */
export interface GenerationMetadata {
    provider: AIProvider
    model: string
    tokensUsed: number
    timestamp: Date
    version: string
}

/**
 * Flow JSON structure compatible with ReactFlow
 */
export interface FlowJSON {
    nodes: any[]
    edges: any[]
    viewport?: {
        x: number
        y: number
        zoom: number
    }
}

/**
 * Generated node with metadata
 */
export interface GeneratedNode {
    id: string
    label: string
    type: string
    category: string
    description?: string
}

/**
 * Generated edge with metadata
 */
export interface GeneratedEdge {
    id: string
    source: string
    target: string
    sourceHandle?: string
    targetHandle?: string
}

/**
 * UI State for the chat builder panel
 */
export interface ChatBuilderState {
    isOpen: boolean
    isGenerating: boolean
    progress: GenerationProgressState
    error: string | null
    result: ChatBuilderResponse | null
    selectedProvider: AIProvider
}

/**
 * Progress tracking during generation
 */
export interface GenerationProgressState {
    stage: GenerationStage
    currentStep: number
    totalSteps: number
    message: string
}

/**
 * Generation stages following feature-dev phases
 */
export type GenerationStage =
    | 'idle' // Not started
    | 'discovery' // Understanding requirements
    | 'exploration' // Analyzing codebase
    | 'clarifying' // Asking questions
    | 'architecture' // Designing approach
    | 'implementation' // Building flow
    | 'review' // Validating output
    | 'complete' // Done
    | 'error' // Failed

/**
 * Validation result for generated flows
 */
export interface ValidationResult {
    isValid: boolean
    errors: ValidationError[]
    warnings: ValidationWarning[]
}

/**
 * Validation error that must be fixed
 */
export interface ValidationError {
    code: string
    message: string
    nodeId?: string
    severity: 'critical' | 'high'
}

/**
 * Validation warning that should be addressed
 */
export interface ValidationWarning {
    code: string
    message: string
    nodeId?: string
    suggestion?: string
}

/**
 * Cost estimation for generation
 */
export interface CostEstimate {
    estimatedTokens: number
    estimatedCostUSD: number
    provider: AIProvider
    model: string
}

/**
 * Chat message for conversational interface
 */
export interface ChatMessage {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: Date
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
    id: AIProvider
    name: string
    displayName: string
    models: string[]
    requiresCredential: boolean
    defaultModel?: string
}

/**
 * Credential information
 */
export interface CredentialInfo {
    id: string
    name: string
    provider: AIProvider
    isSelected: boolean
}

/**
 * Conversation information
 */
export interface Conversation {
    conversationId: string
    flowId: string
    flowType: 'chatflow' | 'agentflow'
    title: string
    createdAt: Date
    updatedAt: Date
}

/**
 * Conversation detail with messages
 */
export interface ConversationDetail extends Conversation {
    messages: ChatMessage[]
}
