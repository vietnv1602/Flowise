/**
 * ChatBuilderPanel - Main Panel Component
 *
 * Simple, clean panel for AI Chat Builder
 */

import React, { useEffect } from 'react'
import { Drawer, Box, Typography, IconButton, Divider, useTheme, useMediaQuery } from '@mui/material'
import { IconX, IconSparkles } from '@tabler/icons-react'
import { useChatBuilder } from '../hooks/useChatBuilder'
import { ChatBuilderForm } from './ChatBuilderForm'
import { GenerationProgress } from './GenerationProgress'
import { ChatConversation } from './ChatConversation'

export interface ChatBuilderPanelProps {
    /**
     * Whether the panel is open
     */
    open?: boolean

    /**
     * Callback when panel requests to be opened
     */
    onOpen?: () => void

    /**
     * Callback when panel requests to be closed
     */
    onClose?: () => void

    /**
     * Chatflow ID (if editing existing flow)
     */
    chatflowId?: string

    /**
     * Whether this is an agentflow canvas
     */
    isAgentCanvas?: boolean

    /**
     * Callback when flow is generated successfully
     */
    onFlowGenerated?: (flowData: any) => void
}

const PANEL_WIDTH = 500

/**
 * Main Chat Builder Panel Component
 */
export const ChatBuilderPanel: React.FC<ChatBuilderPanelProps> = ({
    open: controlledOpen,
    onOpen: _onOpen,
    onClose,
    chatflowId: _chatflowId,
    isAgentCanvas = false,
    onFlowGenerated
}) => {
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const { state, messages, generateFlow, reset, closePanel, isReady } = useChatBuilder()

    // Use controlled or uncontrolled mode
    const isOpen = controlledOpen !== undefined ? controlledOpen : state.isOpen

    const handleClose = () => {
        if (onClose) {
            onClose()
        } else {
            closePanel()
        }
    }

    // Auto-save and load flow when generation completes
    useEffect(() => {
        if (state.result && onFlowGenerated) {
            onFlowGenerated(state.result.flowData)
        }
    }, [state.result, onFlowGenerated])

    return (
        <Drawer
            anchor='right'
            open={isOpen}
            onClose={handleClose}
            variant={isMobile ? 'temporary' : 'persistent'}
            SlideProps={{ direction: 'left' }}
            sx={{
                width: PANEL_WIDTH,
                flexShrink: 0,
                zIndex: 9999,
                '& .MuiDrawer-paper': {
                    width: PANEL_WIDTH,
                    boxSizing: 'border-box',
                    background: 'background.paper',
                    borderLeft: '1px solid',
                    borderLeftColor: 'divider',
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    paddingTop: '70px'
                }
            }}
        >
            {/* Simple Header */}
            <Box
                sx={{
                    px: 2,
                    py: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    position: 'relative',
                    zIndex: 10
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconSparkles size={20} color={theme.palette.primary.main} />
                    <Box>
                        <Typography variant='subtitle1' fontWeight='600'>
                            AI Chat Builder
                        </Typography>
                        <Typography variant='caption' color='text.secondary'>
                            {isAgentCanvas ? 'Agentflow' : 'Chatflow'}
                        </Typography>
                    </Box>
                </Box>
                <IconButton
                    size='small'
                    onClick={handleClose}
                    sx={{
                        zIndex: 11,
                        pointerEvents: 'auto'
                    }}
                >
                    <IconX size={18} />
                </IconButton>
            </Box>

            {/* Chat Conversation */}
            <Box sx={{ flex: 1, overflow: 'auto', pointerEvents: 'auto' }}>
                <ChatConversation messages={messages} />
            </Box>

            {/* Progress Display */}
            {state.isGenerating && (
                <>
                    <Box sx={{ px: 2, py: 1 }}>
                        <GenerationProgress progress={state.progress} />
                    </Box>
                    <Divider />
                </>
            )}

            {/* Input Form Area */}
            <Box sx={{ px: 2, pb: 2, position: 'relative', zIndex: 2, pointerEvents: 'auto' }}>
                <ChatBuilderForm
                    isGenerating={state.isGenerating}
                    error={state.error}
                    isAgentCanvas={isAgentCanvas}
                    onSubmit={generateFlow}
                    onCancel={reset}
                    disabled={!isReady || state.isGenerating}
                />
            </Box>
        </Drawer>
    )
}

export default ChatBuilderPanel
