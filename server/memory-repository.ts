import { InMemoryEnvironmentalMemoryRepository, type EnvironmentalMemoryRepository } from '../src/memory/repository'
import { SupabaseEnvironmentalMemoryRepository } from '../src/memory/supabase-repository'

export type MemoryPersistenceMode = 'supabase' | 'volatile'

let repository: EnvironmentalMemoryRepository | undefined
let persistenceMode: MemoryPersistenceMode | undefined

export function getRuntimeEnvironmentalMemoryRepository(): EnvironmentalMemoryRepository {
  if (repository) return repository

  const url = process.env.SUPABASE_URL?.trim()
  const secretKey = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim()

  if ((url && !secretKey) || (!url && secretKey)) {
    throw new Error('Persistent memory is partially configured: set both SUPABASE_URL and SUPABASE_SECRET_KEY')
  }

  if (url && secretKey) {
    repository = new SupabaseEnvironmentalMemoryRepository(url, secretKey)
    persistenceMode = 'supabase'
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
