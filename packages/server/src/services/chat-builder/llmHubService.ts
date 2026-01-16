/**
 * LLM Hub Service
 *
 * Integration with LLM Hub API for model inference and model listing
 */

import logger from '../../utils/logger'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { StatusCodes } from 'http-status-codes'

export interface LLMHubMessage {
    role: 'system' | 'user' | 'assistant'
    content: string
}

export interface LLMHubRequestOptions {
    model: string
    messages: LLMHubMessage[]
    stream?: boolean
    temperature?: number
    max_tokens?: number
}

export interface LLMHubResponse {
    content: string
    model: string
    usage?: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
    }
}

export interface LLMHubStreamChunk {
    content: string
    model: string
    done: boolean
    [key: string]: any
}

/**
 * Model interface from LLM Hub
 */
export interface LLMModel {
    id: string
    name: string
    provider: string
    supportsFunctionCalling: boolean
    [key: string]: any
}

/**
 * Provider with models from LLM Hub
 */
export interface ProviderWithModels {
    id: string
    name: string
    displayName: string
    models: Omit<LLMModel, 'supportsFunctionCalling'>[]
    requiresCredential: boolean
    defaultModel?: string
}

/**
 * LLM Hub API Service
 */
class LLMHubService {
    private baseURL: string
    private apiKey: string | undefined
    private timeout: number

    constructor() {
        // Get LLM Hub configuration from environment variables
        this.baseURL = process.env.LLM_HUB_URL || 'https://llm-hub.roxane.one'
        this.apiKey = process.env.LLM_HUB_API_KEY
        this.timeout = parseInt(process.env.LLM_HUB_TIMEOUT || '120000') // Default 2 minutes
    }

    /**
     * Get models from LLM Hub
     */
    async getModels(): Promise<LLMModel[]> {
        try {
            logger.info('[LLMHubService] Fetching models from LLM Hub', { url: `${this.baseURL}/v1/models` })

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            }

            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`
            }

            const response = await fetch(`${this.baseURL}/v1/models`, {
                method: 'GET',
                headers,
                signal: AbortSignal.timeout(10000) // 10 second timeout
            })

            if (!response.ok) {
                const errorText = await response.text()
                logger.error('[LLMHubService] Failed to fetch models', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorText
                })
                throw new Error(`Failed to fetch models: ${response.statusText} - ${errorText}`)
            }

            const result = await response.json()

            // LLM Hub returns { object: "list", data: [...] }
            const modelsData = result.data || result.models || result

            // Map to our LLMModel interface
            const models: LLMModel[] = (modelsData || []).map((model: any) => ({
                id: model.id,
                name: model.id, // Use id as name since API doesn't provide separate name
                provider: model.owned_by || 'unknown',
                supportsFunctionCalling: true // Default to true for all models
            }))

            return models
        } catch (error: any) {
            logger.error('[LLMHubService] Failed to get models from LLM Hub', {
                error: error.message,
                stack: error.stack
            })
            return []
        }
    }

    /**
     * Get providers grouped by provider name from LLM Hub
     */
    async getProviders(): Promise<ProviderWithModels[]> {
        try {
            const models = await this.getModels()

            // Group models by provider
            const providerMap = new Map<string, Omit<LLMModel, 'supportsFunctionCalling'>[]>()

            for (const model of models) {
                const { provider, ...modelWithoutSupportsFlag } = model

                if (!providerMap.has(provider)) {
                    providerMap.set(provider, [])
                }

                providerMap.get(provider)!.push(modelWithoutSupportsFlag)
            }

            // Convert map to providers array
            const providers: ProviderWithModels[] = Array.from(providerMap.entries()).map(([providerId, models]) => ({
                id: providerId.toLowerCase().replace(/\s+/g, '-'),
                name: providerId,
                displayName: providerId.charAt(0).toUpperCase() + providerId.slice(1),
                models,
                requiresCredential: false,
                defaultModel: models[0]?.id
            }))

            return providers
        } catch (error: any) {
            logger.error('[LLMHubService] Failed to get providers from LLM Hub', {
                error: error.message
            })
            return []
        }
    }

    /**
     * Call LLM Hub API with streaming disabled
     */
    async chat(request: LLMHubRequestOptions): Promise<string> {
        try {
            logger.info('[LLMHubService] Calling LLM Hub API', {
                model: request.model,
                messagesCount: request.messages.length,
                baseURL: this.baseURL
            })

            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), this.timeout)

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            }

            // Add API key if provided
            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`
            }

            const response = await fetch(`${this.baseURL}/v1/chat/completions`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: request.model,
                    messages: request.messages,
                    stream: false,
                    temperature: request.temperature || 0.7,
                    max_tokens: request.max_tokens || 4096
                }),
                signal: controller.signal
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                const errorText = await response.text()
                logger.error('[LLMHubService] LLM Hub API error', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorText
                })
                throw new InternalFlowiseError(
                    StatusCodes.BAD_GATEWAY,
                    `LLM Hub API error: ${response.status} ${response.statusText} - ${errorText}`
                )
            }

            const data: LLMHubResponse = await response.json()

            if (!data.content) {
                throw new InternalFlowiseError(StatusCodes.BAD_GATEWAY, 'Invalid response from LLM Hub API')
            }

            logger.info('[LLMHubService] LLM Hub API call successful', {
                responseLength: data.content.length,
                usage: data.usage
            })

            return data.content
        } catch (error: any) {
            if (error.name === 'AbortError') {
                logger.error('[LLMHubService] Request timeout')
                throw new InternalFlowiseError(StatusCodes.REQUEST_TIMEOUT, 'LLM Hub API request timeout')
            }

            logger.error('[LLMHubService] Error calling LLM Hub API', {
                error: error.message,
                stack: error.stack
            })

            throw error
        }
    }

    /**
     * Call LLM Hub API with streaming
     */
    async chatStream(
        request: LLMHubRequestOptions,
        onChunk: (chunk: string) => void,
        onComplete: () => void,
        onError: (error: Error) => void
    ): Promise<void> {
        try {
            logger.info('[LLMHubService] Calling LLM Hub API with streaming', {
                model: request.model,
                messagesCount: request.messages.length
            })

            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            }

            // Add API key if provided
            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`
            }

            const response = await fetch(`${this.baseURL}/v1/chat/completions`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: request.model,
                    messages: request.messages,
                    stream: true,
                    temperature: request.temperature || 0.7
                })
            })

            if (!response.ok) {
                const errorText = await response.text()
                onError(new Error(`LLM Hub API error: ${response.status} ${response.statusText} - ${errorText}`))
                return
            }

            const reader = response.body?.getReader()
            if (!reader) {
                onError(new Error('Response body is not readable'))
                return
            }

            const decoder = new TextDecoder()
            let buffer = ''

            // eslint-disable-next-line no-constant-condition
            while (true) {
                const { done, value } = await reader.read()

                if (done) {
                    onComplete()
                    break
                }

                buffer += decoder.decode(value, { stream: true })

                // Process each line (SSE format)
                const lines = buffer.split('\n')
                buffer = lines.pop() || '' // Keep incomplete line in buffer

                for (const line of lines) {
                    if (!line.trim() || !line.startsWith('data: ')) continue

                    try {
                        const jsonStr = line.replace('data: ', '').trim()
                        if (jsonStr === '[DONE]') {
                            onComplete()
                            return
                        }

                        const chunk: LLMHubStreamChunk = JSON.parse(jsonStr)
                        if (chunk.content) {
                            onChunk(chunk.content)
                        }

                        if (chunk.done) {
                            onComplete()
                            return
                        }
                    } catch (parseError) {
                        logger.warn('[LLMHubService] Failed to parse streaming chunk', { line, error: parseError })
                    }
                }
            }
        } catch (error: any) {
            logger.error('[LLMHubService] Error in streaming call', {
                error: error.message,
                stack: error.stack
            })
            onError(error)
        }
    }

    /**
     * Check if LLM Hub service is available
     */
    async healthCheck(): Promise<boolean> {
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            }

            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`
            }

            const response = await fetch(`${this.baseURL}/v1/models`, {
                method: 'GET',
                headers,
                signal: AbortSignal.timeout(5000) // 5 second timeout
            })

            return response.ok
        } catch (error) {
            logger.warn('[LLMHubService] Health check failed', { error })
            return false
        }
    }
}

// Export singleton instance
export default new LLMHubService()
