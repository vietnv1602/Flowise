/**
 * ChatBuilderForm - Input Form Component
 *
 * Simple, clean form with model selector from LLM Hub
 */

import React, { useState, useRef, useEffect } from 'react'
import { Box, Stack, FormControl, Select, MenuItem, Alert, IconButton, CircularProgress } from '@mui/material'
import { IconArrowUp } from '@tabler/icons-react'
import { ChatBuilderRequest } from '../types'

export interface ChatBuilderFormProps {
    isGenerating?: boolean
    error?: string | null
    isAgentCanvas?: boolean
    disabled?: boolean
    onSubmit: (request: ChatBuilderRequest) => Promise<any>
    onCancel?: () => void
}

export interface LLMModel {
    id: string
    name: string
    provider: string
}

export interface ProviderData {
    id: string
    name: string
    displayName: string
    models: LLMModel[]
    requiresCredential: boolean
    defaultModel?: string
}

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
    const [providers, setProviders] = useState<ProviderData[]>([])
    const [allModels, setAllModels] = useState<Array<LLMModel & { providerName: string }>>([])
    const [selectedModel, setSelectedModel] = useState<string>('')
    const [isLoadingModels, setIsLoadingModels] = useState(true)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Fetch providers and models on mount
    useEffect(() => {
        const fetchProviders = async () => {
            setIsLoadingModels(true)
            try {
                const response = await fetch('/api/v1/chat-builder/providers')
                if (response.ok) {
                    const data = await response.json()
                    const providersData: ProviderData[] = data.providers || []
                    setProviders(providersData)

                    // Flatten all models into one list
                    const models = providersData.flatMap((provider) =>
                        provider.models.map((model) => ({
                            ...model,
                            providerName: provider.displayName
                        }))
                    )
                    setAllModels(models)

                    // Select first model by default
                    if (models.length > 0) {
                        setSelectedModel(models[0].id)
                    }
                }
            } catch (error) {
                console.error('Failed to fetch providers:', error)
            } finally {
                setIsLoadingModels(false)
            }
        }

        fetchProviders()
    }, [])

    // Auto-focus input when component mounts or not disabled
    useEffect(() => {
        if (!disabled && !isGenerating && textareaRef.current) {
            textareaRef.current.focus()
        }
    }, [disabled, isGenerating])

    const handleSubmit = async () => {
        if (!description.trim() || isGenerating || !selectedModel) return

        const request: ChatBuilderRequest = {
            description: description.trim(),
            selectedProvider: 'llmhub',
            flowType: isAgentCanvas ? 'agentflow' : 'chatflow',
            model: selectedModel,
            requirements: {
                complexity: 'medium',
                tone: 'professional'
            }
        }

        // Store current description and clear input immediately
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

            {/* Input Area with Model and Send Button */}
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
                {/* Text Input */}
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

                {/* Bottom Row: Model Selector and Send Button */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                    {/* Model Selector */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {isLoadingModels && <CircularProgress size={14} sx={{ ml: 0.5 }} />}

                        <FormControl size='small' disabled={isGenerating || disabled}>
                            <Select
                                value={selectedModel}
                                onChange={(e) => setSelectedModel(e.target.value)}
                                displayEmpty
                                MenuProps={{
                                    sx: {
                                        zIndex: 14000,
                                        '& .MuiMenu-paper': {
                                            maxHeight: 400,
                                            zIndex: 14000
                                        }
                                    },
                                    anchorOrigin: {
                                        vertical: 'bottom',
                                        horizontal: 'left'
                                    },
                                    transformOrigin: {
                                        vertical: 'top',
                                        horizontal: 'left'
                                    },
                                    disableScrollLock: true
                                }}
                                sx={{
                                    width: 250,
                                    height: 32,
                                    fontSize: '0.75rem',
                                    bgcolor: 'background.paper',
                                    '& .MuiSelect-select': {
                                        py: 0.5,
                                        fontSize: '0.75rem'
                                    }
                                }}
                            >
                                {allModels.map((model) => (
                                    <MenuItem key={model.id} value={model.id} sx={{ fontSize: '0.75rem', py: 0.5 }}>
                                        {model.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>

                    {/* Send Button */}
                    <IconButton
                        type='button'
                        onClick={handleSubmit}
                        disabled={!description.trim() || isGenerating || disabled || !selectedModel}
                        sx={{
                            width: 36,
                            height: 36,
                            flexShrink: 0,
                            borderRadius: 1.5,
                            background:
                                !description.trim() || isGenerating || disabled || !selectedModel ? 'action.disabled' : 'primary.main',
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
