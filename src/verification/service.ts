import type { VerificationRequest, VerificationResult } from '../domain/sentinel'

export interface VerificationService {
  verify(request: VerificationRequest): Promise<VerificationResult>
}
