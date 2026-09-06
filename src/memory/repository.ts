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

const runtimeRepository = new InMemoryEnvironmentalMemoryRepository()

export function getRuntimeEnvironmentalMemoryRepository(): EnvironmentalMemoryRepository {
  return runtimeRepository
}

export async function reconcileRepositorySnapshot(
  repository: EnvironmentalMemoryRepository,
  snapshot?: EnvironmentalMemory,
): Promise<void> {
  if (!snapshot) return
  const current = await repository.get(snapshot.environment.id)
  const currentVersion = current?.states.at(-1)?.version ?? 0
  const snapshotVersion = snapshot.states.at(-1)?.version ?? 0
  if (!current || snapshotVersion > currentVersion) await repository.save(snapshot)
}
