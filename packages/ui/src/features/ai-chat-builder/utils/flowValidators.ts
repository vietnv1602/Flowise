/**
 * Flow Validators
 *
 * Utilities for validating generated flows
 */

import { FlowJSON, ValidationResult, ValidationError, ValidationWarning } from '../types'

/**
 * Validate a generated flow
 */
export function validateFlow(flowData: FlowJSON): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []

    // Check required structure
    if (!flowData.nodes || !Array.isArray(flowData.nodes)) {
        errors.push({
            code: 'MISSING_NODES',
            message: 'Flow must have a nodes array',
            severity: 'critical'
        })
        return { isValid: false, errors, warnings }
    }

    if (!flowData.edges || !Array.isArray(flowData.edges)) {
        errors.push({
            code: 'MISSING_EDGES',
            message: 'Flow must have an edges array',
            severity: 'critical'
        })
        return { isValid: false, errors, warnings }
    }

    // Validate nodes
    const nodeIds = new Set<string>()
    flowData.nodes.forEach((node, index) => {
        if (!node.id) {
            errors.push({
                code: 'NODE_MISSING_ID',
                message: `Node at index ${index} is missing an ID`,
                severity: 'critical'
            })
            return
        }

        if (nodeIds.has(node.id)) {
            errors.push({
                code: 'DUPLICATE_NODE_ID',
                message: `Duplicate node ID: ${node.id}`,
                nodeId: node.id,
                severity: 'critical'
            })
        }
        nodeIds.add(node.id)

        if (!node.data) {
            errors.push({
                code: 'NODE_MISSING_DATA',
                message: `Node ${node.id} is missing data field`,
                nodeId: node.id,
                severity: 'high'
            })
        }

        if (!node.data?.label) {
            warnings.push({
                code: 'NODE_MISSING_LABEL',
                message: `Node ${node.id} is missing a label`,
                nodeId: node.id,
                suggestion: 'Add a descriptive label for better UX'
            })
        }

        if (!node.data?.type && !node.data?.name) {
            errors.push({
                code: 'NODE_MISSING_TYPE',
                message: `Node ${node.id} is missing type/name`,
                nodeId: node.id,
                severity: 'critical'
            })
        }

        // Check position
        if (!node.position || typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
            errors.push({
                code: 'NODE_INVALID_POSITION',
                message: `Node ${node.id} has invalid position`,
                nodeId: node.id,
                severity: 'high'
            })
        }

        // Check for overlapping nodes
        const overlappingNode = findOverlappingNode(node, flowData.nodes, index)
        if (overlappingNode) {
            warnings.push({
                code: 'NODES_OVERLAPPING',
                message: `Node ${node.id} overlaps with ${overlappingNode.id}`,
                nodeId: node.id,
                suggestion: 'Adjust node positions to avoid overlap'
            })
        }
    })

    // Validate edges
    const edgeIds = new Set<string>()
    flowData.edges.forEach((edge, index) => {
        if (!edge.id) {
            errors.push({
                code: 'EDGE_MISSING_ID',
                message: `Edge at index ${index} is missing an ID`,
                severity: 'high'
            })
            return
        }

        if (edgeIds.has(edge.id)) {
            errors.push({
                code: 'DUPLICATE_EDGE_ID',
                message: `Duplicate edge ID: ${edge.id}`,
                severity: 'high'
            })
        }
        edgeIds.add(edge.id)

        if (!edge.source || !nodeIds.has(edge.source)) {
            errors.push({
                code: 'EDGE_INVALID_SOURCE',
                message: `Edge ${edge.id} has invalid source node: ${edge.source}`,
                severity: 'critical'
            })
        }

        if (!edge.target || !nodeIds.has(edge.target)) {
            errors.push({
                code: 'EDGE_INVALID_TARGET',
                message: `Edge ${edge.id} has invalid target node: ${edge.target}`,
                severity: 'critical'
            })
        }

        // Check for self-loops
        if (edge.source === edge.target) {
            warnings.push({
                code: 'EDGE_SELF_LOOP',
                message: `Edge ${edge.id} creates a self-loop on ${edge.source}`,
                suggestion: 'Self-loops may cause infinite loops'
            })
        }
    })

    // Check for disconnected nodes (not an error, but worth noting)
    const connectedNodeIds = new Set<string>()
    flowData.edges.forEach((edge) => {
        connectedNodeIds.add(edge.source)
        connectedNodeIds.add(edge.target)
    })

    flowData.nodes.forEach((node) => {
        if (!connectedNodeIds.has(node.id)) {
            warnings.push({
                code: 'NODE_DISCONNECTED',
                message: `Node ${node.id} is not connected to any other node`,
                nodeId: node.id,
                suggestion: 'Connect this node or remove it if not needed'
            })
        }
    })

    // Check for cycles (may be intentional in loops)
    const hasCycles = detectCycles(flowData)
    if (hasCycles) {
        warnings.push({
            code: 'FLOW_HAS_CYCLES',
            message: 'Flow contains cycles which may cause infinite loops',
            suggestion: 'Ensure loops have exit conditions'
        })
    }

    // Check for input/output nodes
    const hasInput = flowData.nodes.some((n) => n.data?.type === 'userInput' || n.data?.name === 'userInput')
    const hasOutput = flowData.nodes.some((n) => n.data?.type === 'textOutput' || n.data?.name === 'textOutput')

    if (!hasInput && !hasOutput) {
        warnings.push({
            code: 'MISSING_IO',
            message: 'Flow may be missing input or output nodes',
            suggestion: 'Ensure users can interact with the flow'
        })
    }

    const isValid = errors.filter((e) => e.severity === 'critical' || e.severity === 'high').length === 0

    return { isValid, errors, warnings }
}

/**
 * Find overlapping node
 */
function findOverlappingNode(node: any, allNodes: any[], currentIndex: number): any | null {
    const NODE_WIDTH = 200
    const NODE_HEIGHT = 100
    const PADDING = 20

    for (let i = 0; i < allNodes.length; i++) {
        if (i === currentIndex) continue

        const other = allNodes[i]
        if (
            node.position.x < other.position.x + NODE_WIDTH + PADDING &&
            node.position.x + NODE_WIDTH + PADDING > other.position.x &&
            node.position.y < other.position.y + NODE_HEIGHT + PADDING &&
            node.position.y + NODE_HEIGHT + PADDING > other.position.y
        ) {
            return other
        }
    }

    return null
}

/**
 * Detect cycles in the flow graph
 */
function detectCycles(flowData: FlowJSON): boolean {
    const graph = new Map<string, string[]>()

    // Build adjacency list
    flowData.edges.forEach((edge) => {
        if (!graph.has(edge.source)) {
            graph.set(edge.source, [])
        }
        graph.get(edge.source)!.push(edge.target)
    })

    // DFS to detect cycles
    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    function hasCycle(node: string): boolean {
        visited.add(node)
        recursionStack.add(node)

        const neighbors = graph.get(node) || []
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                if (hasCycle(neighbor)) {
                    return true
                }
            } else if (recursionStack.has(neighbor)) {
                return true
            }
        }

        recursionStack.delete(node)
        return false
    }

    for (const nodeId of graph.keys()) {
        if (!visited.has(nodeId)) {
            if (hasCycle(nodeId)) {
                return true
            }
        }
    }

    return false
}

/**
 * Validate node data structure
 */
export function validateNodeData(node: any): boolean {
    if (!node) return false
    if (!node.id) return false
    if (!node.data) return false
    if (!node.data.type && !node.data.name) return false
    return true
}

/**
 * Sanitize flow data before saving
 */
export function sanitizeFlowData(flowData: FlowJSON): FlowJSON {
    return {
        nodes: flowData.nodes.map((node) => ({
            ...node,
            id: node.id || `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            data: {
                ...node.data,
                id: node.data?.id || node.id
            }
        })),
        edges: flowData.edges.map((edge) => ({
            ...edge,
            id: edge.id || `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        })),
        viewport: flowData.viewport || { x: 0, y: 0, zoom: 1 }
    }
}
