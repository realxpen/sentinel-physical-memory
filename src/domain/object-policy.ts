import type { SpatialObject } from './sentinel.js'

const PERSON_NAMES = /^(?:a |an |the )?(?:person|people|human|occupant|occupants|worker|workers|employee|employees|staff member|staff|man|woman|adult|child)$/i

export function isPersonObject(
  item: Pick<SpatialObject, 'category' | 'name'>,
): boolean {
  if (item.category === 'person') return true
  return PERSON_NAMES.test(item.name.trim())
}

export function isConfirmedPersonObject(
  item: Pick<SpatialObject, 'category' | 'name' | 'personGrounding'>,
): boolean {
  if (!isPersonObject(item)) return false
  return item.personGrounding?.status === 'confirmed'
    && item.personGrounding.method === 'independent-visual-confirmation'
    && item.personGrounding.confidence >= 0.95
    && item.personGrounding.cues.length >= 2
}

export function isUnconfirmedPersonObject(
  item: Pick<SpatialObject, 'category' | 'name' | 'personGrounding'>,
): boolean {
  return isPersonObject(item) && !isConfirmedPersonObject(item)
}

export function isPersonChangeTitle(title: string): boolean {
  const subject = title
    .replace(/^(?:New|Moved|Changed|Removed|Resolved|Not re-observed):\s*/i, '')
    .trim()
  return PERSON_NAMES.test(subject)
}
