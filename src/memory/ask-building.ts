import type { AskBuildingRequest, AskBuildingResponse, EnvironmentalMemory, Evidence, Issue, SpatialObject } from '../domain/sentinel'
import type { ReasoningModelAdapter } from '../ai/model'
import type { EnvironmentalMemoryReader } from './repository'

export class AskBuildingService {
  constructor(private readonly memory: EnvironmentalMemoryReader, private readonly model: ReasoningModelAdapter) {}

  async ask(request: AskBuildingRequest): Promise<AskBuildingResponse> {
    const environment = await this.memory.get(request.environmentId)
    if (!environment) throw new Error(`Environment ${request.environmentId} not found`)
    if (!environment.states.length) throw new Error(`Environment ${request.environmentId} has no scans yet`)

    const state = request.stateId ? environment.states.find((item) => item.id === request.stateId) : environment.states.at(-1)
    if (!state) throw new Error(`State ${request.stateId} not found`)

    const context = this.buildContext(environment, state.id, request.question)
    const answer = await this.model.reason({ role: 'reasoning', request: { ...request, stateId: state.id }, context })
    return this.validateEvidence(answer, environment, state.id)
  }

  private buildContext(memory: EnvironmentalMemory, stateId: string, question: string): string {
    const state = memory.states.find((item) => item.id === stateId)
    if (!state) throw new Error(`State ${stateId} not found`)
    const normalized = question.toLowerCase()
    const tokens = normalized.split(/[^a-z0-9]+/).filter((token) => token.length >= 3)
    const snapshot = memory.snapshots.find((item) => item.stateId === state.id)
    const stateObjects = snapshot?.objects ?? memory.objects.filter((object) => state.objectIds.includes(object.id))
    const stateIssues = snapshot?.issues ?? memory.issues.filter((issue) => state.issueIds.includes(issue.id))
    const objects = [...stateObjects].sort((a, b) => this.relevance(b, tokens) - this.relevance(a, tokens))
    const issues = [...stateIssues].sort((a, b) => this.relevance(b, tokens) - this.relevance(a, tokens))
    const evidenceIds = new Set([...objects.flatMap((item) => item.evidenceIds), ...issues.flatMap((item) => item.evidenceIds)])
    const evidence = memory.evidence.filter((item) => evidenceIds.has(item.id))
    const previousState = memory.states.find((item) => item.version === state.version - 1)
    const diff = memory.diffs.find((item) => item.fromStateId === previousState?.id && item.toStateId === state.id)

    return [
      `ENVIRONMENT ${memory.environment.id}: ${memory.environment.name}`,
      `STATE_ID ${state.id} VERSION ${state.version} CAPTURED_AT ${state.capturedAt}`,
      `STATE_SUMMARY: ${state.summary}`,
      `QUESTION: ${question}`,
      'RELEVANT OBJECTS:',
      ...objects.slice(0, 30).map((item) => this.objectLine(item)),
      'RELEVANT ISSUES:',
      ...issues.slice(0, 30).map((item) => this.issueLine(item)),
      'EVIDENCE:',
      ...evidence.slice(0, 60).map((item) => this.evidenceLine(item)),
      previousState ? `PREVIOUS_STATE_ID ${previousState.id} VERSION ${previousState.version}` : 'NO_PREVIOUS_STATE',
      diff ? `ENVIRONMENTAL_DIFF ${diff.id}: ${diff.summary}\n${diff.changes.map((change) => `- ${change.type}: ${change.title} | ${change.description} | evidence=${change.evidenceIds.join(',')}`).join('\n')}` : 'NO_DIFF_FOR_SELECTED_STATE',
    ].join('\n')
  }

  private relevance(item: SpatialObject | Issue, tokens: string[]): number { const text = `${'name' in item ? item.name : item.title} ${item.description ?? ''}`.toLowerCase(); return tokens.reduce((score, token) => score + (text.includes(token) ? 1 : 0), 0) }
  private objectLine(item: SpatialObject): string { return `- OBJECT ${item.id}: ${item.name} | category=${item.category} | state=${item.state ?? 'unknown'} | confidence=${item.confidence} | position=${item.position?.description ?? 'unknown'} | evidence=${item.evidenceIds.join(',')}` }
  private issueLine(item: Issue): string { return `- ISSUE ${item.id}: ${item.title} | severity=${item.severity} | status=${item.status} | description=${item.description} | evidence=${item.evidenceIds.join(',')}` }
  private evidenceLine(item: Evidence): string { return `- EVIDENCE ${item.id}: type=${item.type} source=${item.sourceId} description=${item.description} frame=${item.frameIndex ?? 'n/a'} timestampMs=${item.timestampMs ?? 'n/a'}` }

  private validateEvidence(answer: AskBuildingResponse, memory: EnvironmentalMemory, stateId: string): AskBuildingResponse {
    const state = memory.states.find((item) => item.id === stateId)
    const snapshot = memory.snapshots.find((item) => item.stateId === stateId)
    const validEvidence = new Set(memory.evidence.map((item) => item.id))
    const validObjects = new Set((snapshot?.objects ?? memory.objects.filter((item) => state?.objectIds.includes(item.id))).map((item) => item.id))
    const validIssues = new Set((snapshot?.issues ?? memory.issues.filter((item) => state?.issueIds.includes(item.id))).map((item) => item.id))
    return { ...answer, stateId, evidenceIds: answer.evidenceIds.filter((id) => validEvidence.has(id)), relatedObjectIds: answer.relatedObjectIds.filter((id) => validObjects.has(id)), relatedIssueIds: answer.relatedIssueIds.filter((id) => validIssues.has(id)) }
  }
}
