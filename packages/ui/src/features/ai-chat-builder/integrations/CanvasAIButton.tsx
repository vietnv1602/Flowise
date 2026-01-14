/**
 * CanvasAIButton - Floating Action Button for AI Builder
 *
 * A floating button that opens the AI Chat Builder panel.
 * Hidden when chat popup is open to avoid overlap.
 */

import React, { useState } from 'react'
import { Tooltip, useTheme } from '@mui/material'
import { IconSparkles } from '@tabler/icons-react'
import { ChatBuilderPanel } from '../components/ChatBuilderPanel'
import { StyledFab } from '@/ui-component/button/StyledFab'

export interface CanvasAIButtonProps {
    /**
     * Chatflow ID (if editing existing flow)
     */
    chatflowId?: string

    /**
     * Whether this is an agentflow canvas
     */
    isAgentCanvas?: boolean

    /**
     * Whether chat popup is open (button will be hidden if true)
     */
    chatPopupOpen?: boolean

    /**
     * Callback when flow is generated
     */
    onFlowGenerated?: (flowData: any) => void

    /**
     * Position of the button (default: top-right)
     */
    position?: 'top-right'

    /**
     * Custom styles
     */
    sx?: any
}

/**
 * Canvas AI Button Component
 */
export const CanvasAIButton: React.FC<CanvasAIButtonProps> = ({
    chatflowId,
    isAgentCanvas = false,
    chatPopupOpen = false,
    onFlowGenerated,
    position = 'top-right',
    sx
}) => {
    const theme = useTheme()
    const [isOpen, setIsOpen] = useState(false)

    // Position styles:
    // Agentflow: Chat (20), Validate (75), AI (130), Expand (185)
    // Chatflow: Chat (20), AI (75), Expand (130)
    const getPositionStyles = () => {
        const aiButtonRight = isAgentCanvas ? 130 : 75
        switch (position) {
            case 'top-right':
                return { right: `${aiButtonRight}px`, top: '20px' }
            default:
                return { right: '20px', top: '20px' }
        }
    }

    const handleFlowGenerated = (flowData: any) => {
        if (onFlowGenerated) {
            onFlowGenerated(flowData)
        }
    }

    const positionStyles = getPositionStyles()

    // Hide button when chat is open
    if (chatPopupOpen) {
        return (
            <>
                <ChatBuilderPanel
                    open={isOpen}
                    onOpen={() => setIsOpen(true)}
                    onClose={() => setIsOpen(false)}
                    chatflowId={chatflowId}
                    isAgentCanvas={isAgentCanvas}
                    onFlowGenerated={handleFlowGenerated}
                />
            </>
        )
    }

    return (
        <>
            {/* Floating Action Button */}
            <Tooltip title='AI Chat Builder' placement='left'>
                <StyledFab
                    size='small'
                    onClick={() => setIsOpen(true)}
                    sx={{
                        position: 'absolute',
                        right: positionStyles.right,
                        top: positionStyles.top,
                        zIndex: 5,
                        background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                        color: 'white',
                        '&:hover': {
                            background: `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
                            transform: 'scale(1.05)'
                        },
                        transition: 'all 0.2s ease-in-out',
                        ...sx
                    }}
                    aria-label='Open AI Chat Builder'
                >
                    <IconSparkles size={20} />
                </StyledFab>
            </Tooltip>

            {/* Chat Builder Panel */}
            <ChatBuilderPanel
                open={isOpen}
                onOpen={() => setIsOpen(true)}
                onClose={() => setIsOpen(false)}
                chatflowId={chatflowId}
                isAgentCanvas={isAgentCanvas}
                onFlowGenerated={handleFlowGenerated}
            />
        </>
    )
}

export default CanvasAIButton
