import { cloneDeep, omit } from 'lodash'
import { StatusCodes } from 'http-status-codes'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { INodeData, MODE } from '../../Interface'
import { INodeOptionsValue } from 'flowise-components'
import { databaseEntities } from '../../utils'
import logger from '../../utils/logger'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { OMIT_QUEUE_JOB_DATA } from '../../utils/constants'
import { executeCustomNodeFunction } from '../../utils/executeCustomNodeFunction'

// Get all component nodes
const getAllNodes = async (filters: { flowType?: string } = {}) => {
    try {
        const appServer = getRunningExpressApp()
        const dbResponse = []
        const { flowType } = filters
        const normalizedFlowType = (flowType || '').toLowerCase()

        // Strict Allow Lists for Agentflow
        const COMMON_CATEGORIES = ['Tools', 'Chat Models', 'MCP']

        for (const nodeName in appServer.nodesPool.componentNodes) {
            const componentNode = appServer.nodesPool.componentNodes[nodeName]
            const clonedNode = cloneDeep(componentNode)

            // Filter Logic if flowType is provided
            if (normalizedFlowType === 'agentflow') {
                const filePath = (clonedNode.filePath || '').toLowerCase()
                const category = (clonedNode.category || '')

                // Strict "Hard" Classification based on File Path
                const isAgentSpecificNode =
                    filePath.includes('/agentflow/') ||
                    filePath.includes('\\agentflow\\') ||
                    filePath.includes('/sequentialagents/') ||
                    filePath.includes('\\sequentialagents\\') ||
                    filePath.includes('/multiagents/') ||
                    filePath.includes('\\multiagents\\')

                // Allow if:
                // 1. Is Agent Specific Node (hard path check)
                // 2. OR is in Common Categories (Tools, Chat Models)
                const isCommon = COMMON_CATEGORIES.some(c => c.toLowerCase() === category.toLowerCase())

                if (isAgentSpecificNode || isCommon) {
                    dbResponse.push(clonedNode)
                }
            } else {
                dbResponse.push(clonedNode)
            }
        }
        return dbResponse
    } catch (error) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: nodesService.getAllNodes - ${getErrorMessage(error)}`)
    }
}

// Get all component nodes for a specific category
const getAllNodesForCategory = async (category: string) => {
    try {
        const appServer = getRunningExpressApp()
        const dbResponse = []
        for (const nodeName in appServer.nodesPool.componentNodes) {
            const componentNode = appServer.nodesPool.componentNodes[nodeName]
            if (componentNode.category === category) {
                const clonedNode = cloneDeep(componentNode)
                dbResponse.push(clonedNode)
            }
        }
        return dbResponse
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: nodesService.getAllNodesForCategory - ${getErrorMessage(error)}`
        )
    }
}

// Get specific component node via name
const getNodeByName = async (nodeName: string) => {
    try {
        const appServer = getRunningExpressApp()
        if (Object.prototype.hasOwnProperty.call(appServer.nodesPool.componentNodes, nodeName)) {
            const dbResponse = appServer.nodesPool.componentNodes[nodeName]
            return dbResponse
        } else {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Node ${nodeName} not found`)
        }
    } catch (error) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: nodesService.getAllNodes - ${getErrorMessage(error)}`)
    }
}

// Returns specific component node icon via name
const getSingleNodeIcon = async (nodeName: string) => {
    try {
        const appServer = getRunningExpressApp()
        if (Object.prototype.hasOwnProperty.call(appServer.nodesPool.componentNodes, nodeName)) {
            const nodeInstance = appServer.nodesPool.componentNodes[nodeName]
            if (nodeInstance.icon === undefined) {
                throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Node ${nodeName} icon not found`)
            }

            if (nodeInstance.icon.endsWith('.svg') || nodeInstance.icon.endsWith('.png') || nodeInstance.icon.endsWith('.jpg')) {
                const filepath = nodeInstance.icon
                return filepath
            } else {
                throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Node ${nodeName} icon is missing icon`)
            }
        } else {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Node ${nodeName} not found`)
        }
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: nodesService.getSingleNodeIcon - ${getErrorMessage(error)}`
        )
    }
}

const getSingleNodeAsyncOptions = async (nodeName: string, requestBody: any): Promise<any> => {
    try {
        const appServer = getRunningExpressApp()
        const nodeData: INodeData = requestBody
        if (Object.prototype.hasOwnProperty.call(appServer.nodesPool.componentNodes, nodeName)) {
            try {
                const nodeInstance = appServer.nodesPool.componentNodes[nodeName]
                const methodName = nodeData.loadMethod || ''

                const dbResponse: INodeOptionsValue[] = await nodeInstance.loadMethods![methodName]!.call(nodeInstance, nodeData, {
                    appDataSource: appServer.AppDataSource,
                    databaseEntities: databaseEntities,
                    componentNodes: appServer.nodesPool.componentNodes,
                    previousNodes: requestBody.previousNodes,
                    currentNode: requestBody.currentNode,
                    searchOptions: requestBody.searchOptions,
                    cachePool: appServer.cachePool
                })

                return dbResponse
            } catch (error) {
                return []
            }
        } else {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Node ${nodeName} not found`)
        }
    } catch (error) {
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: nodesService.getSingleNodeAsyncOptions - ${getErrorMessage(error)}`
        )
    }
}

// execute custom function node
const executeCustomFunction = async (requestBody: any, workspaceId?: string, orgId?: string) => {
    const appServer = getRunningExpressApp()
    const executeData = {
        appDataSource: appServer.AppDataSource,
        componentNodes: appServer.nodesPool.componentNodes,
        data: requestBody,
        isExecuteCustomFunction: true,
        orgId,
        workspaceId
    }

    if (process.env.MODE === MODE.QUEUE) {
        const predictionQueue = appServer.queueManager.getQueue('prediction')

        const job = await predictionQueue.addJob(omit(executeData, OMIT_QUEUE_JOB_DATA))
        logger.debug(`[server]: Execute Custom Function Job added to queue by ${orgId}: ${job.id}`)

        const queueEvents = predictionQueue.getQueueEvents()
        const result = await job.waitUntilFinished(queueEvents)
        if (!result) {
            throw new Error('Failed to execute custom function')
        }

        return result
    } else {
        return await executeCustomNodeFunction(executeData)
    }
}

export default {
    getAllNodes,
    getNodeByName,
    getSingleNodeIcon,
    getSingleNodeAsyncOptions,
    executeCustomFunction,
    getAllNodesForCategory
}
