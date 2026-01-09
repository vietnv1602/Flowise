import { ClientOptions, OpenAI, OpenAIInput } from '@langchain/openai'
import { BaseCache } from '@langchain/core/caches'
import { BaseLLMParams } from '@langchain/core/language_models/llms'
import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { getBaseClasses, getCredentialData, getCredentialParam } from '../../../src/utils'
import { PRIVOS_HEADERS } from '../../PrivOS/constants'

class OllamaPrivOS_LLMs implements INode {
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
        this.label = 'Ollama PrivOS'
        this.name = 'ollamaPrivOS'
        this.version = 1.0
        this.type = 'OllamaPrivOS'
        this.icon = 'Ollama.svg'
        this.category = 'LLMs'
        this.description = 'Wrapper around PrivOS/Ollama large language models using OpenAI compatible API'
        this.baseClasses = [this.type, ...getBaseClasses(OpenAI)]
        this.credential = {
            label: 'Connect Credential',
            name: 'credential',
            type: 'credential',
            credentialNames: ['privosApi']
        }
        this.inputs = [
            {
                label: 'Cache',
                name: 'cache',
                type: 'BaseCache',
                optional: true
            },
            {
                label: 'Base URL',
                name: 'baseUrl',
                type: 'string',
                description: 'PrivOS API Base URL (optional, defaults to credential URL)',
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
                label: 'Model Name',
                name: 'modelName',
                type: 'string',
                placeholder: 'gpt-3.5-turbo-instruct'
            },
            {
                label: 'Temperature',
                name: 'temperature',
                type: 'number',
                step: 0.1,
                default: 0.7,
                optional: true
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
                label: 'Best Of',
                name: 'bestOf',
                type: 'number',
                step: 1,
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
                label: 'Batch Size',
                name: 'batchSize',
                type: 'number',
                step: 1,
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
        const batchSize = nodeData.inputs?.batchSize as string
        const bestOf = nodeData.inputs?.bestOf as string
        const streaming = nodeData.inputs?.streaming as boolean
        const baseUrl = nodeData.inputs?.baseUrl as string
        const apiKey = nodeData.inputs?.apiKey as string
        const baseOptions = nodeData.inputs?.baseOptions

        const credentialData = await getCredentialData(nodeData.credential ?? '', options)
        const userId = getCredentialParam('userId', credentialData, nodeData)
        const credentialAuthToken = getCredentialParam('authToken', credentialData, nodeData)
        const credentialBaseUrl = getCredentialParam('baseUrl', credentialData, nodeData)

        // Use input baseUrl if provided, otherwise use credential baseUrl
        const resolvedBaseUrl = baseUrl || credentialBaseUrl

        // Use input apiKey if provided, otherwise use credential authToken
        const resolvedAuthToken = apiKey || credentialAuthToken

        const cache = nodeData.inputs?.cache as BaseCache

        const obj: Partial<OpenAIInput> & BaseLLMParams & { configuration?: ClientOptions } = {
            temperature: parseFloat(temperature),
            modelName,
            openAIApiKey: resolvedAuthToken,
            apiKey: resolvedAuthToken,
            streaming: streaming ?? true
        }

        if (maxTokens) obj.maxTokens = parseInt(maxTokens, 10)
        if (topP) obj.topP = parseFloat(topP)
        if (frequencyPenalty) obj.frequencyPenalty = parseFloat(frequencyPenalty)
        if (presencePenalty) obj.presencePenalty = parseFloat(presencePenalty)
        if (timeout) obj.timeout = parseInt(timeout, 10)
        if (batchSize) obj.batchSize = parseInt(batchSize, 10)
        if (bestOf) obj.bestOf = parseInt(bestOf, 10)

        if (cache) obj.cache = cache

        let parsedBaseOptions: any | undefined = undefined
        if (baseOptions) {
            try {
                parsedBaseOptions = typeof baseOptions === 'object' ? baseOptions : JSON.parse(baseOptions)
            } catch (exception) {
                throw new Error("Invalid JSON in the OllamaPrivOS's BaseOptions: " + exception)
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
            baseURL: resolvedBaseUrl,
            defaultHeaders
        }

        const model = new OpenAI(obj)
        return model
    }
}

module.exports = { nodeClass: OllamaPrivOS_LLMs }
