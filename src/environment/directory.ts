import type { EnvironmentType } from '../domain/sentinel'

export interface EnvironmentProfile {
  id: string
  name: string
  type: EnvironmentType
}

const DIRECTORY_KEY = 'sentinel.environmentDirectory.v1'
const ACTIVE_KEY = 'sentinel.activeEnvironment.v1'

export const DEFAULT_ENVIRONMENT: EnvironmentProfile = {
  id: 'office-demo',
  name: 'Office 01',
  type: 'office',
}

export const ENVIRONMENT_TYPES: Array<{ value: EnvironmentType; label: string }> = [
  { value: 'office', label: 'Office' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'retail', label: 'Retail' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'school', label: 'School' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'construction', label: 'Construction' },
  { value: 'home', label: 'Home' },
  { value: 'other', label: 'Other' },
]

export function loadEnvironmentDirectory(): EnvironmentProfile[] {
  if (typeof window === 'undefined') return [DEFAULT_ENVIRONMENT]
  try {
    const raw = window.localStorage.getItem(DIRECTORY_KEY)
    if (!raw) return [DEFAULT_ENVIRONMENT]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [DEFAULT_ENVIRONMENT]
    const valid = parsed.filter(isEnvironmentProfile)
    const merged = valid.some((item) => item.id === DEFAULT_ENVIRONMENT.id)
      ? valid
      : [DEFAULT_ENVIRONMENT, ...valid]
    return merged.length ? merged : [DEFAULT_ENVIRONMENT]
  } catch {
    return [DEFAULT_ENVIRONMENT]
  }
}

export function saveEnvironmentDirectory(profiles: EnvironmentProfile[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DIRECTORY_KEY, JSON.stringify(profiles))
}

export function loadActiveEnvironmentId(profiles: EnvironmentProfile[]): string {
  if (typeof window === 'undefined') return profiles[0]?.id ?? DEFAULT_ENVIRONMENT.id
  const stored = window.localStorage.getItem(ACTIVE_KEY)
  return profiles.some((item) => item.id === stored) ? stored! : (profiles[0]?.id ?? DEFAULT_ENVIRONMENT.id)
}

export function saveActiveEnvironmentId(environmentId: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ACTIVE_KEY, environmentId)
}

export function createEnvironmentProfile(name: string, type: EnvironmentType): EnvironmentProfile {
  const normalizedName = name.trim()
  if (!normalizedName) throw new Error('Location name is required')
  const slug = normalizedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'location'
  return {
    id: `env_${slug}_${crypto.randomUUID().slice(0, 8)}`,
    name: normalizedName,
    type,
  }
}

function isEnvironmentProfile(value: unknown): value is EnvironmentProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Partial<EnvironmentProfile>
  return typeof candidate.id === 'string'
    && Boolean(candidate.id.trim())
    && typeof candidate.name === 'string'
    && Boolean(candidate.name.trim())
    && ENVIRONMENT_TYPES.some((item) => item.value === candidate.type)
}
