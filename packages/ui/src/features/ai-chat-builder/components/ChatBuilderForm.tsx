/**
 * ChatBuilderForm - Input Form Component
 *
 * Simple, clean form with integrated AI provider selector
 */

import React, { useState, useRef, useEffect } from 'react'
import { Box, Stack, FormControl, Select, MenuItem, Alert, IconButton } from '@mui/material'
import { IconArrowUp } from '@tabler/icons-react'
import { ChatBuilderRequest, AIProvider } from '../types'

export interface ChatBuilderFormProps {
    isGenerating?: boolean
    error?: string | null
    isAgentCanvas?: boolean
    disabled?: boolean
    onSubmit: (request: ChatBuilderRequest) => Promise<any>
    onCancel?: () => void
}

const PROVIDER_OPTIONS: Array<{ value: AIProvider; label: string }> = [
    { value: 'openai', label: 'GPT-4' },
    { value: 'anthropic', label: 'Claude' },
    { value: 'google', label: 'Gemini' },
    { value: 'cohere', label: 'Cohere' }
]

/**
 * Chat Builder Form Component
 */
export const ChatBuilderForm: React.FC<ChatBuilderFormProps> = ({
    isGenerating = false,
    error,
    isAgentCanvas = false,
    disabled = false,
    onSubmit
}) => {
    const [description, setDescription] = useState('')
    const [provider, setProvider] = useState<AIProvider>('openai')
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Auto-focus input when component mounts or not disabled
    useEffect(() => {
        if (!disabled && !isGenerating && textareaRef.current) {
            textareaRef.current.focus()
        }
    }, [disabled, isGenerating])

    const handleSubmit = async () => {
        if (!description.trim() || isGenerating) return

        const request: ChatBuilderRequest = {
            description: description.trim(),
            selectedProvider: provider,
            flowType: isAgentCanvas ? 'agentflow' : 'chatflow',
            requirements: {
                complexity: 'medium',
                tone: 'professional'
            }
        }

        // Store current description and clear input immediately
        // The message is already captured in request and will be added to chat by the hook
        const currentDescription = description.trim()
        setDescription('')

        try {
            await onSubmit(request)
            // Re-focus the textarea for next input after submission completes
            if (!isGenerating) {
                setTimeout(() => {
                    if (textareaRef.current) {
                        textareaRef.current.focus()
                    }
                }, 100)
            }
        } catch (error) {
            // Restore text on error so user can retry
            setDescription(currentDescription)
            console.error('Submit failed:', error)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }
    }

    return (
        <Stack spacing={1}>
            {/* Error Display */}
            {error && (
                <Alert severity='error' variant='outlined' sx={{ mb: 1 }}>
                    {error}
                </Alert>
            )}

            {/* Input Area with Provider and Send Button */}
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    p: 1.5,
                    borderRadius: 2.5,
                    background: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                    border: '1px solid',
                    borderColor: 'divider',
                    position: 'relative',
                    zIndex: 1,
                    transition: 'all 0.2s ease',
                    '&:hover': {
                        borderColor: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'),
                        background: (theme) => (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')
                    }
                }}
            >
                {/* Text Input - Native textarea with proper contrast */}
                <Box
                    sx={{
                        position: 'relative',
                        width: '100%',
                        pointerEvents: 'auto'
                    }}
                >
                    <textarea
                        ref={textareaRef}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={false}
                        placeholder='Describe your flow...'
                        rows={3}
                        style={{
                            width: '100%',
                            minWidth: '100%',
                            maxWidth: '100%',
                            padding: '12px',
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            resize: 'vertical',
                            minHeight: '80px',
                            maxHeight: '200px',
                            fontFamily: 'inherit',
                            fontSize: '14px',
                            lineHeight: '1.5',
                            color: 'inherit',
                            borderRadius: '8px',
                            pointerEvents: 'auto',
                            cursor: 'text'
                        }}
                    />
                </Box>

                {/* Bottom Row: Provider and Send Button */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                    {/* Provider Selector */}
                    <FormControl size='small' disabled={isGenerating || disabled}>
                        <Select
                            value={provider}
                            onChange={(e) => setProvider(e.target.value as AIProvider)}
                            sx={{
                                width: 100,
                                height: 32,
                                fontSize: '0.75rem',
                                bgcolor: 'background.paper',
                                '& .MuiSelect-select': {
                                    py: 0.5,
                                    fontSize: '0.75rem'
                                }
                            }}
                        >
                            {PROVIDER_OPTIONS.map((option) => (
                                <MenuItem key={option.value} value={option.value} sx={{ fontSize: '0.75rem' }}>
                                    {option.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {/* Send Button */}
                    <IconButton
                        type='button'
                        onClick={handleSubmit}
                        disabled={!description.trim() || isGenerating || disabled}
                        sx={{
                            width: 36,
                            height: 36,
                            flexShrink: 0,
                            borderRadius: 1.5,
                            background: !description.trim() || isGenerating || disabled ? 'action.disabled' : 'primary.main',
                            color: 'white',
                            transition: 'all 0.2s ease',
                            '&:hover:not(:disabled)': {
                                background: 'primary.dark',
                                transform: 'scale(1.05)'
                            },
                            '&:active:not(:disabled)': {
                                transform: 'scale(0.95)'
                            }
                        }}
                    >
                        <IconArrowUp size={16} />
                    </IconButton>
                </Box>
            </Box>
        </Stack>
    )
}

export default ChatBuilderForm
