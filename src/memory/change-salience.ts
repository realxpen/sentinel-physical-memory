import type { Change, SpatialObject } from '../domain/sentinel.js'

const STRUCTURAL_SURFACE = /^(?:(?:white|painted|brick|concrete|interior|exterior) )?wall$|^(?:(?:wooden|wood|tile|tiled|concrete|vinyl|laminate|hardwood|carpeted) )?floor$|^(?:(?:white|painted|drop|suspended) )?ceiling$/
const MICRO_INVENTORY = /^(?:cup|mug|pen holder|pencil holder|light switch|switch plate|books|book|globe|wicker basket|basket|potted plant|plant|rug|area rug|carpet)$/
const DOOR_HARDWARE = /\b(?:door\s*knob|doorknob|door\s*handle|door\s*hardware|door\s*frame|doorframe|hinge|hinges|latch|lockset|strike plate|door closer|push bar|panic bar|threshold)\b/
const DURABLE_ARCHITECTURAL_ANCHOR = /\b(?:doorway|door|window|room|corridor|hallway|entryway|entrance|door frame|doorframe)\b/
const FURNITURE_DOOR = /\b(?:closet|cabinet|cupboard|locker|wardrobe)\s+door\b/
const LIGHT_FIXTURE = /\b(?:ceiling light|ceiling lights|light fixture|light fixtures|recessed light|recessed lights|downlight|downlights|pendant light|wall sconce)\b/
const DECOR = /\b(?:wall decor|wall decoration|decorative wall|poster|motivational poster|framed poster|artwork|wall art|picture|picture frame|framed picture)\b/
const ROOM_LABEL = /\b(?:conference room sign|room sign|office sign|nameplate|room label|door sign|room plaque|wall plaque)\b/
const SAFETY_SIGNAGE = /\b(?:exit|emergency|fire|safety|warning|caution|hazard|evacuation|first aid|aed)\b/

export function isDurableArchitecturalAnchorObject(
  item: Pick<SpatialObject, 'name' | 'description' | 'category'>,
): boolean {
  const text = normalize(`${item.name} ${item.description ?? ''}`)
  if (FURNITURE_DOOR.test(text)) return false
  if (item.category === 'room') return true
  if (item.category === 'door') return true
  return DURABLE_ARCHITECTURAL_ANCHOR.test(text)
}

export function isLowSalienceInventoryObject(
  item: Pick<SpatialObject, 'name' | 'description' | 'category'>,
): boolean {
  const name = normalize(item.name)
  const text = normalize(`${item.name} ${item.description ?? ''}`)

  if (STRUCTURAL_SURFACE.test(name)) return true
  if (MICRO_INVENTORY.test(name)) return true
  if (DOOR_HARDWARE.test(text)) return true
  if (LIGHT_FIXTURE.test(text)) return true

  if (item.category === 'signage' && SAFETY_SIGNAGE.test(text)) return false
  if (DECOR.test(text) || ROOM_LABEL.test(text)) return true

  return false
}

/**
 * Historical diffs are immutable, so noisy object cards already persisted by
 * an older perception run are filtered only at presentation time.
 *
 * Operational condition/issue cards are never filtered here. A low-salience
 * object may still matter when it participates in a grounded access, safety,
 * maintenance, damage, or compliance condition.
 */
export function isLowSalienceObjectChange(change: Change): boolean {
  if (change.entityKind && change.entityKind !== 'object') return false

  const text = normalize(`${stripChangePrefix(change.title)} ${change.description}`)
  if (SAFETY_SIGNAGE.test(text) && /\bsign\b/.test(text)) return false

  // A provider frequently re-segments permanent architecture between still
  // images (for example "doorway" → "exit door", or "Conference Room" →
  // "Conference Room door"). Treat unmatched added/not-re-observed cards for
  // those durable anchors as presentation noise. Explicit state transitions,
  // movement, removals, and condition/issue cards remain visible.
  if (
    (change.type === 'added' || change.type === 'uncertain') &&
    !FURNITURE_DOOR.test(text) &&
    DURABLE_ARCHITECTURAL_ANCHOR.test(text)
  ) return true

  if (STRUCTURAL_SURFACE.test(normalize(stripChangePrefix(change.title)))) return true
  if (MICRO_INVENTORY.test(normalize(stripChangePrefix(change.title)))) return true

  return DOOR_HARDWARE.test(text) ||
    LIGHT_FIXTURE.test(text) ||
    DECOR.test(text) ||
    ROOM_LABEL.test(text)
}

function stripChangePrefix(value: string): string {
  return value
    .replace(/^(?:New|Removed|Moved|Changed):\s*/i, '')
    .replace(/^Not re-observed:\s*/i, '')
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}
