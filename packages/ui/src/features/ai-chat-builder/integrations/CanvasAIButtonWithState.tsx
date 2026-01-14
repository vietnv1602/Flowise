/**
 * Canvas Integration Hook
 *
 * Custom hook for integrating AI Chat Builder with canvas
 */

import { useState, useCallback } from 'react'
import { useSnackbar } from 'notistack'

/**
 * Hook return type
 */
export interface UseCanvasAIIntegrationReturn {
    isAIBuilderOpen: boolean
    isSavingFlow: boolean
    openAIBuilder: () => void
    closeAIBuilder: () => void
    handleFlowGenerated: (flowData: any, options?: CanvasAIOptions) => Promise<void>
    AIBuilderComponent: React.ComponentType<any>
}

/**
 * Options for handling generated flow
 */
export interface CanvasAIOptions {
    /**
     * Whether to auto-save the flow
     */
    autoSave?: boolean

    /**
     * Flow name (for new flows)
     */
    flowName?: string

    /**
     * Whether to close panel after generation
     */
    closeAfterGeneration?: boolean

    /**
     * Callback before save
     */
    onBeforeSave?: (flowData: any) => any

    /**
     * Callback after save
     */
    onAfterSave?: (savedFlow: any) => void
}

/**
 * Canvas AI Integration Hook
 *
 * @param saveFlow Function to save the flow
 * @param loadFlow Function to load flow into canvas
 * @returns Integration utilities
 */
export function useCanvasAIIntegration(
    saveFlow: (flowData: any, name?: string) => Promise<any>,
    loadFlow: (nodes: any[], edges: any[]) => void,
    options?: CanvasAIOptions
): UseCanvasAIIntegrationReturn {
    const { enqueueSnackbar } = useSnackbar()
    const [isAIBuilderOpen, setIsAIBuilderOpen] = useState(false)
    const [isSavingFlow, setIsSavingFlow] = useState(false)

    const openAIBuilder = useCallback(() => {
        setIsAIBuilderOpen(true)
    }, [])

    const closeAIBuilder = useCallback(() => {
        setIsAIBuilderOpen(false)
    }, [])

    const handleFlowGenerated = useCallback(
        async (flowData: any, opts?: CanvasAIOptions) => {
            const mergedOptions = { ...options, ...opts }

            try {
                setIsSavingFlow(true)

                // Call before save callback
                if (mergedOptions.onBeforeSave) {
                    const modified = await mergedOptions.onBeforeSave(flowData)
                    if (modified) {
                        flowData = modified
                    }
                }

                // Load into canvas first (for immediate feedback)
                loadFlow(flowData.nodes || [], flowData.edges || [])

                // Auto-save if enabled
                if (mergedOptions.autoSave !== false) {
                    const flowName = mergedOptions.flowName || 'AI Generated Flow'

                    await saveFlow(
                        {
                            nodes: flowData.nodes,
                            edges: flowData.edges
                        },
                        flowName
                    )

                    enqueueSnackbar('Flow saved successfully', { variant: 'success' })

                    // Call after save callback
                    if (mergedOptions.onAfterSave) {
                        mergedOptions.onAfterSave(flowData)
                    }
                }

                // Close panel if requested
                if (mergedOptions.closeAfterGeneration !== false) {
                    closeAIBuilder()
                }
            } catch (error: any) {
                console.error('Failed to save generated flow:', error)
                enqueueSnackbar(error.message || 'Failed to save flow', { variant: 'error' })
            } finally {
                setIsSavingFlow(false)
            }
        },
        [saveFlow, loadFlow, options, closeAIBuilder, enqueueSnackbar]
    )

    // We'll return a component that can be rendered
    // This will be set by the actual component implementation
    const AIBuilderComponent = () => null as any

    return {
        isAIBuilderOpen,
        isSavingFlow,
        openAIBuilder,
        closeAIBuilder,
        handleFlowGenerated,
        AIBuilderComponent
    }
}

/**
 * HOC for adding AI Builder to a canvas component
 */
export function withCanvasAI<P extends object>(
    WrappedComponent: React.ComponentType<P>,
    saveFlow: (flowData: any, name?: string) => Promise<any>,
    loadFlow: (nodes: any[], edges: any[]) => void
) {
    return function CanvasWithAI(props: P) {
        // Initialize integration (for future use)
        useCanvasAIIntegration(saveFlow, loadFlow, {
            autoSave: true,
            closeAfterGeneration: false
        })

        // We'll need to render the AI builder panel separately
        // For now, this is a placeholder for the HOC pattern

        return <WrappedComponent {...props} />
    }
}
