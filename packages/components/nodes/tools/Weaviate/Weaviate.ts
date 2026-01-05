import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { getCredentialData, getCredentialParam } from '../../../src/utils'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { Embeddings } from '@langchain/core/embeddings'
import { OpenAIEmbeddings } from '@langchain/openai'
import { z } from 'zod'
import weaviate, { ApiKey } from 'weaviate-ts-client'

// Custom logger to filter out vector arrays from logs to avoid GraphQL syntax errors in output
const createCleanLogger = () => {
    const error = (message: string, ...args: any[]) => {
        let cleanMessage = message
        let cleanArgs = args

        // Remove vector from GraphQL queries in logs
        if (message.includes('GraphQL') || message.toLowerCase().includes('query')) {
            cleanArgs = args.map(arg => {
                if (typeof arg === 'string') {
                    return arg.replace(/vector:\s*\[([^\]]*)\]/, 'vector: [<hidden>]')
                }
                return arg
            })
        }

        console.error(`[Weaviate] ${cleanMessage}`, ...cleanArgs)
    }

    return { error }
}

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
        this.label = 'Weaviate Tool'
        this.name = 'weaviateTool'
        this.version = 1.0
        this.type = 'WeaviateTool'
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
                label: 'Embeddings',
                name: 'embeddings',
                type: 'Embeddings',
                optional: true
            },
            {
                label: 'Embedding API Key',
                name: 'embeddingApiKey',
                type: 'string',
                description: 'API Key for internal embedding generation (Standard OpenAI format)',
                additionalParams: true,
                acceptVariable: true
            },
            {
                label: 'Embedding Model Name',
                name: 'embeddingModelName',
                type: 'string',
                description: 'Model name for internal embedding (e.g. text-embedding-3-small)',
                additionalParams: true,
                acceptVariable: true
            },
            {
                label: 'Embedding Base URL',
                name: 'embeddingBaseUrl',
                type: 'string',
                description: 'Base URL for internal embedding (compatible with OpenAI/LocalAI)',
                optional: true,
                additionalParams: true,
                acceptVariable: true
            },
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
                label: 'Weaviate Text Key',
                name: 'weaviateTextKey',
                type: 'string',
                placeholder: 'text',
                optional: true,
                additionalParams: true,
                acceptVariable: true
            },
            {
                label: 'Weaviate Metadata Keys',
                name: 'weaviateMetadataKeys',
                type: 'string',
                rows: 4,
                placeholder: `["foo"]`,
                optional: true,
                additionalParams: true,
                acceptVariable: true
            },
            {
                label: 'Weaviate Search Filter',
                name: 'weaviateFilter',
                type: 'json',
                additionalParams: true,
                optional: true,
                acceptVariable: true
            },
            {
                label: 'Output Fields',
                name: 'fields',
                type: 'string',
                description: 'Comma separated fields to return',
                placeholder: 'title, content',
                optional: true,
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
                label: 'Search Method',
                name: 'searchMethod',
                type: 'options',
                default: 'Similarity',
                options: [
                    {
                        label: 'Similarity',
                        name: 'Similarity'
                    },
                    {
                        label: 'Hybrid',
                        name: 'Hybrid'
                    }
                ]
            },
            {
                label: 'Alpha (Hybrid)',
                name: 'hybridAlpha',
                type: 'number',
                description: 'Weighting for hybrid search (0 = pure keyword, 1 = pure vector). Default 0.5',
                default: 0.5,
                optional: true,
                additionalParams: true,
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
        const weaviateTextKey = nodeData.inputs?.weaviateTextKey as string
        const weaviateMetadataKeys = nodeData.inputs?.weaviateMetadataKeys as string
        const embeddings = nodeData.inputs?.embeddings as Embeddings
        const fields = nodeData.inputs?.fields as string
        const topK = nodeData.inputs?.topK as string
        const toolDescription = nodeData.inputs?.toolDescription as string
        const searchMethod = nodeData.inputs?.searchMethod as string
        const hybridAlpha = nodeData.inputs?.hybridAlpha as string
        const embeddingApiKey = nodeData.inputs?.embeddingApiKey as string
        const embeddingModelName = nodeData.inputs?.embeddingModelName as string
        const embeddingBaseUrl = nodeData.inputs?.embeddingBaseUrl as string
        let weaviateFilter = nodeData.inputs?.weaviateFilter

        const credentialData = await getCredentialData(nodeData.credential ?? '', options)
        const weaviateApiKey = getCredentialParam('weaviateApiKey', credentialData, nodeData)

        let resolvedEmbeddings = embeddings
        if (!resolvedEmbeddings && embeddingApiKey) {
            resolvedEmbeddings = new OpenAIEmbeddings({
                openAIApiKey: embeddingApiKey,
                modelName: embeddingModelName,
                configuration: {
                    baseURL: embeddingBaseUrl
                }
            })
        }

        const clientConfig: any = {
            scheme: weaviateScheme,
            host: weaviateHost,
            logger: createCleanLogger()
        }

        if (weaviateApiKey) {
            clientConfig.apiKey = new ApiKey(weaviateApiKey)
        }

        const client = weaviate.client(clientConfig)

        let filter: any
        if (weaviateFilter) {
            if (typeof weaviateFilter === 'string') {
                try {
                    filter = JSON.parse(weaviateFilter)
                } catch {
                    // ignore
                }
            } else {
                filter = weaviateFilter
            }
        }

        return new DynamicStructuredTool({
            name: 'weaviate_search',
            description: toolDescription,
            schema: z.object({
                query: z.union([z.string(), z.array(z.string())]).describe('The search query string or list of queries.'),
            }),
            func: async (input: any) => {
                const { query } = input


                try {
                    const executeSearch = async (singleQuery: string) => {
                        let builder = client.graphql.get().withClassName(weaviateIndex)

                        let fieldList = ''
                        if (fields) {
                            fieldList = fields.split(',').map((f) => f.trim()).join(' ')
                        } else {
                            // Construct fields from textKey and metadataKeys
                            const keys: string[] = []
                            if (weaviateTextKey) keys.push(weaviateTextKey)
                            if (weaviateMetadataKeys) {
                                try {
                                    const metas = JSON.parse(weaviateMetadataKeys.replace(/\s/g, ''))
                                    if (Array.isArray(metas)) {
                                        keys.push(...metas)
                                    }
                                } catch (e) {
                                    // ignore
                                }
                            }

                            if (keys.length > 0) {
                                fieldList = keys.join(' ')
                            } else {
                                throw new Error("Please provide 'Output Fields' or 'Weaviate Text Key'")
                            }
                        }

                        // Request additional metadata (id, score, distance)
                        // Note: Don't add _additional to fieldList, it causes GraphQL syntax errors
                        // The metadata will be available in the response automatically

                        builder = builder.withFields(fieldList)

                        if (searchMethod === 'Hybrid') {
                            const hybridArgs: any = {
                                query: singleQuery,
                                alpha: hybridAlpha ? parseFloat(hybridAlpha) : 0.5
                            }
                            if (resolvedEmbeddings) {
                                const vector = await resolvedEmbeddings.embedQuery(singleQuery)
                                console.log(`[Weaviate Tool] Hybrid search query="${singleQuery}", vector dimension=${vector.length}, alpha=${hybridArgs.alpha}`)
                                hybridArgs.vector = vector
                            } else {
                                console.log(`[Weaviate Tool] Hybrid search query="${singleQuery}", alpha=${hybridArgs.alpha} (no vector)`)
                            }
                            builder = builder.withHybrid(hybridArgs)
                        } else {
                            // Similarity Search
                            if (resolvedEmbeddings) {
                                const vector = await resolvedEmbeddings.embedQuery(singleQuery)
                                console.log(`[Weaviate Tool] Similarity search query="${singleQuery}", vector dimension=${vector.length}`)
                                builder = builder.withNearVector({ vector })
                            } else {
                                console.log(`[Weaviate Tool] NearText search query="${singleQuery}"`)
                                builder = builder.withNearText({ concepts: [singleQuery] })
                            }
                        }

                        if (filter) {
                            builder = builder.withWhere(filter)
                        }

                        const response = await builder.withLimit(parseInt(topK) || 5).do()

                        if (!response || !response.data || !response.data.Get || !response.data.Get[weaviateIndex]) {
                            console.warn('[Weaviate Tool] Unexpected response format:', JSON.stringify(response, null, 2))
                            return []
                        }

                        const data = response.data.Get[weaviateIndex]

                        // Format results - handle both v1 and v2 response formats
                        return data.map((obj: any) => {
                            // Check if _additional exists (v2 format)
                            if (obj._additional) {
                                const { _additional, ...properties } = obj
                                return {
                                    id: _additional?.id,
                                    properties: properties,
                                    score: _additional?.score || _additional?.distance
                                }
                            }
                            // Otherwise, return object directly (v1 format or no metadata)
                            return {
                                id: obj.id,
                                properties: obj,
                                score: null
                            }
                        })
                    }

                    // Format input queries
                    let queries: string[] = []
                    if (Array.isArray(query)) {
                        queries = query
                    } else {
                        queries = query.split('\n').map((q: string) => q.trim()).filter((q: string) => q !== '')
                    }
                    console.log('[Weaviate Tool] Input Questions:', JSON.stringify(queries, null, 2))

                    // Execute searches in parallel
                    const resultsArray = await Promise.all(queries.map((q: string) => executeSearch(q)))

                    // Flatten and deduplicate results by ID
                    const allResults = resultsArray.flat()
                    const uniqueResultsMap = new Map()

                    allResults.forEach((item: any) => {
                        if (item.id && !uniqueResultsMap.has(item.id)) {
                            uniqueResultsMap.set(item.id, item)
                        }
                    })

                    let finalResults = Array.from(uniqueResultsMap.values())

                    // CHECK SECTION_HEADER LOGIC: Expand results to include all chunks from the same section
                    const sectionCombos = new Set<string>()
                    finalResults.forEach((item: any) => {
                        const props = item.properties || {}
                        if (props.section_header && props.file_path) {
                            // Create a unique key for the combo
                            sectionCombos.add(JSON.stringify({ header: props.section_header, path: props.file_path }))
                        }
                    })

                    if (sectionCombos.size > 0) {
                        const executeSectionFetch = async (comboStr: string) => {
                            try {
                                const { header, path } = JSON.parse(comboStr)
                                let builder = client.graphql.get().withClassName(weaviateIndex)

                                // Reuse field construction logic
                                let fieldList = ''
                                if (fields) {
                                    fieldList = fields.split(',').map((f) => f.trim()).join(' ')
                                } else {
                                    const keys: string[] = []
                                    if (weaviateTextKey) keys.push(weaviateTextKey)
                                    if (weaviateMetadataKeys) {
                                        try {
                                            const metas = JSON.parse(weaviateMetadataKeys.replace(/\s/g, ''))
                                            if (Array.isArray(metas)) {
                                                keys.push(...metas)
                                            }
                                        } catch (e) { }
                                    }
                                    if (keys.length > 0) fieldList = keys.join(' ')
                                }
                                builder = builder.withFields(fieldList)

                                // Construct Where filter for section_header AND file_path
                                const sectionFilter: any = {
                                    operator: 'And',
                                    operands: [
                                        {
                                            path: ['section_header'],
                                            operator: 'Equal',
                                            valueString: header
                                        },
                                        {
                                            path: ['file_path'],
                                            operator: 'Equal',
                                            valueString: path
                                        }
                                    ]
                                }
                                builder = builder.withWhere(sectionFilter)

                                // Limit 50 as per Python demo
                                const response = await builder.withLimit(50).do()
                                if (!response?.data?.Get?.[weaviateIndex]) return []

                                return response.data.Get[weaviateIndex].map((obj: any) => {
                                    // Check if _additional exists (v2 format)
                                    if (obj._additional) {
                                        const { _additional, ...properties } = obj
                                        return {
                                            id: _additional?.id,
                                            properties: properties,
                                            score: _additional?.score || _additional?.distance
                                        }
                                    }
                                    // Otherwise, return object directly
                                    return {
                                        id: obj.id,
                                        properties: obj,
                                        score: null
                                    }
                                })
                            } catch (e) {
                                console.error('[Weaviate Tool] Section fetch error:', e)
                                return []
                            }
                        }

                        // Run section fetches in parallel
                        const sectionResults = await Promise.all(Array.from(sectionCombos).map(executeSectionFetch))
                        const flattenedSectionResults = sectionResults.flat()

                        // Merge into final results (deduplicate again)
                        flattenedSectionResults.forEach((item: any) => {
                            if (item.id && !uniqueResultsMap.has(item.id)) {
                                uniqueResultsMap.set(item.id, item)
                                finalResults.push(item)
                            }
                        })
                    }

                    const output = {
                        query: query,
                        collection: weaviateIndex,
                        total_results: finalResults.length,
                        results: finalResults
                    }

                    console.log('[Weaviate Tool] Final Output:', JSON.stringify(output, null, 2))

                    return JSON.stringify(output, null, 2)
                } catch (error: any) {
                    console.error('[Weaviate Tool] Error:', error)
                    return `Error searching Weaviate: ${error.message}`
                }
            }
        })
    }
}

module.exports = { nodeClass: Weaviate_Tools }
