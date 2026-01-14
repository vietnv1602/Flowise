/**
 * Prompt Templates for AI Flow Generation
 *
 * This file contains prompt templates optimized for generating
 * chatflows and agentflows in Flowise.
 */

import { ChatBuilderRequest, GenerationStage } from '../types'

/**
 * System prompt for flow generation
 */
export const FLOW_GENERATION_SYSTEM_PROMPT = `You are an expert at building AI-powered chatbot and agent flows using Flowise.

Your task is to generate valid Flowise flow structures based on user descriptions.

**Flowise Flow Structure:**
A flow consists of:
- **nodes**: Array of node objects with id, position, type, data
- **edges**: Array of connections between nodes with source, target, handles

**Common Node Categories:**
- **Chat Models**: ChatOpenAI, ChatAnthropic, ChatGoogle, etc.
- **Prompts**: PromptTemplate, ChatPromptTemplate, FewShotPrompt
- **Chains**: LLMChain, ConversationChain, SequentialChain
- **Agents**: ReActAgent, ConversationalAgent, BabyAGI
- **Tools**: SerpAPI, Calculator, Wikipedia, Custom Tools
- **Memory**: BufferMemory, SummaryMemory, WindowMemory
- **Document Loaders**: PDFLoader, TextLoader, WebLoader
- **Vector Stores**: Pinecone, Weaviate, Chroma, FAISS
- **Embeddings**: OpenAIEmbeddings, CohereEmbeddings
- **Output Parsers**: StructuredOutputParser, SimpleJsonOutputParser

**Output Format:**
Return ONLY valid JSON with this structure:
\`\`\`json
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
        "inputs": { /* node-specific inputs */ }
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
\`\`\`

**Important Rules:**
1. All IDs must be unique
2. Positions must not overlap (space nodes appropriately)
3. All edges must connect valid node IDs
4. Nodes must have all required fields
5. Start with simple inputs (User Input node)
6. End with output nodes (Text Output, AI Response)
7. Use appropriate node categories
8. Include sensible default values for inputs

**Design Principles:**
- Keep flows simple and modular
- Use conversation chains for chatbots
- Use agents for complex decision-making
- Add memory for multi-turn conversations
- Include retrieval for knowledge bases
- Handle errors gracefully

Generate the complete, valid JSON flow structure based on the user's requirements.`

/**
 * Phase-specific prompts following feature-dev methodology
 */
export const PHASE_PROMPTS: Record<GenerationStage, { instruction: string; questions: string[] }> = {
    idle: {
        instruction: 'Ready to help build your flow.',
        questions: []
    },
    discovery: {
        instruction: 'Understanding your requirements...',
        questions: ['What problem are you solving?', 'Who are the users?', 'What should the flow accomplish?']
    },
    exploration: {
        instruction: 'Analyzing the codebase for relevant patterns...',
        questions: ['Are there similar flows to reference?', 'What components are available?', 'How are other flows structured?']
    },
    clarifying: {
        instruction: 'Resolving ambiguities to ensure the best result...',
        questions: [
            'Should this support multiple languages?',
            'What error handling is needed?',
            'Are there specific integrations required?'
        ]
    },
    architecture: {
        instruction: 'Designing the optimal flow structure...',
        questions: ['Which node pattern works best?', 'How should components be connected?', "What's the data flow?"]
    },
    implementation: {
        instruction: 'Building the flow with best practices...',
        questions: ['Creating nodes...', 'Establishing connections...', 'Configuring parameters...']
    },
    review: {
        instruction: 'Validating the generated flow...',
        questions: ['Are all nodes properly connected?', 'Are required fields present?', 'Is the flow executable?']
    },
    complete: {
        instruction: 'Flow generation complete!',
        questions: []
    },
    error: {
        instruction: 'An error occurred during generation.',
        questions: ['Would you like to retry?', 'Would you like to modify your request?']
    }
}

/**
 * Build the full prompt for flow generation
 */
export function buildGenerationPrompt(
    request: ChatBuilderRequest,
    conversationHistory: Array<{ role: string; content: string }> = []
): string {
    let prompt = FLOW_GENERATION_SYSTEM_PROMPT + '\n\n'

    // Add conversation context if available
    if (conversationHistory.length > 0) {
        prompt += '**Conversation Context:**\n'
        conversationHistory
            .slice(-5) // Only last 5 messages
            .forEach((msg) => {
                prompt += `${msg.role}: ${msg.content}\n`
            })
        prompt += '\n'
    }

    // Add flow type specification
    const flowType = request.flowType || 'chatflow'
    prompt += `**Flow Type:** ${flowType.toUpperCase()}\n\n`

    // Add requirements
    if (request.requirements) {
        prompt += '**Requirements:**\n'
        if (request.requirements.tone) {
            prompt += `- Tone: ${request.requirements.tone}\n`
        }
        if (request.requirements.complexity) {
            prompt += `- Complexity: ${request.requirements.complexity}\n`
        }
        if (request.requirements.features?.length) {
            prompt += `- Features: ${request.requirements.features.join(', ')}\n`
        }
        if (request.requirements.integrations?.length) {
            prompt += `- Integrations: ${request.requirements.integrations.join(', ')}\n`
        }
        prompt += '\n'
    }

    // Add user's description
    prompt += '**User Request:**\n'
    prompt += request.description

    return prompt
}

/**
 * Build a prompt for flow refinement
 */
export function buildRefinementPrompt(currentFlow: { nodes: any[]; edges: any[] }, refinementRequest: string): string {
    return `You are refining an existing Flowise flow.

**Current Flow Structure:**
\`\`\`json
${JSON.stringify({ nodes: currentFlow.nodes, edges: currentFlow.edges }, null, 2)}
\`\`\`

**Refinement Request:**
${refinementRequest}

Modify the flow according to the request. Return ONLY the complete updated JSON with nodes and edges arrays.
Ensure all IDs remain consistent where nodes aren't changed, and generate new IDs for new nodes.`
}

/**
 * Build a prompt for explaining a flow
 */
export function buildExplanationPrompt(flow: { nodes: any[]; edges: any[] }): string {
    return `Explain this Flowise flow in simple terms:

\`\`\`json
${JSON.stringify({ nodes: flow.nodes, edges: flow.edges }, null, 2)}
\`\`\`

Provide:
1. A brief overview of what this flow does
2. How the main components work together
3. The data flow from input to output
4. Any notable features or patterns used`
}

/**
 * Get clarifying questions based on description
 */
export function getClarifyingQuestions(description: string): string[] {
    const questions: string[] = []
    const lowerDesc = description.toLowerCase()

    // Check for common ambiguities
    if (!lowerDesc.includes('database') && !lowerDesc.includes('knowledge')) {
        questions.push('Should this flow have access to a knowledge base or document store?')
    }

    if (lowerDesc.includes('email') || lowerDesc.includes('contact')) {
        questions.push('Should this collect user information? If so, what fields?')
    }

    if (lowerDesc.includes('agent') || lowerDesc.includes('autonomous')) {
        questions.push('What tools should the agent have access to?')
        questions.push('Should there be human-in-the-loop approval for certain actions?')
    }

    if (!lowerDesc.includes('language')) {
        questions.push('What language should the chatbot use?')
    }

    if (lowerDesc.includes('api') || lowerDesc.includes('integration')) {
        questions.push('What API endpoints or services should be integrated?')
    }

    return questions
}

/**
 * Estimate token count for a prompt
 */
export function estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4)
}
