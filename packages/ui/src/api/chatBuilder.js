/**
 * Chat Builder API Client
 *
 * Frontend API client for chat builder endpoints
 */

import client from './client'

const generateFlow = (body) => {
    return client.post('/chat-builder/generate', body)
}

const validateFlow = (body) => {
    return client.post('/chat-builder/validate', body)
}

const getProviders = () => {
    return client.get('/chat-builder/providers')
}

const healthCheck = () => {
    return client.get('/chat-builder/health')
}

export default {
    generateFlow,
    validateFlow,
    getProviders,
    healthCheck
}
