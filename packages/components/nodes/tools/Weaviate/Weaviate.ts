import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { getCredentialData, getCredentialParam } from '../../../src/utils'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { Embeddings } from '@langchain/core/embeddings'
import { OpenAIEmbeddings } from '@langchain/openai'
import { z } from 'zod'
import weaviate from 'weaviate-client'

// Helper to check if in development mode
const isDev = process.env.NODE_ENV === 'development'

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
                label: 'gRPC Port',
                name: 'grpcPort',
                type: 'number',
                description: 'gRPC port (default: 50051 for http, 443 for https)',
                placeholder: '50051',
                optional: true,
                additionalParams: true,
                acceptVariable: true
            },
            {
                label: 'Query Timeout (seconds)',
                name: 'queryTimeout',
                type: 'number',
                description: 'Query timeout in seconds (default: 60)',
                placeholder: '60',
                optional: true,
                additionalParams: true,
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
        const grpcPort = nodeData.inputs?.grpcPort as number
        const queryTimeout = nodeData.inputs?.queryTimeout as number
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

        // Connect to Weaviate using v3 client
        // Parse host to extract hostname if it includes port
        let httpHost = weaviateHost
        let httpPort = weaviateScheme === 'https' ? 443 : 8080
        // Use user-provided gRPC port or default
        let defaultGrpcPort = weaviateScheme === 'https' ? 443 : 50051
        let finalGrpcPort = grpcPort || defaultGrpcPort

        // Handle host:port format
        if (weaviateHost.includes(':')) {
            const parts = weaviateHost.split(':')
            httpHost = parts[0]
            httpPort = parseInt(parts[1]) || httpPort
        }

        const connectionConfig: any = {
            httpHost: httpHost,
            httpPort: httpPort,
            httpSecure: weaviateScheme === 'https',
            grpcHost: httpHost,  // Use same host for gRPC
            grpcPort: finalGrpcPort,
            grpcSecure: weaviateScheme === 'https',
            skipInitChecks: true,  // Skip gRPC health check for servers without gRPC enabled
            timeout: {
                init: 30,                      // 30 seconds for initialization
                query: queryTimeout || 60,     // Use user-provided timeout or default 60s
                insert: 120                    // 120 seconds for insertions
            }
        }

        if (weaviateApiKey) {
            connectionConfig.authCredentials = new weaviate.ApiKey(weaviateApiKey)
        }

        const client = await weaviate.connectToCustom(connectionConfig)

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
                query: z.array(z.string()).describe('Array of 2 search queries. Example: ["query1", "query2"]'),
            }),
            func: async (input: any) => {
                const { query } = input

                // Format input queries - split by pipe (|) for multiple queries
                let queries: string[] = []
                if (Array.isArray(query)) {
                    queries = query
                } else {
                    // Split by pipe (|) first, then by newline as fallback
                    if (query.includes('|')) {
                        queries = query.split('|').map((q: string) => q.trim()).filter((q: string) => q !== '')
                    } else {
                        queries = query.split('\n').map((q: string) => q.trim()).filter((q: string) => q !== '')
                    }
                }
                if (isDev) console.log('[Weaviate Tool] Input Questions:', JSON.stringify(queries, null, 2))

                try {
                    const executeSearch = async (singleQuery: string) => {
                        // Clean collection name - remove wildcards and special chars
                        const cleanIndex = weaviateIndex.replace(/^\*+|\*+$/g, '').replace(/^\/+|\/+$/g, '')
                        const collection = client.collections.get(cleanIndex)

                        // Helper function to clean field names
                        const cleanFieldName = (fieldName: string): string => {
                            return fieldName.replace(/^\*+|\*+$/g, '').replace(/^\/+|\/+$/g, '')
                        }

                        // Determine which fields to return
                        const returnFields: string[] = []
                        if (fields) {
                            returnFields.push(...fields.split(',').map((f) => cleanFieldName(f.trim())))
                        } else {
                            // Construct fields from textKey and metadataKeys
                            if (weaviateTextKey) returnFields.push(cleanFieldName(weaviateTextKey))
                            if (weaviateMetadataKeys) {
                                try {
                                    const metas = JSON.parse(weaviateMetadataKeys.replace(/\s/g, ''))
                                    if (Array.isArray(metas)) {
                                        returnFields.push(...metas.map((m: string) => cleanFieldName(m)))
                                    }
                                } catch (e) {
                                    // ignore
                                }
                            }
                        }

                        // Always return metadata (id, score, distance)
                        const returnMetadata = ['id', 'score', 'distance']

                        let results

                        if (searchMethod === 'Hybrid') {
                            const alpha = hybridAlpha ? parseFloat(hybridAlpha) : 0.5

                            if (resolvedEmbeddings) {
                                const vector = await resolvedEmbeddings.embedQuery(singleQuery)
                                results = await collection.query.hybrid(
                                    singleQuery,
                                    {
                                        limit: parseInt(topK) || 5,
                                        alpha: alpha,
                                        vector: vector,
                                        returnMetadata: returnMetadata as any,
                                        returnProperties: returnFields.length > 0 ? returnFields : undefined
                                    }
                                )
                            } else {
                                results = await collection.query.hybrid(
                                    singleQuery,
                                    {
                                        limit: parseInt(topK) || 5,
                                        alpha: alpha,
                                        returnMetadata: returnMetadata as any,
                                        returnProperties: returnFields.length > 0 ? returnFields : undefined
                                    }
                                )
                            }
                        } else {
                            // Similarity Search (nearVector)
                            if (resolvedEmbeddings) {
                                const vector = await resolvedEmbeddings.embedQuery(singleQuery)
                                results = await collection.query.nearVector(
                                    vector,
                                    {
                                        limit: parseInt(topK) || 5,
                                        returnMetadata: returnMetadata as any,
                                        returnProperties: returnFields.length > 0 ? returnFields : undefined
                                    }
                                )
                            } else {
                                // NearText (BM25)
                                results = await collection.query.bm25(
                                    singleQuery,
                                    {
                                        limit: parseInt(topK) || 5,
                                        returnMetadata: returnMetadata as any,
                                        returnProperties: returnFields.length > 0 ? returnFields : undefined
                                    }
                                )
                            }
                        }

                        // Apply filter if provided
                        if (filter && results) {
                            // Note: In v3, filters are applied within the query method
                            // This is a simplified approach - you may need to adjust based on actual filter structure
                            console.warn('[Weaviate Tool] Filter in v3 client should be applied within query method')
                        }

                        // Format results
                        if (!results || !results.objects) {
                            return []
                        }

                        return results.objects.map((obj: any) => {
                            return {
                                id: obj.uuid,
                                properties: obj.properties,
                                score: obj.metadata?.score ?? obj.metadata?.distance ?? null
                            }
                        })
                    }

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
                                const cleanIndex = weaviateIndex.replace(/^\*+|\*+$/g, '').replace(/^\/+|\/+$/g, '')
                                const collection = client.collections.get(cleanIndex)

                                // Helper function to clean field names
                                const cleanFieldName = (fieldName: string): string => {
                                    return fieldName.replace(/^\*+|\*+$/g, '').replace(/^\/+|\/+$/g, '')
                                }

                                // Determine which fields to return
                                const returnFields: string[] = []
                                if (fields) {
                                    returnFields.push(...fields.split(',').map((f) => cleanFieldName(f.trim())))
                                } else {
                                    if (weaviateTextKey) returnFields.push(cleanFieldName(weaviateTextKey))
                                    if (weaviateMetadataKeys) {
                                        try {
                                            const metas = JSON.parse(weaviateMetadataKeys.replace(/\s/g, ''))
                                            if (Array.isArray(metas)) {
                                                returnFields.push(...metas.map((m: string) => cleanFieldName(m)))
                                            }
                                        } catch (e) { }
                                    }
                                }

                                // Fetch all objects with matching section_header and file_path
                                // Note: In v3 client, multi-condition filters are done through the filter builder
                                // For now, fetch without filter and filter in application code
                                // TODO: Implement proper v3 filter with AND once API is confirmed
                                const sectionResults = await collection.query.fetchObjects({
                                    limit: 5,
                                    returnMetadata: ['id', 'score', 'distance'] as any,
                                    returnProperties: returnFields.length > 0 ? returnFields : undefined
                                })

                                // Filter results in application code
                                const filtered = sectionResults?.objects?.filter((obj: any) => {
                                    const props = obj.properties || {}
                                    return props.section_header === header && props.file_path === path
                                }) || []

                                return filtered.map((obj: any) => {
                                    return {
                                        id: obj.uuid,
                                        properties: obj.properties,
                                        score: obj.metadata?.score ?? obj.metadata?.distance ?? null
                                    }
                                })
                            } catch (e) {
                                if (isDev) console.error('[Weaviate Tool] Section fetch error:', e)
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

                    if (isDev) console.log('[Weaviate Tool] Final Output:', JSON.stringify(output, null, 2))

                    return JSON.stringify(output, null, 2)
                } catch (error: any) {
                    if (isDev) console.error('[Weaviate Tool] Error:', error)
                    return `Error searching Weaviate: ${error.message}`
                }
            }
        })
    }
}

module.exports = { nodeClass: Weaviate_Tools }
