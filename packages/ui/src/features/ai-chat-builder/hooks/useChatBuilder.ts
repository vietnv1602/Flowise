/**
 * useChatBuilder Hook
 *
 * Main React hook for using the AI Chat Builder feature.
 * Manages state and provides methods for flow generation.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useSnackbar } from 'notistack'
import { ChatBuilderRequest, ChatBuilderResponse, ChatBuilderState, GenerationStage, ChatMessage } from '../types'
import { getChatBuilderService } from '../services/ChatBuilderService'
import { PHASE_PROMPTS } from '../utils/promptTemplates'

const INITIAL_STAGES: GenerationStage[] = ['discovery', 'exploration', 'clarifying', 'architecture', 'implementation', 'review']

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

    // Helpers
    isReady: boolean
    canGenerate: boolean
}

/**
 * Main chat builder hook
 */
export function useChatBuilder(): UseChatBuilderReturn {
    const { enqueueSnackbar } = useSnackbar()
    const service = useRef(getChatBuilderService())

    const [state, setState] = useState<ChatBuilderState>({
        isOpen: false,
        isGenerating: false,
        progress: {
            stage: 'idle',
            currentStep: 0,
            totalSteps: INITIAL_STAGES.length,
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

    const [isReady, setIsReady] = useState(false)

    // Check service readiness on mount
    useEffect(() => {
        if (service.current) {
            service.current
                .isReady()
                .then(setIsReady)
                .catch(() => setIsReady(false))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    /**
     * Open the chat builder panel
     */
    const openPanel = useCallback(() => {
        setState((prev) => ({ ...prev, isOpen: true }))
    }, [])

    /**
     * Close the chat builder panel
     */
    const closePanel = useCallback(() => {
        setState((prev) => ({ ...prev, isOpen: false }))
    }, [])

    /**
     * Simulate progress through the feature-dev phases
     */
    const simulateProgress = useCallback(async (_request: ChatBuilderRequest): Promise<void> => {
        const stages = INITIAL_STAGES

        for (let i = 0; i < stages.length; i++) {
            const stage = stages[i]
            const phaseInfo = PHASE_PROMPTS[stage]

            setState((prev) => ({
                ...prev,
                progress: {
                    stage,
                    currentStep: i + 1,
                    totalSteps: stages.length,
                    message: phaseInfo.instruction
                }
            }))

            // Add phase message to chat if it has questions
            if (phaseInfo.questions.length > 0) {
                const questionMessage: ChatMessage = {
                    id: `phase_${stage}`,
                    role: 'assistant',
                    content: `**${phaseInfo.instruction}**\n\n${phaseInfo.questions.join('\n')}`,
                    timestamp: new Date()
                }
                setMessages((prev) => [...prev, questionMessage])
            }

            // Simulate processing time (progressive delays)
            const delay = Math.min(500 + i * 300, 2000)
            await new Promise((resolve) => setTimeout(resolve, delay))
        }
    }, [])

    /**
     * Generate a flow
     */
    const generateFlow = useCallback(
        async (request: ChatBuilderRequest): Promise<ChatBuilderResponse | null> => {
            // Add user message
            const userMessage: ChatMessage = {
                id: `user_${Date.now()}`,
                role: 'user',
                content: request.description,
                timestamp: new Date()
            }
            setMessages((prev) => [...prev, userMessage])

            // Reset state
            setState((prev) => ({
                ...prev,
                isGenerating: true,
                error: null,
                result: null,
                selectedProvider: request.selectedProvider
            }))

            try {
                // Run through the phases
                await simulateProgress(request)

                // Set implementation stage
                setState((prev) => ({
                    ...prev,
                    progress: {
                        stage: 'implementation',
                        currentStep: INITIAL_STAGES.length,
                        totalSteps: INITIAL_STAGES.length,
                        message: 'Generating flow structure...'
                    }
                }))

                // Call the service
                if (!service.current) {
                    throw new Error('Service not initialized')
                }
                const response = await service.current.generateFlow(request)

                // Update state with result
                setState((prev) => ({
                    ...prev,
                    isGenerating: false,
                    progress: {
                        stage: 'complete',
                        currentStep: INITIAL_STAGES.length,
                        totalSteps: INITIAL_STAGES.length,
                        message: 'Flow generated successfully!'
                    },
                    result: response
                }))

                // Add assistant message with result
                const assistantMessage: ChatMessage = {
                    id: `assistant_${Date.now()}`,
                    role: 'assistant',
                    content: generateSuccessMessage(response),
                    timestamp: new Date()
                }
                setMessages((prev) => [...prev, assistantMessage])

                // Show success notification
                enqueueSnackbar(`Flow generated with ${response.nodes.length} nodes and ${response.edges.length} edges`, {
                    variant: 'success'
                })

                return response
            } catch (error: any) {
                const errorMessage = error.message || 'Failed to generate flow'

                setState((prev) => ({
                    ...prev,
                    isGenerating: false,
                    progress: {
                        stage: 'error',
                        currentStep: 0,
                        totalSteps: INITIAL_STAGES.length,
                        message: errorMessage
                    },
                    error: errorMessage
                }))

                // Add error message to chat
                const errorChatMessage: ChatMessage = {
                    id: `error_${Date.now()}`,
                    role: 'assistant',
                    content: `I encountered an error: ${errorMessage}\n\nWould you like to try again or modify your request?`,
                    timestamp: new Date()
                }
                setMessages((prev) => [...prev, errorChatMessage])

                // Show error notification
                enqueueSnackbar(errorMessage, { variant: 'error' })

                return null
            }
        },
        [simulateProgress, enqueueSnackbar]
    )

    /**
     * Cancel ongoing generation
     */
    const cancelGeneration = useCallback(() => {
        service.current.cancelGeneration()
        setState((prev) => ({
            ...prev,
            isGenerating: false,
            progress: {
                stage: 'idle',
                currentStep: 0,
                totalSteps: INITIAL_STAGES.length,
                message: 'Generation cancelled'
            }
        }))

        enqueueSnackbar('Generation cancelled', { variant: 'info' })
    }, [enqueueSnackbar])

    /**
     * Reset the chat builder state
     */
    const reset = useCallback(() => {
        setState({
            isOpen: false,
            isGenerating: false,
            progress: {
                stage: 'idle',
                currentStep: 0,
                totalSteps: INITIAL_STAGES.length,
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

    /**
     * Check if generation is possible
     */
    const canGenerate = state.isGenerating === false && isReady === true

    return {
        state,
        messages,
        openPanel,
        closePanel,
        generateFlow,
        cancelGeneration,
        reset,
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
function generateSuccessMessage(response: ChatBuilderResponse): string {
    return `I've generated your flow successfully! 🎉

**Generated Flow:**
- **Nodes:** ${response.nodes.length}
- **Edges:** ${response.edges.length}
- **Provider:** ${response.metadata.provider}
- **Model:** ${response.metadata.model}

**Next Steps:**
1. Review the generated flow in the canvas
2. Make any adjustments needed
3. Save and deploy your flow

The flow has been automatically loaded into the canvas for you.`
}
