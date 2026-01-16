/**
 * Chat Builder Controller
 *
 * HTTP request handlers for chat builder endpoints
 */

import { Request, Response, NextFunction } from 'express'
import chatBuilderService from '../../services/chat-builder'
import langchainService from '../../services/chat-builder/langchainService'
import logger from '../../utils/logger'

/**
 * Generate flow based on user description
 */
const generateFlow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await chatBuilderService.generateFlow(req.body)
        return res.json(result)
    } catch (error) {
        next(error)
    }
}

/**
 * Chat with streaming response and memory
 */
const chatStream = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { message, model, conversationId, flowId, flowType } = req.body

        if (!message) {
            return res.status(400).json({ error: 'Message is required' })
        }

        if (!model) {
            return res.status(400).json({ error: 'Model is required' })
        }

        // Generate conversation ID if not provided - format: {flowId}_{timestamp}
        const convId = conversationId || `${flowId || 'default'}_${Date.now()}`

        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')

        // Send conversation ID in first message
        res.write(`data: ${JSON.stringify({ type: 'conversationId', data: convId })}\n\n`)

        // Ensure conversation metadata exists (sync for implicit creation)
        await langchainService.ensureConversationMetadata(convId, flowId || 'default', flowType || 'chatflow')

        // Call streaming service
        await langchainService.chatWithMemoryStream(
            {
                model,
                messages: [{ role: 'user', content: message }],
                temperature: 0.7
            },
            convId,
            // onChunk
            (chunk: string) => {
                res.write(`data: ${JSON.stringify({ type: 'chunk', data: chunk })}\n\n`)
            },
            // onComplete
            (fullResponse: string) => {
                res.write(`data: ${JSON.stringify({ type: 'done', data: fullResponse })}\n\n`)
                res.end()
            },
            // onError
            (error: Error) => {
                logger.error('[ChatBuilder] Stream error', { error: error.message })
                res.write(`data: ${JSON.stringify({ type: 'error', data: error.message })}\n\n`)
                res.end()
            }
        )
    } catch (error: any) {
        logger.error('[ChatBuilder] Chat stream failed', { error: error.message, stack: error.stack })
        next(error)
    }
}

/**
 * Create a new conversation
 */
const createConversation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { flowId, flowType, title } = req.body

        if (!flowId) {
            return res.status(400).json({ error: 'Flow ID is required' })
        }

        const conversationId = await langchainService.createConversation(flowId, flowType || 'chatflow', title)

        return res.json({
            conversationId,
            flowId,
            flowType: flowType || 'chatflow',
            title: title || 'New Conversation',
            createdAt: new Date()
        })
    } catch (error) {
        next(error)
    }
}

/**
 * Get list of conversations for a flow
 */
const getConversations = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { flowId, flowType } = req.query

        if (!flowId) {
            return res.status(400).json({ error: 'Flow ID is required' })
        }

        const conversations = await langchainService.getConversations(
            flowId as string,
            flowType as string
        )

        return res.json({ conversations })
    } catch (error) {
        next(error)
    }
}

/**
 * Get conversation detail with messages
 */
const getConversationDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { conversationId } = req.params

        if (!conversationId) {
            return res.status(400).json({ error: 'Conversation ID is required' })
        }

        const detail = await langchainService.getConversationDetail(conversationId)

        return res.json(detail)
    } catch (error) {
        next(error)
    }
}

/**
 * Delete conversation
 */
const deleteConversation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { conversationId } = req.params

        if (!conversationId) {
            return res.status(400).json({ error: 'Conversation ID is required' })
        }

        await langchainService.deleteConversation(conversationId)

        return res.json({ success: true })
    } catch (error) {
        next(error)
    }
}

/**
 * Clear conversation history
 */
const clearConversation = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { conversationId } = req.params

        if (!conversationId) {
            return res.status(400).json({ error: 'Conversation ID is required' })
        }

        await langchainService.clearConversation(conversationId)

        return res.json({ success: true, message: 'Conversation cleared' })
    } catch (error) {
        next(error)
    }
}

/**
 * Get conversation history (deprecated - use getConversationDetail)
 */
const getConversationHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { conversationId } = req.params

        if (!conversationId) {
            return res.status(400).json({ error: 'Conversation ID is required' })
        }

        const messages = await langchainService.getConversationHistory(conversationId)

        // Format messages for response
        const formattedMessages = messages.map((msg) => ({
            role: msg.constructor.name.toLowerCase().replace('message', ''),
            content: msg.content.toString()
        }))

        return res.json({ conversationId, messages: formattedMessages })
    } catch (error) {
        next(error)
    }
}

/**
 * Validate generated flow
 */
const validateFlow = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await chatBuilderService.validateFlow(req.body.flowData)
        return res.json(result)
    } catch (error) {
        next(error)
    }
}

/**
 * Get available AI providers
 */
const getProviders = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await chatBuilderService.getAvailableProviders()
        return res.json(result)
    } catch (error) {
        next(error)
    }
}

/**
 * Health check endpoint
 */
const healthCheck = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await chatBuilderService.healthCheck()
        return res.json(result)
    } catch (error) {
        next(error)
    }
}

export default {
    generateFlow,
    chatStream,
    createConversation,
    getConversations,
    getConversationDetail,
    deleteConversation,
    clearConversation,
    getConversationHistory,
    validateFlow,
    getProviders,
    healthCheck
}
