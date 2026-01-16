import { ICommonObject } from './Interface'
import { z } from 'zod'
import { StructuredOutputParser } from '@langchain/core/output_parsers'
import { isEqual, get, cloneDeep } from 'lodash'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'

// Define NodePosition schema
const NodePositionType = z.object({
    x: z.number().describe('X coordinate of the node position'),
    y: z.number().describe('Y coordinate of the node position')
})

// Define EdgeData schema
const EdgeDataType = z
    .object({
        edgeLabel: z.string().optional().describe('Label for the edge'),
        sourceColor: z.string().optional().describe('Color of source node'),
        targetColor: z.string().optional().describe('Color of target node')
    })
    .optional()
    .describe('Data associated with the edge')

// Define NodeData schema
const NodeDataType = z
    .object({
        label: z.string().optional().describe('Label for the node'),
        name: z.string().optional().describe('Name of the node'),
        type: z.string().optional().describe('Type of the node'),
        category: z.string().optional().describe('Category of the node'),
        inputs: z.record(z.any()).optional().describe('Node inputs'),
        id: z.string().optional().describe('Node ID')
    })
    .optional()
    .describe('Data associated with the node')

const NodeType = z.object({
    id: z.string().describe('Unique identifier for the node'),
    type: z.string().describe('Type of the node (e.g., customNode)'),
    position: NodePositionType.describe('Position of the node in the UI'),
    data: NodeDataType.describe('Data associated with the node')
})

const EdgeType = z.object({
    id: z.string().describe('Unique identifier for the edge'),
    source: z.string().describe('ID of the source node'),
    target: z.string().describe('ID of the target node'),
    sourceHandle: z.string().optional().describe('ID of the source handle'),
    targetHandle: z.string().optional().describe('ID of the target handle'),
    data: EdgeDataType.optional().describe('Data associated with the edge')
})

const ViewportSchema = z
    .object({
        x: z.number().optional().describe('X position of viewport'),
        y: z.number().optional().describe('Y position of viewport'),
        zoom: z.number().optional().describe('Zoom level of viewport')
    })
    .optional()
    .describe('Viewport configuration')

const NodesEdgesType = z
    .object({
        nodes: z.array(NodeType).describe('Array of nodes in the workflow'),
        edges: z.array(EdgeType).describe('Array of edges connecting the nodes'),
        viewport: ViewportSchema.optional().describe('Viewport configuration')
    })
    .describe('Generate ChatFlow nodes and edges')

interface NodePosition {
    x: number
    y: number
}

interface EdgeData {
    edgeLabel?: string
    sourceColor?: string
    targetColor?: string
}

interface NodeData {
    label?: string
    name?: string
    type?: string
    category?: string
    id?: string
    inputs?: Record<string, any>
    inputAnchors?: InputAnchor[]
    inputParams?: InputParam[]
    outputs?: Record<string, any>
    outputAnchors?: OutputAnchor[]
    credential?: string
    color?: string
    [key: string]: any
}

interface Node {
    id: string
    type: string
    position: NodePosition
    data: NodeData
}

interface Edge {
    id: string
    source: string
    target: string
    sourceHandle?: string
    targetHandle?: string
    data?: EdgeData
}

interface InputAnchor {
    id: string
    label: string
    name: string
    type?: string
    [key: string]: any
}

interface InputParam {
    id: string
    name: string
    label?: string
    type?: string
    display?: boolean
    show?: Record<string, any>
    hide?: Record<string, any>
    [key: string]: any
}

interface OutputAnchor {
    id: string
    label: string
    name: string
}

interface Viewport {
    x?: number
    y?: number
    zoom?: number
}

interface ChatFlowConfig {
    prompt: string
    componentNodes: Record<string, any>
    selectedChatModel: {
        provider: string
        modelName: string
        credentialId?: string
        name?: string
    }
    [key: string]: any
}

interface GenerateChatFlowResult {
    nodes?: Node[]
    edges?: Edge[]
    viewport?: Viewport
    error?: string
    content?: string
}

/**
 * Generate a chat flow using AI
 * @param config - Configuration containing prompt, component nodes, and chat model
 * @param question - The user's question/request for flow generation
 * @param options - Additional options including logger
 * @returns Generated flow with nodes and edges
 */
export const generateChatFlow = async (
    config: ChatFlowConfig,
    question: string,
    options: ICommonObject
): Promise<GenerateChatFlowResult> => {
    try {
        const logger = options?.logger
        if (logger) {
            logger.info('[generateChatFlow] Starting flow generation')
        }

        const result = await generateNodesEdges(config, question, options)

        if (result.error) {
            if (logger) {
                logger.error('[generateChatFlow] Error generating nodes and edges', { error: result.error })
            }
            return { error: result.error }
        }

        const { nodes, edges } = generateNodesData(result, config)

        const updatedNodes = await initializeNodes(nodes, config, options)

        const updatedEdges = updateEdges(edges, updatedNodes)

        if (logger) {
            logger.info('[generateChatFlow] Flow generation successful', {
                nodesCount: updatedNodes?.length || 0,
                edgesCount: updatedEdges?.length || 0
            })
        }

        return {
            nodes: updatedNodes,
            edges: updatedEdges,
            viewport: result.viewport || { x: 0, y: 0, zoom: 1 }
        }
    } catch (error: any) {
        const logger = options?.logger
        if (logger) {
            logger.error('[generateChatFlow] Error', { error: error.message, stack: error.stack })
        }
        return { error: error.message || 'Unknown error occurred' }
    }
}

const updateEdges = (edges: Edge[], nodes: Node[]): Edge[] => {
    // Filter out edges that do not exist in nodes
    const validEdges = edges.filter((edge) => {
        return nodes.some((node) => node.id === edge.source || node.id === edge.target)
    })

    // Find node colors
    const findNodeColor = (nodeId: string) => {
        const node = nodes.find((node) => node.id === nodeId)
        return node?.data?.color
    }

    const updatedEdges = validEdges.map((edge) => {
        return {
            ...edge,
            data: {
                ...edge.data,
                sourceColor: findNodeColor(edge.source),
                targetColor: findNodeColor(edge.target)
            }
        } as Edge
    })

    return updatedEdges
}

const initializeNodes = async (nodes: Node[], config: ChatFlowConfig, options: ICommonObject): Promise<Node[]> => {
    const logger = options?.logger
    for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i]
        let nodeName = node.data?.name

        // If nodeName is not found in data.name, try extracting from node.id
        if (!nodeName || !config.componentNodes[nodeName]) {
            nodeName = node.id.split('_')[0]
        }

        const componentNode = config.componentNodes[nodeName]
        if (!componentNode) {
            if (logger) {
                logger.warn(`[initializeNodes] Component node not found: ${nodeName}`)
            }
            continue
        }

        const initializedNodeData = initNode(cloneDeep(componentNode), node.id)
        nodes[i].data = {
            ...initializedNodeData,
            label: node.data?.label || initializedNodeData.label,
            inputs: {
                ...initializedNodeData.inputs,
                ...node.data?.inputs
            }
        }
    }

    return nodes
}

const generateNodesEdges = async (config: ChatFlowConfig, question: string, options?: ICommonObject): Promise<GenerateChatFlowResult> => {
    try {
        const chatModelName =
            config.selectedChatModel?.name ||
            Object.keys(config.componentNodes).find((key) => config.componentNodes[key]?.category === 'LLMs')

        if (!chatModelName) {
            throw new Error('Chat model component not found')
        }

        const chatModelComponent = config.componentNodes[chatModelName]
        if (!chatModelComponent) {
            throw new Error('Chat model component not found')
        }

        const nodeInstanceFilePath = chatModelComponent.filePath as string
        const nodeModule = await import(nodeInstanceFilePath)
        const newToolNodeInstance = new nodeModule.nodeClass()
        const model = (await newToolNodeInstance.init(config.selectedChatModel, '', options)) as BaseChatModel

        // Create a parser to validate the output
        const parser = StructuredOutputParser.fromZodSchema(NodesEdgesType as any)

        // Generate JSON schema from our Zod schema
        const formatInstructions = parser.getFormatInstructions()

        // Full conversation with system prompt and instructions
        const messages = [
            {
                role: 'system',
                content: `${config.prompt}\n\n${formatInstructions}\n\nMake sure to follow the exact JSON schema structure.`
            },
            {
                role: 'user',
                content: question
            }
        ]

        // Standard completion without structured output
        const response = await model.invoke(messages)

        // Try to extract JSON from the response
        const responseContent = response.content.toString()
        const jsonMatch = responseContent.match(/```json\n([\s\S]*?)\n```/) || responseContent.match(/{[\s\S]*?}/)

        if (jsonMatch) {
            const jsonStr = jsonMatch[1] || jsonMatch[0]
            try {
                const parsedJSON = JSON.parse(jsonStr)
                // Validate with our schema
                return NodesEdgesType.parse(parsedJSON) as GenerateChatFlowResult
            } catch (parseError) {
                const logger = options?.logger
                if (logger) {
                    logger.error('[generateNodesEdges] Error parsing JSON from response', { error: parseError })
                }
                return { error: 'Failed to parse JSON from response', content: responseContent }
            }
        } else {
            const logger = options?.logger
            if (logger) {
                logger.error('[generateNodesEdges] No JSON found in response')
            }
            return { error: 'No JSON found in response', content: responseContent }
        }
    } catch (error: any) {
        const logger = options?.logger
        if (logger) {
            logger.error('[generateNodesEdges] Error', { error: error.message, stack: error.stack })
        }
        return { error: error.message || 'Unknown error occurred' }
    }
}

const generateNodesData = (result: Record<string, any>, config: ChatFlowConfig): { nodes: Node[]; edges: Edge[]; viewport?: Viewport } => {
    try {
        if (result.error) {
            return { nodes: [], edges: [] }
        }

        const nodes = result.nodes || []
        const edges = result.edges || []
        const viewport = result.viewport

        return { nodes, edges, viewport }
    } catch (error: any) {
        const logger = config?.logger
        if (logger) {
            logger.error('[generateNodesData] Error', { error: error.message })
        }
        return { nodes: [], edges: [] }
    }
}

const initNode = (nodeData: Record<string, any>, newNodeId: string): NodeData => {
    const inputParams: InputParam[] = []
    const incoming = nodeData.inputs ? nodeData.inputs.length : 0

    // Inputs
    for (let i = 0; i < incoming; i += 1) {
        const newInput = {
            ...nodeData.inputs[i],
            id: `${newNodeId}-input-${nodeData.inputs[i].name}-${nodeData.inputs[i].type}`
        }
        inputParams.push(newInput)
    }

    // Credential
    if (nodeData.credential) {
        const newInput = {
            ...nodeData.credential,
            id: `${newNodeId}-input-${nodeData.credential.name}-${nodeData.credential.type}`
        }
        inputParams.unshift(newInput)
    }

    // Outputs
    let outputAnchors = initializeOutputAnchors(nodeData, newNodeId)

    // Inputs
    if (nodeData.inputs) {
        const defaultInputs = initializeDefaultNodeData(nodeData.inputs)
        nodeData.inputAnchors = showHideInputAnchors({ ...nodeData, inputAnchors: [], inputs: defaultInputs })
        nodeData.inputParams = showHideInputParams({ ...nodeData, inputParams, inputs: defaultInputs })
        nodeData.inputs = defaultInputs
    } else {
        nodeData.inputAnchors = []
        nodeData.inputParams = []
        nodeData.inputs = {}
    }

    // Outputs
    if (nodeData.outputs) {
        nodeData.outputs = initializeDefaultNodeData(outputAnchors)
    } else {
        nodeData.outputs = {}
    }
    nodeData.outputAnchors = outputAnchors

    // Credential
    if (nodeData.credential) nodeData.credential = ''

    nodeData.id = newNodeId

    return nodeData as NodeData
}

const initializeDefaultNodeData = (nodeParams: Record<string, any>[]) => {
    const initialValues: Record<string, any> = {}

    for (let i = 0; i < nodeParams.length; i += 1) {
        const input = nodeParams[i]
        initialValues[input.name] = input.default || ''
    }

    return initialValues
}

const createChatFlowOutputs = (nodeData: Record<string, any>, newNodeId: string) => {
    if (nodeData.hideOutput) return []

    if (nodeData.outputs?.length) {
        return nodeData.outputs.map((_: any, index: number) => ({
            id: `${newNodeId}-output-${index}`,
            label: nodeData.label,
            name: nodeData.name
        }))
    }

    return [
        {
            id: `${newNodeId}-output-${nodeData.name}`,
            label: nodeData.label,
            name: nodeData.name
        }
    ]
}

const initializeOutputAnchors = (nodeData: Record<string, any>, newNodeId: string): OutputAnchor[] => {
    return createChatFlowOutputs(nodeData, newNodeId)
}

const _showHideOperation = (nodeData: Record<string, any>, inputParam: Record<string, any>, displayType: string, index?: number) => {
    const displayOptions = inputParam[displayType]
    Object.keys(displayOptions).forEach((path) => {
        const comparisonValue = displayOptions[path]
        if (path.includes('$index') && index) {
            path = path.replace('$index', index.toString())
        }
        let groundValue = get(nodeData.inputs, path, '')
        if (groundValue && typeof groundValue === 'string' && groundValue.startsWith('[') && groundValue.endsWith(']')) {
            groundValue = JSON.parse(groundValue)
        }

        // Handle case where groundValue is an array
        if (Array.isArray(groundValue)) {
            if (Array.isArray(comparisonValue)) {
                const hasIntersection = comparisonValue.some((val) => groundValue.includes(val))
                if (displayType === 'show' && !hasIntersection) {
                    inputParam.display = false
                }
                if (displayType === 'hide' && hasIntersection) {
                    inputParam.display = false
                }
            } else if (typeof comparisonValue === 'string') {
                const matchFound = groundValue.some((val) => comparisonValue === val || new RegExp(comparisonValue).test(val))
                if (displayType === 'show' && !matchFound) {
                    inputParam.display = false
                }
                if (displayType === 'hide' && matchFound) {
                    inputParam.display = false
                }
            } else if (typeof comparisonValue === 'boolean' || typeof comparisonValue === 'number') {
                const matchFound = groundValue.includes(comparisonValue)
                if (displayType === 'show' && !matchFound) {
                    inputParam.display = false
                }
                if (displayType === 'hide' && matchFound) {
                    inputParam.display = false
                }
            } else if (typeof comparisonValue === 'object') {
                const matchFound = groundValue.some((val) => isEqual(comparisonValue, val))
                if (displayType === 'show' && !matchFound) {
                    inputParam.display = false
                }
                if (displayType === 'hide' && matchFound) {
                    inputParam.display = false
                }
            }
        } else {
            if (Array.isArray(comparisonValue)) {
                if (displayType === 'show' && !comparisonValue.includes(groundValue)) {
                    inputParam.display = false
                }
                if (displayType === 'hide' && comparisonValue.includes(groundValue)) {
                    inputParam.display = false
                }
            } else if (typeof comparisonValue === 'string') {
                if (displayType === 'show' && !(comparisonValue === groundValue || new RegExp(comparisonValue).test(groundValue))) {
                    inputParam.display = false
                }
                if (displayType === 'hide' && (comparisonValue === groundValue || new RegExp(comparisonValue).test(groundValue))) {
                    inputParam.display = false
                }
            } else if (typeof comparisonValue === 'boolean') {
                if (displayType === 'show' && comparisonValue !== groundValue) {
                    inputParam.display = false
                }
                if (displayType === 'hide' && comparisonValue === groundValue) {
                    inputParam.display = false
                }
            } else if (typeof comparisonValue === 'object') {
                if (displayType === 'show' && !isEqual(comparisonValue, groundValue)) {
                    inputParam.display = false
                }
                if (displayType === 'hide' && isEqual(comparisonValue, groundValue)) {
                    inputParam.display = false
                }
            } else if (typeof comparisonValue === 'number') {
                if (displayType === 'show' && comparisonValue !== groundValue) {
                    inputParam.display = false
                }
                if (displayType === 'hide' && comparisonValue === groundValue) {
                    inputParam.display = false
                }
            }
        }
    })
}

const showHideInputs = (nodeData: Record<string, any>, inputType: string, overrideParams?: Record<string, any>, arrayIndex?: number) => {
    const params = overrideParams ?? nodeData[inputType] ?? []

    for (let i = 0; i < params.length; i += 1) {
        const inputParam = params[i]

        inputParam.display = true

        if (inputParam.show) {
            _showHideOperation(nodeData, inputParam, 'show', arrayIndex)
        }
        if (inputParam.hide) {
            _showHideOperation(nodeData, inputParam, 'hide', arrayIndex)
        }
    }

    return params
}

const showHideInputParams = (nodeData: Record<string, any>): InputParam[] => {
    return showHideInputs(nodeData, 'inputParams')
}

const showHideInputAnchors = (nodeData: Record<string, any>): InputAnchor[] => {
    return showHideInputs(nodeData, 'inputAnchors')
}
