import type { EnvironmentalCondition, PerceptionResult } from '../domain/sentinel.js'

export interface ConditionDerivationResult {
  result: PerceptionResult
  derivedConditions: EnvironmentalCondition[]
}

/**
 * Compatibility boundary for Phase 5.
 *
 * SENTINEL no longer infers semantic conditions from keyword/regex tables.
 * Current-scene physical facts are interpreted by the generic condition
 * reasoner, then object/evidence references and confidence are gated
 * deterministically before persistence.
 *
 * This function intentionally performs no semantic inference. It remains in
 * place so older callers/tests can keep the Phase 5 boundary while the active
 * pipeline migrates fully to model-backed, evidence-grounded condition
 * reasoning.
 */
export function deriveOperationalConditions(
  perception: PerceptionResult,
  _observedAt: string,
): ConditionDerivationResult {
  return {
    result: perception,
    derivedConditions: [],
  }
}
