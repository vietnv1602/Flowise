/**
 * Flow Generation - Type Definitions
 *
 * Types specific to flow generation logic
 */

import { FlowJSON } from './chat-builder.types'

/**
 * Prompt template for flow generation
 */
export interface PromptTemplate {
    system: string
    user: string
    examples?: PromptExample[]
}

/**
 * Example for few-shot prompting
 */
export interface PromptExample {
    input: string
    output: FlowJSON
    description?: string
}

/**
 * Generation options passed to generators
 */
export interface GenerationOptions {
    temperature?: number
    maxTokens?: number
    topP?: number
    stream?: boolean
    includeMetadata?: boolean
}

/**
 * Response from AI provider
 */
export interface AIProviderResponse {
    content: string
    usage?: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
    }
    model: string
    finishReason?: 'stop' | 'length' | 'content_filter'
}

/**
 * Parsed flow from AI response
 */
export interface ParsedFlow {
    flowData: FlowJSON
    parseErrors: ParseError[]
    warnings: ParseWarning[]
}

/**
 * Error during flow parsing
 */
export interface ParseError {
    line: number
    column: number
    message: string
    severity: 'error' | 'warning'
}

/**
 * Warning during flow parsing
 */
export interface ParseWarning {
    nodeId?: string
    message: string
    suggestion?: string
}

/**
 * Flow generator interface
 */
export interface IFlowGenerator {
    /**
     * Generate flow using AI
     */
    generate(prompt: string, options: GenerationOptions): Promise<AIProviderResponse>

    /**
     * Estimate cost for generation
     */
    estimateCost(prompt: string): number

    /**
     * Check if generator is available (credentials configured)
     */
    isAvailable(): Promise<boolean>

    /**
     * Get available models for this provider
     */
    getAvailableModels(): Promise<string[]>
}
