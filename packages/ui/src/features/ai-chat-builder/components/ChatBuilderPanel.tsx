/**
 * ChatBuilderPanel - Main Panel Component
 *
 * Simple, clean panel for AI Chat Builder
 */

import React, { useEffect, useState } from 'react'
import {
    Drawer,
    Box,
    Typography,
    IconButton,
    Divider,
    useTheme,
    useMediaQuery,
    List,
    ListItem,
    ListItemText,
    CircularProgress,
    Popover,
    Paper
} from '@mui/material'
import { IconX, IconSparkles, IconPlus, IconClock, IconTrash } from '@tabler/icons-react'
import { useChatBuilder } from '../hooks/useChatBuilder'
import { ChatBuilderForm } from './ChatBuilderForm'
import { GenerationProgress } from './GenerationProgress'
import { ChatConversation } from './ChatConversation'
import { Conversation, ChatBuilderRequest } from '../types'

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
    const { state, messages, generateFlow, reset, closePanel, isReady, clearMessages, loadMessages, chat } = useChatBuilder({
        chatflowId: _chatflowId,
        isAgentCanvas,
        onFlowGenerated
    })

    // Replace URL params with local state to prevent history stack issues
    const [chatConversationId, setChatConversationId] = useState<string | null>(null)

    // Conversation states
    const [historyPopoverAnchor, setHistoryPopoverAnchor] = useState<HTMLElement | null>(null)
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [loadingConversations, setLoadingConversations] = useState(false)
    const [creatingConversation, setCreatingConversation] = useState(false)

    // Use controlled or uncontrolled mode
    const isOpen = controlledOpen !== undefined ? controlledOpen : state.isOpen

    const handleClose = () => {
        if (onClose) {
            onClose()
        } else {
            closePanel()
        }
    }

    // Load conversation when chatConversationId changes in URL
    useEffect(() => {
        if (chatConversationId && !state.isGenerating) {
            handleLoadConversation(chatConversationId)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatConversationId])

    // Auto-create conversation if none exists when opening
    useEffect(() => {
        if (isOpen && !chatConversationId && !creatingConversation && !state.isGenerating) {
            const checkAndCreate = async () => {
                try {
                    const service = (await import('../services/ChatBuilderService')).getChatBuilderService()
                    const flowId = _chatflowId || 'default'
                    const flowType = isAgentCanvas ? 'agentflow' : 'chatflow'
                    const convs = await service.getConversations(flowId, flowType)

                    if (convs.length === 0) {
                        await handleCreateConversation()
                    }
                } catch (error) {
                    console.error('Auto-create check failed:', error)
                }
            }
            checkAndCreate()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, chatConversationId])

    // Load conversations when history popover opens
    const handleOpenHistoryPopover = async (event: React.MouseEvent<HTMLElement>) => {
        setHistoryPopoverAnchor(event.currentTarget)
        setLoadingConversations(true)
        try {
            const service = (await import('../services/ChatBuilderService')).getChatBuilderService()
            const flowId = _chatflowId || 'default'
            const flowType = isAgentCanvas ? 'agentflow' : 'chatflow'
            const convs = await service.getConversations(flowId, flowType)
            setConversations(convs)
        } catch (error) {
            console.error('Failed to load conversations:', error)
        } finally {
            setLoadingConversations(false)
        }
    }

    // Create new conversation with auto-generated title
    const handleCreateConversation = async () => {
        setCreatingConversation(true)
        try {
            const service = (await import('../services/ChatBuilderService')).getChatBuilderService()
            const flowId = _chatflowId || 'default'
            const flowType = isAgentCanvas ? 'agentflow' : 'chatflow'

            const now = new Date()
            const title = `Conversation ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

            const newConvId = await service.createConversation(flowId, flowType, title)

            // Update state instead of URL
            if (newConvId) {
                setChatConversationId(newConvId)
            }

            // Clear messages to start fresh
            clearMessages()
        } catch (error) {
            console.error('Failed to create conversation:', error)
        } finally {
            setCreatingConversation(false)
        }
    }

    // Load conversation
    const handleLoadConversation = async (conversationId: string) => {
        try {
            const service = (await import('../services/ChatBuilderService')).getChatBuilderService()
            const detail = await service.getConversationDetail(conversationId)

            if (detail && detail.messages) {
                console.log('[ChatBuilder] Loaded messages:', detail.messages)
                const mappedMessages = detail.messages.map((msg: any) => ({
                    id: msg.id || `${Date.now()}_${Math.random()}`,
                    role: msg.role === 'ai' ? 'assistant' : (msg.role === 'human' ? 'user' : (msg.role || 'user')),
                    content: msg.content || msg.message || '',
                    timestamp: msg.createdDate ? new Date(msg.createdDate) : new Date()
                }))
                // Explicitly clear first (though loadMessages replaces) just to be safe visually
                clearMessages()
                loadMessages(mappedMessages)

                // Update state if not already matching
                if (chatConversationId !== conversationId) {
                    setChatConversationId(conversationId)
                }
            }

            setHistoryPopoverAnchor(null)
        } catch (error) {
            console.error('Failed to load conversation:', error)
        }
    }

    // Delete conversation
    const handleDeleteConversation = async (conversationId: string) => {
        try {
            const service = (await import('../services/ChatBuilderService')).getChatBuilderService()
            await service.deleteConversation(conversationId)

            // If deleting current conversation, clear ID and reset chat
            if (conversationId === chatConversationId) {
                setChatConversationId(null)
                clearMessages()
            }

            // Reload conversations
            const flowId = _chatflowId || 'default'
            const flowType = isAgentCanvas ? 'agentflow' : 'chatflow'
            const convs = await service.getConversations(flowId, flowType)
            setConversations(convs)
        } catch (error) {
            console.error('Failed to delete conversation:', error)
        }
    }

    // Handle form submit - call chat with flowId, flowType and model
    const handleSubmit = async (request: ChatBuilderRequest) => {
        const flowId = _chatflowId || 'default'
        const flowType = isAgentCanvas ? 'agentflow' : 'chatflow'
        // Pass the actual conversation ID (sessionId) to the chat function
        const currentChatConversationId = chatConversationId

        await chat(request.description, flowId, flowType, request.model, currentChatConversationId || undefined, (newSessionId) => {
            // Update state
            if (!currentChatConversationId || currentChatConversationId !== newSessionId) {
                setChatConversationId(newSessionId)
            }
        })
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
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <IconButton
                        size='small'
                        onClick={handleCreateConversation}
                        disabled={creatingConversation}
                        title='New conversation'
                    >
                        {creatingConversation ? <CircularProgress size={16} /> : <IconPlus size={16} />}
                    </IconButton>
                    <IconButton
                        size='small'
                        onClick={handleOpenHistoryPopover}
                        title='Conversation history'
                    >
                        <IconClock size={16} />
                    </IconButton>
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
            </Box>

            {/* Conversation History Popover */}
            <Popover
                open={Boolean(historyPopoverAnchor)}
                anchorEl={historyPopoverAnchor}
                onClose={() => setHistoryPopoverAnchor(null)}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
            >
                <Paper sx={{ width: 320, maxHeight: 400 }}>
                    {loadingConversations ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                            <CircularProgress size={24} />
                        </Box>
                    ) : conversations.length === 0 ? (
                        <Typography variant='body2' color='text.secondary' sx={{ py: 3, px: 2, textAlign: 'center' }}>
                            No conversations yet. Start chatting to create one!
                        </Typography>
                    ) : (
                        <List dense>
                            {conversations.map((conv) => (
                                <ListItem
                                    key={conv.conversationId}
                                    button
                                    onClick={() => handleLoadConversation(conv.conversationId)}
                                    sx={{ borderBottom: '1px solid', borderBottomColor: 'divider' }}
                                >
                                    <ListItemText
                                        primary={conv.title}
                                        secondary={new Date(conv.createdAt).toLocaleDateString()}
                                        primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                                        secondaryTypographyProps={{ variant: 'caption' }}
                                    />
                                    <IconButton
                                        edge='end'
                                        size='small'
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleDeleteConversation(conv.conversationId)
                                        }}
                                    >
                                        <IconTrash size={14} />
                                    </IconButton>
                                </ListItem>
                            ))}
                        </List>
                    )}
                </Paper>
            </Popover>

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
            <Box
                sx={{
                    px: 2,
                    pb: 2,
                    position: 'relative',
                    zIndex: 2,
                    pointerEvents: 'auto',
                    '& .MuiPopover-root': {
                        zIndex: 14000
                    }
                }}
            >
                <ChatBuilderForm
                    isGenerating={state.isGenerating}
                    error={state.error}
                    isAgentCanvas={isAgentCanvas}
                    onSubmit={handleSubmit}
                    onCancel={reset}
                    disabled={!isReady || state.isGenerating}
                />
            </Box>
        </Drawer>
    )
}

export default ChatBuilderPanel
