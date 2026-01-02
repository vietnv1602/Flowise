import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { getCredentialData, getCredentialParam } from '../../../src/utils'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import weaviate, { ApiKey, AuthUserPasswordCredentials } from 'weaviate-ts-client'

class Weaviate_Tools implements INode {
    label: string
    name: string
    version: number
    description: string
    type: string
    icon: string
    category: string
    baseClasses: string[]
    credential: INodeParams
    inputs: INodeParams[]

    constructor() {
        this.label = 'Weaviate'
        this.name = 'weaviateTool'
        this.version = 1.0
        this.type = 'Weaviate'
        this.icon = 'weaviate.png'
        this.category = 'Tools'
        this.description = 'Interact with Weaviate to search for information'
        this.credential = {
            label: 'Connect Credential',
            name: 'credential',
            type: 'credential',
            credentialNames: ['weaviateApi'],
            optional: true
        }
        this.inputs = [
            {
                label: 'Weaviate Scheme',
                name: 'weaviateScheme',
                type: 'options',
                default: 'https',
                options: [
                    {
                        label: 'https',
                        name: 'https'
                    },
                    {
                        label: 'http',
                        name: 'http'
                    }
                ]
            },
            {
                label: 'Weaviate Host',
                name: 'weaviateHost',
                type: 'string',
                placeholder: 'localhost:8080',
                acceptVariable: true
            },
            {
                label: 'Weaviate Index',
                name: 'weaviateIndex',
                type: 'string',
                placeholder: 'Test',
                acceptVariable: true
            },
            {
                label: 'Output Fields',
                name: 'fields',
                type: 'string',
                description: 'Comma separated fields to return',
                placeholder: 'title, content',
                acceptVariable: true
            },
            {
                label: 'Top K',
                name: 'topK',
                description: 'Number of top results to fetch. Default to 5',
                placeholder: '5',
                type: 'number',
                optional: true,
                acceptVariable: true
            },
            {
                label: 'Tool Description',
                name: 'toolDescription',
                type: 'string',
                description: 'Description of what this tool does, to help the LLM know when to use it',
                default: 'Useful for searching information in Weaviate database',
                rows: 3,
                acceptVariable: true
            }
        ]
        this.baseClasses = [this.type, 'Tool', 'StructuredTool', 'Runnable']
    }

    async init(nodeData: INodeData, _: string, options: ICommonObject): Promise<any> {
        const weaviateScheme = nodeData.inputs?.weaviateScheme as string
        const weaviateHost = nodeData.inputs?.weaviateHost as string
        const weaviateIndex = nodeData.inputs?.weaviateIndex as string
        const fields = nodeData.inputs?.fields as string
        const topK = nodeData.inputs?.topK as string
        const toolDescription = nodeData.inputs?.toolDescription as string

        const credentialData = await getCredentialData(nodeData.credential ?? '', options)
        const weaviateApiKey = getCredentialParam('weaviateApiKey', credentialData, nodeData)

        const clientConfig: any = {
            scheme: weaviateScheme,
            host: weaviateHost
        }

        if (weaviateApiKey) {
            clientConfig.apiKey = new ApiKey(weaviateApiKey)
        }

        const client = weaviate.client(clientConfig)

        return new DynamicStructuredTool({
            name: 'weaviate_search',
            description: toolDescription,
            schema: z.object({
                query: z.string().describe('The search query string'),
            }),
            func: async (input: any) => {
                const { query } = input
                try {
                    const fieldList = fields.split(',').map((f) => f.trim()).join(' ')

                    const response = await client.graphql
                        .get()
                        .withClassName(weaviateIndex)
                        .withFields(fieldList)
                        .withNearText({ concepts: [query] })
                        .withLimit(parseInt(topK) || 5)
                        .do()

                    const data = response.data.Get[weaviateIndex]
                    return JSON.stringify(data, null, 2)
                } catch (error: any) {
                    return `Error searching Weaviate: ${error.message}`
                }
            }
        })
    }
}

module.exports = { nodeClass: Weaviate_Tools }
