import type { EnvironmentalMemory } from '../domain/sentinel'

export interface EnvironmentalMemoryRepository {
  get(environmentId: string): Promise<EnvironmentalMemory | undefined>
  save(memory: EnvironmentalMemory): Promise<void>
  saveIfCurrent?(memory: EnvironmentalMemory, expectedCurrentStateId?: string): Promise<boolean>
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

  async saveIfCurrent(memory: EnvironmentalMemory, expectedCurrentStateId?: string): Promise<boolean> {
    const current = this.memories.get(memory.environment.id)
    if ((current?.environment.currentStateId ?? undefined) !== expectedCurrentStateId) return false
    this.memories.set(memory.environment.id, structuredClone(memory))
    return true
  }
}
