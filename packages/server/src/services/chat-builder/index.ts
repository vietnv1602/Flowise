/**
 * Chat Builder Service
 *
 * Backend service for AI-powered flow generation using LangChain
 */

import { StatusCodes } from 'http-status-codes'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import logger from '../../utils/logger'
import { z } from 'zod'
import llmHubService from './llmHubService'
import langchainService from './langchainService'

/**
 * Request interface
 */
export interface ChatBuilderRequest {
    prompt: string
    provider?: string
    credentialId?: string
    flowType?: 'chatflow' | 'agentflow'
    requirements?: {
        tone?: string
        complexity?: string
        features?: string[]
        integrations?: string[]
    }
    conversation?: Array<{
        role: string
        content: string
    }>
    model: string // Model ID (required)
}

/**
 * Response interface
 */
export interface ChatBuilderResponse {
    flowData: {
        nodes: any[]
        edges: any[]
        viewport?: {
            x: number
            y: number
            zoom: number
        }
    }
    model: string
    tokensUsed?: number
    provider: string
}

// Zod schema for validation
const NodeType = z.object({
    id: z.string(),
    type: z.string(),
    position: z.object({
        x: z.number(),
        y: z.number()
    }),
    data: z.any().optional()
})

const EdgeType = z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    sourceHandle: z.string().optional(),
    targetHandle: z.string().optional()
})

const FlowDataType = z.object({
    nodes: z.array(NodeType),
    edges: z.array(EdgeType),
    viewport: z
        .object({
            x: z.number(),
            y: z.number(),
            zoom: z.number()
        })
        .optional()
})

/**
 * Get available nodes based on flow type
 */
const getAvailableNodes = async (flowType: string = 'chatflow') => {
    const appServer = getRunningExpressApp()
    const nodes = appServer.nodesPool.componentNodes

    if (flowType === 'agentflow') {
        // Return agent flow nodes
        const agentFlowNodes = []
        for (const node in nodes) {
            if (nodes[node].category === 'Agent Flows' || nodes[node].category === 'Agents') {
                agentFlowNodes.push({
                    name: nodes[node].name,
                    label: nodes[node].label,
                    description: nodes[node].description
                })
            }
        }
        return JSON.stringify(agentFlowNodes, null, 2)
    } else {
        // Return chat flow nodes
        const chatFlowNodes = []
        const excludeCategories = ['Agent Flows', 'Deprecated']

        for (const node in nodes) {
            if (!excludeCategories.includes(nodes[node].category)) {
                chatFlowNodes.push({
                    name: nodes[node].name,
                    label: nodes[node].label,
                    description: nodes[node].description,
                    category: nodes[node].category
                })
            }
        }
        return JSON.stringify(chatFlowNodes, null, 2)
    }
}

/**
 * Build system prompt for flow generation
 */
function buildSystemPrompt(flowType: string, availableNodes: string): string {
    return `You are an expert at building AI-powered ${flowType}s using Flowise.

Your task is to generate valid Flowise flow structures based on user descriptions.

**Available Nodes:**
${availableNodes}

**Flow Structure:**
A flow consists of:
- **nodes**: Array of node objects with id, position, type, data
- **edges**: Array of connections between nodes with source, target, handles

**Output Format:**
Return ONLY valid JSON with this structure. Do not include markdown formatting, just the raw JSON:
{
  "nodes": [
    {
      "id": "unique_id",
      "type": "customNode",
      "position": { "x": 100, "y": 100 },
      "data": {
        "id": "unique_id",
        "label": "Node Label",
        "name": "nodeName",
        "type": "NodeType",
        "category": "Category",
        "inputs": {}
      }
    }
  ],
  "edges": [
    {
      "id": "edge_id",
      "source": "source_node_id",
      "target": "target_node_id",
      "sourceHandle": "output",
      "targetHandle": "input"
    }
  ]
}

**Important Rules:**
1. All IDs must be unique (use format: node_1, node_2, etc.)
2. Positions must not overlap (space nodes 250px apart horizontally, 150px vertically)
3. All edges must connect valid node IDs
4. Nodes must have all required fields (id, label, name, type, category)
5. Start with input nodes (User Input, TextInput)
6. End with output nodes (TextOutput, AIOutput)
7. Include sensible default values for all inputs
8. Use appropriate node categories from the available nodes

**Design Principles:**
- Keep flows simple and modular
- Use appropriate LLM models (ChatOpenAI, ChatAnthropic, etc.)
- Add memory for multi-turn conversations
- Include retrieval for knowledge bases
- Handle errors gracefully

Generate the complete, valid JSON flow structure based on the user's requirements.`
}

/**
 * Extract JSON from response
 */
function extractJSONFromResponse(response: string): any {
    // Try to find JSON in markdown code blocks
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[1])
        } catch (e) {
            // Try the next method
        }
    }

    // Try to find raw JSON object
    const objectMatch = response.match(/\{[\s\S]*\}/)
    if (objectMatch) {
        try {
            return JSON.parse(objectMatch[0])
        } catch (e) {
            // Try the next method
        }
    }

    // Try parsing the entire response
    try {
        return JSON.parse(response)
    } catch (e) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            'Failed to extract valid JSON from AI response. Please try again.'
        )
    }
}

/**
 * Generate flow using AI (LangChain with Structured Output)
 */
const generateFlow = async (req: ChatBuilderRequest): Promise<ChatBuilderResponse> => {
    try {
        logger.info('Chat Builder: Starting flow generation with LangChain')

        // Validate request
        if (!req.prompt) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Prompt is required')
        }

        if (!req.model) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'Model is required')
        }

        // Get available nodes
        const availableNodes = await getAvailableNodes(req.flowType)

        logger.info('Chat Builder: Generating flow with structured output', {
            model: req.model,
            flowType: req.flowType
        })

        // Use LangChain service with structured output for reliable JSON generation
        const flowData = await langchainService.generateFlowWithStructuredOutput(req.prompt, req.model, availableNodes, 0.7)

        // Validate the response structure
        const validationResult = FlowDataType.safeParse(flowData)
        if (!validationResult.success) {
            logger.error('Chat Builder: Invalid flow structure generated', {
                errors: validationResult.error.errors
            })
            throw new InternalFlowiseError(
                StatusCodes.INTERNAL_SERVER_ERROR,
                `Generated flow has invalid structure: ${validationResult.error.errors.map((e) => e.message).join(', ')}`
            )
        }

        const validatedResult = validationResult.data

        logger.info('Chat Builder: Flow generation successful', {
            nodesCount: validatedResult.nodes?.length || 0,
            edgesCount: validatedResult.edges?.length || 0
        })

        return {
            flowData: {
                nodes: validatedResult.nodes || [],
                edges: validatedResult.edges || [],
                viewport: {
                    x: validatedResult.viewport?.x ?? 0,
                    y: validatedResult.viewport?.y ?? 0,
                    zoom: validatedResult.viewport?.zoom ?? 1
                }
            },
            model: req.model,
            provider: 'langchain'
        }
    } catch (error: any) {
        logger.error('Chat Builder: Flow generation failed', {
            error: error.message,
            stack: error.stack
        })
        throw error
    }
}

/**
 * Validate flow
 */
const validateFlow = async (flowData: any) => {
    const validationResult = FlowDataType.safeParse(flowData)

    if (!validationResult.success) {
        return {
            isValid: false,
            errors: validationResult.error.errors.map((err) => ({
                code: err.code,
                message: err.message,
                path: err.path.join('.')
            })),
            warnings: []
        }
    }

    // Additional validation checks
    const warnings: string[] = []

    // Check for disconnected nodes
    const connectedNodeIds = new Set()
    flowData.edges.forEach((edge: any) => {
        connectedNodeIds.add(edge.source)
        connectedNodeIds.add(edge.target)
    })

    flowData.nodes.forEach((node: any) => {
        if (!connectedNodeIds.has(node.id)) {
            warnings.push(`Node ${node.id} (${node.data?.label}) is not connected`)
        }
    })

    return {
        isValid: true,
        errors: [],
        warnings: warnings.map((msg) => ({ code: 'WARNING', message: msg }))
    }
}

/**
 * Get available providers (with models from LLM Hub)
 */
const getAvailableProviders = async () => {
    // Get providers grouped by provider from LLM Hub
    const providers = await llmHubService.getProviders()

    return {
        providers
    }
}

/**
 * Health check
 */
const healthCheck = async () => {
    const isLLMHubHealthy = await llmHubService.healthCheck()
    const isLangChainHealthy = await langchainService.healthCheck()
    const appServer = getRunningExpressApp()

    return {
        status: isLLMHubHealthy && isLangChainHealthy ? 'healthy' : 'degraded',
        llmhub: isLLMHubHealthy ? 'connected' : 'disconnected',
        langchain: isLangChainHealthy ? 'connected' : 'disconnected',
        componentNodesCount: Object.keys(appServer.nodesPool.componentNodes).length
    }
}

export default {
    generateFlow,
    validateFlow,
    getAvailableProviders,
    healthCheck
}
