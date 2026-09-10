import { InMemoryEnvironmentalMemoryRepository, type EnvironmentalMemoryRepository } from '../src/memory/repository.js'
import { NeonEnvironmentalMemoryRepository } from './neon-memory-repository.js'
import { ensureRuntimeEnvLoaded } from './runtime-env.js'

export type MemoryPersistenceMode = 'neon' | 'volatile'

let repository: EnvironmentalMemoryRepository | undefined
let persistenceMode: MemoryPersistenceMode | undefined

export function getRuntimeEnvironmentalMemoryRepository(): EnvironmentalMemoryRepository {
  if (repository) return repository

  ensureRuntimeEnvLoaded()
  const databaseUrl = process.env.DATABASE_URL?.trim()

  if (databaseUrl) {
    repository = new NeonEnvironmentalMemoryRepository(databaseUrl)
    persistenceMode = 'neon'
    return repository
  }

  repository = new InMemoryEnvironmentalMemoryRepository()
  persistenceMode = 'volatile'
  return repository
}

export function getMemoryPersistenceMode(): MemoryPersistenceMode {
  getRuntimeEnvironmentalMemoryRepository()
  return persistenceMode ?? 'volatile'
}
