/**
 * Flow Generator Interface
 *
 * Abstract interface for AI-powered flow generators.
 * Different AI providers implement this interface.
 */

import { ChatBuilderRequest, ChatBuilderResponse, CostEstimate } from '../../types'

/**
 * Interface for AI-powered flow generators
 */
export interface IFlowGenerator {
    /**
     * Generate flow using AI provider
     * @param request The generation request
     * @returns Promise with generated flow response
     */
    generate(request: ChatBuilderRequest): Promise<ChatBuilderResponse>

    /**
     * Estimate generation cost
     * @param request The generation request
     * @returns Promise with cost estimate
     */
    estimateCost(request: ChatBuilderRequest): Promise<CostEstimate>

    /**
     * Check if generator is available (has valid credentials)
     * @returns Promise with boolean
     */
    isAvailable(): Promise<boolean>

    /**
     * Get available models for this provider
     * @returns Promise with array of model names
     */
    getAvailableModels(): Promise<string[]>

    /**
     * Validate credentials
     * @param credentialId The credential ID to validate
     * @returns Promise with boolean
     */
    validateCredentials(credentialId: string): Promise<boolean>

    /**
     * Get provider information
     */
    getProviderInfo(): {
        id: string
        name: string
        displayName: string
        requiresCredential: boolean
    }
}

/**
 * Generator options
 */
export interface GeneratorOptions {
    /**
     * Temperature for generation (0-1)
     */
    temperature?: number

    /**
     * Maximum tokens to generate
     */
    maxTokens?: number

    /**
     * Top P sampling
     */
    topP?: number

    /**
     * Enable streaming response
     */
    stream?: boolean

    /**
     * Include metadata in response
     */
    includeMetadata?: boolean

    /**
     * Abort signal for cancellation
     */
    signal?: AbortSignal
}

/**
 * Generation progress callback
 */
export type ProgressCallback = (stage: string, progress: number, message: string) => void

/**
 * Generator configuration
 */
export interface GeneratorConfig {
    /**
     * Default model to use
     */
    defaultModel?: string

    /**
     * API endpoint URL
     */
    apiEndpoint?: string

    /**
     * Request timeout in milliseconds
     */
    timeout?: number

    /**
     * Maximum retries
     */
    maxRetries?: number
}
