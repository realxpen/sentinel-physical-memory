import type { EnvironmentalMemory } from '../domain/sentinel'

export interface EnvironmentalMemoryRepository {
  get(environmentId: string): Promise<EnvironmentalMemory | undefined>
  save(memory: EnvironmentalMemory): Promise<void>
}

export type EnvironmentalMemoryReader = Pick<EnvironmentalMemoryRepository, 'get'>

export class InMemoryEnvironmentalMemoryRepository implements EnvironmentalMemoryRepository {
  private readonly memories = new Map<string, EnvironmentalMemory>()

  async get(environmentId: string): Promise<EnvironmentalMemory | undefined> {
    const memory = this.memories.get(environmentId)
    return memory ? structuredClone(memory) : undefined
  }

  async save(memory: EnvironmentalMemory): Promise<void> {
    this.memories.set(memory.environment.id, structuredClone(memory))
  }
}
