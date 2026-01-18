/**
 * useChatBuilder Hook
 *
 * Main React hook for using the AI Chat Builder feature.
 * Manages state and provides methods for flow generation.
 */

import { useState, useCallback, useRef } from 'react'
import { useSnackbar } from 'notistack'
import { ChatBuilderRequest, ChatBuilderResponse, ChatBuilderState, ChatMessage } from '../types'
import { getChatBuilderService } from '../services/ChatBuilderService'

/**
 * Hook return type
 */
export interface UseChatBuilderReturn {
    // State
    state: ChatBuilderState
    messages: ChatMessage[]

    // Actions
    openPanel: () => void
    closePanel: () => void
    generateFlow: (request: ChatBuilderRequest) => Promise<ChatBuilderResponse | null>
    cancelGeneration: () => void
    reset: () => void
    clearMessages: () => void
    loadMessages: (messages: ChatMessage[]) => void
    chat: (message: string, flowId: string, flowType: 'chatflow' | 'agentflow', model?: string, sessionId?: string, onSessionId?: (sessionId: string) => void) => Promise<void>

    // Helpers
    isReady: boolean
    canGenerate: boolean
}

/**
 * Main chat builder hook
 */
export interface UseChatBuilderProps {
    chatflowId?: string
    isAgentCanvas?: boolean
    onFlowGenerated?: (flowData: any) => void
}

export function useChatBuilder({
    chatflowId,
    isAgentCanvas,
    onFlowGenerated
}: UseChatBuilderProps = {}): UseChatBuilderReturn {
    const { enqueueSnackbar } = useSnackbar()
    const service = useRef(getChatBuilderService())

    const [state, setState] = useState<ChatBuilderState>({
        isOpen: false,
        isGenerating: false,
        progress: {
            stage: 'idle',
            currentStep: 0,
            totalSteps: 1,
            message: ''
        },
        error: null,
        result: null,
        selectedProvider: 'openai'
    })

    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: getWelcomeMessage(),
            timestamp: new Date()
        }
    ])

    const [isReady, setIsReady] = useState(true)

    const openPanel = useCallback(() => {
        setState((prev) => ({ ...prev, isOpen: true }))
    }, [])

    const closePanel = useCallback(() => {
        setState((prev) => ({ ...prev, isOpen: false }))
    }, [])

    const generateFlow = useCallback(
        async (request: ChatBuilderRequest): Promise<ChatBuilderResponse | null> => {
            const userMessage: ChatMessage = {
                id: `user_${Date.now()}`,
                role: 'user',
                content: request.description,
                timestamp: new Date()
            }
            setMessages((prev) => [...prev, userMessage])

            setState((prev) => ({
                ...prev,
                isGenerating: true,
                error: null,
                result: null,
                selectedProvider: request.selectedProvider,
                progress: {
                    stage: 'implementation',
                    currentStep: 1,
                    totalSteps: 1,
                    message: 'Chatting...'
                }
            }))

            const assistantMessageId = `assistant_${Date.now()}`
            const assistantMessage: ChatMessage = {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                timestamp: new Date()
            }
            setMessages((prev) => [...prev, assistantMessage])

            try {
                if (!service.current) {
                    throw new Error('Service not initialized')
                }

                let fullResponse = ''

                await service.current.chatStream(
                    request.description,
                    request.model || 'gpt-4o-mini',
                    chatflowId || 'default',
                    isAgentCanvas ? 'agentflow' : 'chatflow',
                    undefined,
                    (chunk: string) => {
                        fullResponse += chunk
                        setMessages((prev) =>
                            prev.map((msg) =>
                                msg.id === assistantMessageId
                                    ? { ...msg, content: fullResponse }
                                    : msg
                            )
                        )
                    },
                    () => {
                        setMessages((prev) =>
                            prev.map((msg) =>
                                msg.id === assistantMessageId
                                    ? { ...msg, content: fullResponse }
                                    : msg
                            )
                        )
                    },
                    (error: string) => {
                        throw new Error(error)
                    }
                )

                setState((prev) => ({
                    ...prev,
                    isGenerating: false,
                    progress: {
                        stage: 'complete',
                        currentStep: 1,
                        totalSteps: 1,
                        message: 'Chat completed!'
                    }
                }))

                // enqueueSnackbar('Response received', {
                //     variant: 'success'
                // })

                return {
                    flowData: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
                    metadata: {
                        provider: request.selectedProvider || 'llmhub',
                        model: request.model || 'gpt-oss:20b',
                        tokensUsed: fullResponse.length,
                        timestamp: new Date(),
                        version: '1.0.0'
                    },
                    nodes: [],
                    edges: []
                }
            } catch (error: any) {
                const errorMessage = error.message || 'Failed to get response'

                setState((prev) => ({
                    ...prev,
                    isGenerating: false,
                    progress: {
                        stage: 'error',
                        currentStep: 0,
                        totalSteps: 1,
                        message: errorMessage
                    },
                    error: errorMessage
                }))

                setMessages((prev) =>
                    prev.map((msg) =>
                        msg.id === assistantMessageId
                            ? {
                                ...msg,
                                content: `I encountered an error: ${errorMessage}\n\nWould you like to try again?`
                            }
                            : msg
                    )
                )

                enqueueSnackbar(errorMessage, { variant: 'error' })

                return null
            }
        },
        [enqueueSnackbar, chatflowId, isAgentCanvas]
    )

    const cancelGeneration = useCallback(() => {
        service.current.cancelGeneration()
        setState((prev) => ({
            ...prev,
            isGenerating: false,
            progress: {
                stage: 'idle',
                currentStep: 0,
                totalSteps: 1,
                message: 'Generation cancelled'
            }
        }))

        enqueueSnackbar('Generation cancelled', { variant: 'info' })
    }, [enqueueSnackbar])

    const reset = useCallback(() => {
        setState({
            isOpen: false,
            isGenerating: false,
            progress: {
                stage: 'idle',
                currentStep: 0,
                totalSteps: 1,
                message: ''
            },
            error: null,
            result: null,
            selectedProvider: 'openai'
        })
        setMessages([
            {
                id: 'welcome',
                role: 'assistant',
                content: getWelcomeMessage(),
                timestamp: new Date()
            }
        ])
    }, [])

    const clearMessages = useCallback(() => {
        setMessages([
            {
                id: 'welcome',
                role: 'assistant',
                content: getWelcomeMessage(),
                timestamp: new Date()
            }
        ])
    }, [])

    const loadMessages = useCallback((newMessages: ChatMessage[]) => {
        setMessages(newMessages)
    }, [])

    const chat = useCallback(
        async (message: string, flowId: string, flowType: 'chatflow' | 'agentflow', model: string = 'gpt-4o-mini', sessionId?: string, onSessionId?: (sessionId: string) => void) => {
            const userMessage: ChatMessage = {
                id: `user_${Date.now()}`,
                role: 'user',
                content: message,
                timestamp: new Date()
            }
            setMessages((prev) => [...prev, userMessage])

            setState((prev) => ({
                ...prev,
                isGenerating: true,
                error: null,
                progress: {
                    stage: 'implementation',
                    currentStep: 1,
                    totalSteps: 1,
                    message: 'Chatting...'
                }
            }))

            const assistantMessageId = `assistant_${Date.now()}`
            const assistantMessage: ChatMessage = {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                timestamp: new Date()
            }
            setMessages((prev) => [...prev, assistantMessage])

            try {
                if (!service.current) {
                    throw new Error('Service not initialized')
                }

                let fullResponse = ''

                await service.current.chatStream(
                    message,
                    model,
                    flowId,
                    flowType,
                    sessionId,
                    (chunk: string) => {
                        fullResponse += chunk
                        setMessages((prev) =>
                            prev.map((msg) =>
                                msg.id === assistantMessageId
                                    ? { ...msg, content: fullResponse }
                                    : msg
                            )
                        )
                    },
                    () => {
                        setMessages((prev) =>
                            prev.map((msg) =>
                                msg.id === assistantMessageId
                                    ? { ...msg, content: fullResponse }
                                    : msg
                            )
                        )
                    },
                    (error: string) => {
                        throw new Error(error)
                    },
                    (sessionId: string) => {
                        onSessionId?.(sessionId)
                    }
                )

                // Check if response contains flow JSON
                let flowData = null
                // Match ```json ... ``` blocks, allowing for flexible whitespace/newlines
                const jsonMatch = fullResponse.match(/```json\s*([{[\s\S]*?})\s*```/)

                if (jsonMatch && jsonMatch[1]) {
                    try {
                        const rawJson = jsonMatch[1].trim()
                        // Strip comments (// and /* */) while preserving strings (e.g. urls)
                        const sanitizedJson = rawJson.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, c) => c ? '' : m)
                        flowData = JSON.parse(sanitizedJson)

                        // Sanitize: Ensure nodes have position and data to prevent crashes
                        if (flowData && Array.isArray(flowData.nodes)) {
                            // Check for hydration to detect hallucinations
                            if (!flowData.__hydrated) {
                                console.warn('[ChatBuilder] Flow JSON lacks hydration marker. This may be a hallucination.')
                                // We still sanitize and attempt show it, but it might be broken.
                            }

                            flowData.nodes = flowData.nodes.map((node: any) => ({
                                ...node,
                                position: node.position || { x: 0, y: 0 },
                                data: node.data || { label: node.label || node.id || 'Node' },
                                type: node.type || 'customNode'
                            }))
                        }
                    } catch (e) {
                        console.error('Failed to parse generated flow JSON', e)
                        console.log('Raw JSON string:', jsonMatch[1])
                    }
                }

                setState((prev) => ({
                    ...prev,
                    isGenerating: false,
                    result: flowData ? {
                        flowData,
                        metadata: {
                            provider: (model || 'openai') as any,
                            model: model,
                            tokensUsed: fullResponse.length,
                            timestamp: new Date(),
                            version: '1.0.0'
                        },
                        nodes: flowData.nodes || [],
                        edges: flowData.edges || []
                    } : null,
                    progress: {
                        stage: 'complete',
                        currentStep: 1,
                        totalSteps: 1,
                        message: 'Chat completed!'
                    }
                }))

                // enqueueSnackbar('Response received', { variant: 'success' })
            } catch (error: any) {
                const errorMessage = error.message || 'Failed to get response'

                setState((prev) => ({
                    ...prev,
                    isGenerating: false,
                    progress: {
                        stage: 'error',
                        currentStep: 0,
                        totalSteps: 1,
                        message: errorMessage
                    },
                    error: errorMessage
                }))

                setMessages((prev) =>
                    prev.map((msg) =>
                        msg.id === assistantMessageId
                            ? {
                                ...msg,
                                content: `I encountered an error: ${errorMessage}\n\nWould you like to try again?`
                            }
                            : msg
                    )
                )

                enqueueSnackbar(errorMessage, { variant: 'error' })
            }
        },
        [enqueueSnackbar]
    )

    const isReadyComp = isReady // rename to avoid conflict if any, though isReady state is fine
    const canGenerate = state.isGenerating === false && isReady === true

    return {
        state,
        messages,
        openPanel,
        closePanel,
        generateFlow,
        cancelGeneration,
        reset,
        clearMessages,
        loadMessages,
        chat,
        isReady,
        canGenerate
    }
}
/**
 * Get welcome message
 */
function getWelcomeMessage(): string {
    return `I'm your AI-powered flow builder assistant! 🚀

I can help you create chatflows and agentflows using natural language.

**How it works:**
1. Describe what you want to build
2. I'll analyze your requirements
3. I'll generate a complete flow structure
4. You can review and save it

**Example prompts:**
- "Create a customer support chatbot with FAQ capabilities"
- "Build an agent that can search the web and summarize results"
- "Make a document Q&A system with RAG"

What would you like to build today?`
}

/**
 * Generate success message
 */

