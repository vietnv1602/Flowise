/**
 * AI Chat Builder Feature - Main Export
 *
 * This is the main entry point for the AI Chat Builder feature.
 * Export all components, hooks, services, and types for external use.
 */

// Types
export * from './types'

// Services
export { ChatBuilderService, getChatBuilderService, resetChatBuilderService } from './services/ChatBuilderService'
export { IChatBuilderService } from './services/IChatBuilderService'
export { FlowGeneratorFactory } from './services/flowGenerator/FlowGeneratorFactory'
export { IFlowGenerator } from './services/flowGenerator/IFlowGenerator'

// Hooks
export { useChatBuilder, UseChatBuilderReturn } from './hooks/useChatBuilder'

// Components
export * from './components'

// Utilities
export * from './utils'

// Integrations
export * from './integrations'
