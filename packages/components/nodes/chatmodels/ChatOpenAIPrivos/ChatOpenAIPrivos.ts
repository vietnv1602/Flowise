import { ChatOpenAI, ChatOpenAIFields } from '@langchain/openai'
import { BaseCache } from '@langchain/core/caches'
import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { getBaseClasses, getCredentialData, getCredentialParam } from '../../../src/utils'
import { PRIVOS_HEADERS } from '../../PrivOS/constants'

class ChatOpenAIPrivos_ChatModels implements INode {
    label: string
    name: string
    version: number
    type: string
    icon: string
    category: string
    description: string
    baseClasses: string[]
    credential: INodeParams
    inputs: INodeParams[]

    constructor() {
        this.label = 'ChatOpenAI Privos'
        this.name = 'chatOpenAIPrivos'
        this.version = 1.0
        this.type = 'ChatOpenAIPrivos'
        this.icon = 'openai.svg'
        this.category = 'Chat Models'
        this.description = 'Privos Chat/FineTuned model using OpenAI Chat compatible API'
        this.baseClasses = [this.type, ...getBaseClasses(ChatOpenAI)]
        this.credential = {
            label: 'Connect Credential',
            name: 'credential',
            type: 'credential',
            credentialNames: ['privosApi']
        }
        this.inputs = [
            {
                label: 'BasePath',
                name: 'basepath',
                type: 'string',
                description: 'Privos API Base URL (optional, defaults to credential URL)',
                optional: true
            },
            {
                label: 'API Key',
                name: 'apiKey',
                type: 'password',
                description: 'PrivOS API Key (optional, defaults to credential API Key)',
                optional: true
            },
            {
                label: 'Cache',
                name: 'cache',
                type: 'BaseCache',
                optional: true
            },
            {
                label: 'Model Name',
                name: 'modelName',
                type: 'string',
                placeholder: 'gpt-4o'
            },
            {
                label: 'Temperature',
                name: 'temperature',
                type: 'number',
                step: 0.1,
                default: 0.9,
                optional: true
            },
            {
                label: 'Streaming',
                name: 'streaming',
                type: 'boolean',
                default: true,
                optional: true,
                additionalParams: true
            },
            {
                label: 'Max Tokens',
                name: 'maxTokens',
                type: 'number',
                step: 1,
                optional: true,
                additionalParams: true
            },
            {
                label: 'Top Probability',
                name: 'topP',
                type: 'number',
                step: 0.1,
                optional: true,
                additionalParams: true
            },
            {
                label: 'Frequency Penalty',
                name: 'frequencyPenalty',
                type: 'number',
                step: 0.1,
                optional: true,
                additionalParams: true
            },
            {
                label: 'Presence Penalty',
                name: 'presencePenalty',
                type: 'number',
                step: 0.1,
                optional: true,
                additionalParams: true
            },
            {
                label: 'Timeout',
                name: 'timeout',
                type: 'number',
                step: 1,
                optional: true,
                additionalParams: true
            },
            {
                label: 'BaseOptions',
                name: 'baseOptions',
                type: 'json',
                optional: true,
                additionalParams: true
            }
        ]
    }

    async init(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const temperature = nodeData.inputs?.temperature as string
        const modelName = nodeData.inputs?.modelName as string
        const maxTokens = nodeData.inputs?.maxTokens as string
        const topP = nodeData.inputs?.topP as string
        const frequencyPenalty = nodeData.inputs?.frequencyPenalty as string
        const presencePenalty = nodeData.inputs?.presencePenalty as string
        const timeout = nodeData.inputs?.timeout as string
        const streaming = nodeData.inputs?.streaming as boolean
        const basePath = nodeData.inputs?.basepath as string
        const baseOptions = nodeData.inputs?.baseOptions
        const cache = nodeData.inputs?.cache as BaseCache
        const apiKey = nodeData.inputs?.apiKey as string

        const credentialData = await getCredentialData(nodeData.credential ?? '', options)
        const userId = getCredentialParam('userId', credentialData, nodeData)
        const credentialAuthToken = getCredentialParam('authToken', credentialData, nodeData)
        const credentialBaseUrl = getCredentialParam('baseUrl', credentialData, nodeData)

        // Use input basepath if provided, otherwise use credential basepath
        const resolvedBasePath = basePath || credentialBaseUrl

        // Use input apiKey if provided, otherwise use credential authToken
        const resolvedAuthToken = apiKey || credentialAuthToken

        const obj: ChatOpenAIFields = {
            temperature: parseFloat(temperature),
            modelName,
            openAIApiKey: resolvedAuthToken, // Use resolvedAuthToken as API key for OpenAI compatibility
            apiKey: resolvedAuthToken,
            streaming: streaming ?? true
        }

        if (maxTokens) obj.maxTokens = parseInt(maxTokens, 10)
        if (topP) obj.topP = parseFloat(topP)
        if (frequencyPenalty) obj.frequencyPenalty = parseFloat(frequencyPenalty)
        if (presencePenalty) obj.presencePenalty = parseFloat(presencePenalty)
        if (timeout) obj.timeout = parseInt(timeout, 10)
        if (cache) obj.cache = cache

        let parsedBaseOptions: any | undefined = undefined

        if (baseOptions) {
            try {
                parsedBaseOptions = typeof baseOptions === 'object' ? baseOptions : JSON.parse(baseOptions)
            } catch (exception) {
                throw new Error("Invalid JSON in the ChatOpenAIPrivos's BaseOptions: " + exception)
            }
        }

        // Prepare PrivOS headers
        const privosHeaders = {
            [PRIVOS_HEADERS.USER_ID]: userId,
            [PRIVOS_HEADERS.AUTH_TOKEN]: resolvedAuthToken
        }

        // Merge headers: default (PrivOS) + custom baseOptions
        const defaultHeaders = {
            ...privosHeaders,
            ...parsedBaseOptions
        }

        obj.configuration = {
            baseURL: resolvedBasePath,
            defaultHeaders
        }

        const model = new ChatOpenAI(obj)
        return model
    }
}

module.exports = { nodeClass: ChatOpenAIPrivos_ChatModels }
