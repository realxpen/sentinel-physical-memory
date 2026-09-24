import { getRuntimeEnvDiagnostics } from '../server/runtime-env.js'
import { getRuntimeNeonTransport } from '../server/memory-repository.js'

type Request = { method?: string }
type Response = { status(code: number): Response; json(body: unknown): void; setHeader?(name: string, value: string): void }

export default function handler(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Use GET /api/health' })

  const diagnostics = getRuntimeEnvDiagnostics()
  res.setHeader?.('Cache-Control', 'no-store')
  const perceptionModel = process.env.NEBIUS_PERCEPTION_MODEL?.trim() || 'openbmb/MiniCPM-V-4_5'
  const reasoningModel = process.env.NEBIUS_NEMOTRON_REASONING_MODEL?.trim() || 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B'
  const verificationModel = process.env.NEBIUS_VERIFICATION_MODEL?.trim() || perceptionModel

  return res.status(200).json({
    status: 'ok',
    persistenceConfigured: diagnostics.databaseUrlConfigured,
    persistenceTransport: diagnostics.databaseUrlConfigured ? getRuntimeNeonTransport() : undefined,
    nebiusConfigured: diagnostics.nebiusApiKeyConfigured,
    aiRuntime: {
      provider: 'nebius-token-factory',
      baseUrl: diagnostics.nebiusBaseUrl,
      perceptionModel,
      reasoningModel,
      verificationModel,
      roles: {
        perception: perceptionModel,
        temporalVerification: perceptionModel,
        ask: reasoningModel,
        actionPlan: reasoningModel,
        verification: verificationModel,
      },
    },
    runtimeEnvironment: process.env.VERCEL_ENV ?? 'local',
    deploymentCommit: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || undefined,
    localEnvFilesLoaded: diagnostics.loadedFiles,
    databaseUrlSource: diagnostics.databaseUrlSource,
    databaseHost: diagnostics.databaseHost,
    nebiusApiKeySource: diagnostics.nebiusApiKeySource,
    nebiusBaseUrl: diagnostics.nebiusBaseUrl,
    dnsResultOrder: diagnostics.dnsResultOrder,
    node: process.version,
  })
}
