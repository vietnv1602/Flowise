/**
 * Flow Generator Factory
 *
 * Factory pattern implementation for creating flow generators.
 * Provides a clean way to instantiate the appropriate generator
 * based on the selected AI provider.
 */

import { IFlowGenerator } from './IFlowGenerator'
import { AIProvider } from '../../types'

/**
 * Factory for creating flow generators
 */
export class FlowGeneratorFactory {
    private generators: Map<AIProvider, IFlowGenerator>
    private static instance: FlowGeneratorFactory

    private constructor() {
        this.generators = new Map()
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): FlowGeneratorFactory {
        if (!FlowGeneratorFactory.instance) {
            FlowGeneratorFactory.instance = new FlowGeneratorFactory()
        }
        return FlowGeneratorFactory.instance
    }

    /**
     * Register a generator for a provider
     * @param provider The AI provider
     * @param generator The generator implementation
     */
    public registerGenerator(provider: AIProvider, generator: IFlowGenerator): void {
        this.generators.set(provider, generator)
    }

    /**
     * Get generator for a provider
     * @param provider The AI provider
     * @returns The generator implementation
     * @throws Error if no generator registered for provider
     */
    public getGenerator(provider: AIProvider): IFlowGenerator {
        const generator = this.generators.get(provider)
        if (!generator) {
            throw new Error(`No generator registered for provider: ${provider}`)
        }
        return generator
    }

    /**
     * Check if a provider has a registered generator
     * @param provider The AI provider
     * @returns Boolean indicating if generator exists
     */
    public hasGenerator(provider: AIProvider): boolean {
        return this.generators.has(provider)
    }

    /**
     * Get all registered providers
     * @returns Array of registered provider IDs
     */
    public getRegisteredProviders(): AIProvider[] {
        return Array.from(this.generators.keys())
    }

    /**
     * Remove a generator registration
     * @param provider The AI provider to remove
     */
    public unregisterGenerator(provider: AIProvider): void {
        this.generators.delete(provider)
    }

    /**
     * Clear all generator registrations
     */
    public clear(): void {
        this.generators.clear()
    }
}
