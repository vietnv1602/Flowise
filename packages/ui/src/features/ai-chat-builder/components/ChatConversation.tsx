/**
 * ChatConversation - Chat Messages Display
 *
 * Simple, clean display of conversation history
 * AI messages shown as plain text (no bubble), user messages in bubbles
 */

import React, { useEffect, useRef } from 'react'
import { Box, Typography } from '@mui/material'
import { ChatMessage } from '../types'

export interface ChatConversationProps {
    messages: ChatMessage[]
}

/**
 * Chat Conversation Component
 */
export const ChatConversation: React.FC<ChatConversationProps> = ({ messages }) => {
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    if (messages.length === 0) {
        return (
            <Box
                sx={{
                    p: 3,
                    textAlign: 'center',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <Typography variant='body2' color='text.secondary'>
                    Start by describing what you want to build
                </Typography>
            </Box>
        )
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2 }}>
            {messages.map((message) => (
                <ChatMessageBubble key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
        </Box>
    )
}

/**
 * Individual Message Bubble Component
 */
interface ChatMessageBubbleProps {
    message: ChatMessage
}

const ChatMessageBubble: React.FC<ChatMessageBubbleProps> = ({ message }) => {
    const isAssistant = message.role === 'assistant' || message.role === 'system'

    // Parse markdown-like syntax (basic implementation for streaming)
    const formatContent = (content: string): React.ReactNode => {
        // Split into paragraphs
        const paragraphs = content.split(/\n\n+/)

        return paragraphs.map((paragraph, pIndex) => {
            // Handle code blocks
            if (paragraph.startsWith('```')) {
                const codeContent = paragraph.replace(/```\w*\n?/g, '')
                return (
                    <Box
                        key={pIndex}
                        sx={{
                            bgcolor: 'grey.900',
                            color: 'grey.100',
                            p: 1.5,
                            borderRadius: 1,
                            fontFamily: 'monospace',
                            fontSize: '0.875rem',
                            overflow: 'auto',
                            my: 1
                        }}
                    >
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{codeContent}</pre>
                    </Box>
                )
            }

            // Handle inline code
            const lines = paragraph.split('\n')
            return (
                <Box key={pIndex} sx={{ mb: 1 }}>
                    {lines.map((line, lIndex) => {
                        // Bold text
                        if (line.startsWith('**') && line.endsWith('**')) {
                            const text = line.replace(/\*\*/g, '')
                            return (
                                <Typography key={lIndex} variant='body2' fontWeight='bold' sx={{ mt: 0.5 }}>
                                    {text}
                                </Typography>
                            )
                        }

                        // Headers
                        if (line.startsWith('**')) {
                            const text = line.replace(/\*\*/g, '')
                            return (
                                <Typography key={lIndex} variant='subtitle2' fontWeight='bold' sx={{ mt: 1 }}>
                                    {text}
                                </Typography>
                            )
                        }

                        // Lists
                        if (line.trim().startsWith('- ')) {
                            const text = line.trim().replace(/^-\s*/, '')
                            return (
                                <Typography key={lIndex} variant='body2' sx={{ ml: 1 }}>
                                    • {text}
                                </Typography>
                            )
                        }

                        // Numbered lists
                        if (line.match(/^\d+\.\s/)) {
                            return (
                                <Typography key={lIndex} variant='body2' sx={{ ml: 1 }}>
                                    {line}
                                </Typography>
                            )
                        }

                        // Regular text
                        if (line.trim()) {
                            return (
                                <Typography
                                    key={lIndex}
                                    variant='body2'
                                    sx={{ whiteSpace: 'pre-wrap' }}
                                    dangerouslySetInnerHTML={{
                                        __html: line
                                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                            .replace(
                                                /`([^`]+)`/g,
                                                '<code style="background:rgba(0,0,0,0.1);padding:2px 4px;border-radius:3px;font-family:monospace;">$1</code>'
                                            )
                                    }}
                                />
                            )
                        }

                        return <br key={lIndex} />
                    })}
                </Box>
            )
        })
    }

    // AI messages: plain text without bubble
    if (isAssistant) {
        return <Box sx={{ width: '100%', py: 0.5 }}>{formatContent(message.content)}</Box>
    }

    // User messages: simple clean bubble on the right
    return (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Box
                sx={{
                    p: 1.5,
                    px: 2,
                    maxWidth: '75%',
                    bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.800' : 'grey.200'),
                    color: 'text.primary',
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider'
                }}
            >
                <Typography
                    variant='body2'
                    sx={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        lineHeight: 1.5
                    }}
                >
                    {message.content}
                </Typography>
            </Box>
        </Box>
    )
}

export default ChatConversation
