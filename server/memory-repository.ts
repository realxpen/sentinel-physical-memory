import { InMemoryEnvironmentalMemoryRepository, type EnvironmentalMemoryRepository } from '../src/memory/repository.js'
import { NeonEnvironmentalMemoryRepository, type NeonTransport } from './neon-memory-repository.js'
import { ensureRuntimeEnvLoaded } from './runtime-env.js'

export type MemoryPersistenceMode = 'neon' | 'volatile'

let repository: EnvironmentalMemoryRepository | undefined
let persistenceMode: MemoryPersistenceMode | undefined
let neonTransport: NeonTransport | undefined

export function getRuntimeEnvironmentalMemoryRepository(): EnvironmentalMemoryRepository {
  if (repository) return repository

  ensureRuntimeEnvLoaded()
  const databaseUrl = process.env.DATABASE_URL?.trim()

  if (databaseUrl) {
    neonTransport = resolveNeonTransport()
    repository = new NeonEnvironmentalMemoryRepository(databaseUrl, { transport: neonTransport })
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

export function getRuntimeNeonTransport(): NeonTransport | undefined {
  getRuntimeEnvironmentalMemoryRepository()
  return neonTransport
}

function resolveNeonTransport(): NeonTransport {
  const configured = process.env.SENTINEL_NEON_TRANSPORT?.trim().toLowerCase()
  if (configured === 'http' || configured === 'websocket' || configured === 'auto') return configured

  // Local connectivity has proven intermittent across both Neon transports.
  // Let the repository prefer WebSocket, remember whichever path last worked,
  // and fail over to the alternate transport on transient network errors.
  // Deployed Vercel keeps the production-proven HTTP one-shot query path.
  return process.env.VERCEL_ENV ? 'http' : 'auto'
}
