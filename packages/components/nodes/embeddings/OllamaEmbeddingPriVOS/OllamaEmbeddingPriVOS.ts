import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama'
import { OllamaInput } from '@langchain/community/llms/ollama'
import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { getBaseClasses, getCredentialData, getCredentialParam } from '../../../src/utils'
import { PRIVOS_HEADERS } from '../../PrivOS/constants'

class OllamaEmbeddingPriVOS_Embeddings implements INode {
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
        this.label = 'Ollama Embeddings PriVOS'
        this.name = 'ollamaEmbeddingPriVOS'
        this.version = 1.0
        this.type = 'OllamaEmbeddingsPriVOS'
        this.icon = 'Ollama.svg'
        this.category = 'Embeddings'
        this.description = 'Generate embeddings for a given text using PrivOS Ollama-compatible API'
        this.baseClasses = [this.type, ...getBaseClasses(OllamaEmbeddings)]
        this.credential = {
            label: 'Connect Credential',
            name: 'credential',
            type: 'credential',
            credentialNames: ['privosApi']
        }
        this.inputs = [
            {
                label: 'Base URL',
                name: 'baseUrl',
                type: 'string',
                description: 'PrivOS API Base URL (optional, defaults to credential URL)',
                optional: true
            },
            {
                label: 'Model Name',
                name: 'modelName',
                type: 'string',
                placeholder: 'llama2'
            },
            {
                label: 'Number of GPU',
                name: 'numGpu',
                type: 'number',
                description:
                    'The number of layers to send to the GPU(s). On macOS it defaults to 1 to enable metal support, 0 to disable. Refer to <a target="_blank" href="https://github.com/jmorganca/ollama/blob/main/docs/modelfile.md#valid-parameters-and-values">docs</a> for more details',
                step: 1,
                optional: true,
                additionalParams: true
            },
            {
                label: 'Number of Thread',
                name: 'numThread',
                type: 'number',
                description:
                    'Sets the number of threads to use during computation. By default, Ollama will detect this for optimal performance. It is recommended to set this value to the number of physical CPU cores your system has (as opposed to the logical number of cores). Refer to <a target="_blank" href="https://github.com/jmorganca/ollama/blob/main/docs/modelfile.md#valid-parameters-and-values">docs</a> for more details',
                step: 1,
                optional: true,
                additionalParams: true
            },
            {
                label: 'Use MMap',
                name: 'useMMap',
                type: 'boolean',
                default: true,
                optional: true,
                additionalParams: true
            }
        ]
    }

    async init(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const modelName = nodeData.inputs?.modelName as string
        const baseUrl = nodeData.inputs?.baseUrl as string
        const numThread = nodeData.inputs?.numThread as string
        const numGpu = nodeData.inputs?.numGpu as string
        const useMMap = nodeData.inputs?.useMMap as boolean

        const credentialData = await getCredentialData(nodeData.credential ?? '', options)
        const userId = getCredentialParam('userId', credentialData, nodeData)
        const authToken = getCredentialParam('authToken', credentialData, nodeData)
        const credentialBaseUrl = getCredentialParam('baseUrl', credentialData, nodeData)

        // Use input baseUrl if provided, otherwise use credential baseUrl
        const resolvedBaseUrl = baseUrl || credentialBaseUrl

        const requestOptions: OllamaInput = {}
        if (numThread) requestOptions.numThread = parseFloat(numThread)
        if (numGpu) requestOptions.numGpu = parseFloat(numGpu)
        requestOptions.useMMap = useMMap === undefined ? true : useMMap

        // Prepare PrivOS headers
        const headers = {
            [PRIVOS_HEADERS.USER_ID]: userId,
            [PRIVOS_HEADERS.AUTH_TOKEN]: authToken
        }

        const obj = {
            model: modelName,
            baseUrl: resolvedBaseUrl,
            headers,
            requestOptions
        }

        const model = new OllamaEmbeddings(obj)
        return model
    }
}

module.exports = { nodeClass: OllamaEmbeddingPriVOS_Embeddings }
