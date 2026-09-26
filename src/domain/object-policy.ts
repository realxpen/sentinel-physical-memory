import type { SpatialObject } from './sentinel.js'

const TRANSIENT_PERSON_NAMES = /^(?:a |an |the )?(?:person|people|human|occupant|occupants|worker|workers|employee|employees|staff member|staff)$/i

export function isTransientEnvironmentalObject(
  item: Pick<SpatialObject, 'category' | 'name'>,
): boolean {
  if (item.category === 'person') return true
  return TRANSIENT_PERSON_NAMES.test(item.name.trim())
}

export function isTransientPersonChangeTitle(title: string): boolean {
  const subject = title
    .replace(/^(?:New|Moved|Changed|Removed|Resolved|Not re-observed):\s*/i, '')
    .trim()
  return TRANSIENT_PERSON_NAMES.test(subject)
}
