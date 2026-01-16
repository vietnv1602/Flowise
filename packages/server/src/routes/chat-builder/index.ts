/**
 * Chat Builder Routes
 *
 * Express router for chat builder endpoints
 */

import express from 'express'
import chatBuilderController from '../../controllers/chat-builder'

const router = express.Router()

/**
 * POST /api/v1/chat-builder/conversations
 * Create a new conversation
 */
router.post('/conversations', chatBuilderController.createConversation)

/**
 * GET /api/v1/chat-builder/conversations
 * Get list of conversations for a flow
 */
router.get('/conversations', chatBuilderController.getConversations)

/**
 * GET /api/v1/chat-builder/conversations/:conversationId
 * Get conversation detail with messages
 */
router.get('/conversations/:conversationId', chatBuilderController.getConversationDetail)

/**
 * DELETE /api/v1/chat-builder/conversations/:conversationId
 * Delete conversation
 */
router.delete('/conversations/:conversationId', chatBuilderController.deleteConversation)

/**
 * DELETE /api/v1/chat-builder/conversation/:conversationId
 * Clear conversation history (deprecated - use delete)
 */
router.delete('/conversation/:conversationId', chatBuilderController.clearConversation)

/**
 * POST /api/v1/chat-builder/chat
 * Chat with streaming response and memory (MongoDB)
 */
router.post('/chat', chatBuilderController.chatStream)

/**
 * GET /api/v1/chat-builder/conversation/:conversationId
 * Get conversation history
 */
router.get('/conversation/:conversationId', chatBuilderController.getConversationHistory)

/**
 * POST /api/v1/chat-builder/generate
 * Generate a flow based on user description
 */
router.post('/generate', chatBuilderController.generateFlow)

/**
 * POST /api/v1/chat-builder/validate
 * Validate a generated flow
 */
router.post('/validate', chatBuilderController.validateFlow)

/**
 * GET /api/v1/chat-builder/providers
 * Get available AI providers
 */
router.get('/providers', chatBuilderController.getProviders)

/**
 * GET /api/v1/chat-builder/health
 * Health check endpoint
 */
router.get('/health', chatBuilderController.healthCheck)

export default router
