import { getRuntimeEnvDiagnostics } from '../server/runtime-env.js'

type Request = { method?: string }
type Response = { status(code: number): Response; json(body: unknown): void; setHeader?(name: string, value: string): void }

export default function handler(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Use GET /api/health' })

  const diagnostics = getRuntimeEnvDiagnostics()
  res.setHeader?.('Cache-Control', 'no-store')
  return res.status(200).json({
    status: 'ok',
    persistenceConfigured: diagnostics.databaseUrlConfigured,
    nebiusConfigured: diagnostics.nebiusApiKeyConfigured,
    runtimeEnvironment: process.env.VERCEL_ENV ?? 'local',
    localEnvFilesLoaded: diagnostics.loadedFiles,
    dnsResultOrder: diagnostics.dnsResultOrder,
    node: process.version,
  })
}
