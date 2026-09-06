type Request = { method?: string }
type Response = { status(code: number): Response; json(body: unknown): void }

const DEFAULT_BASE_URL = 'https://api.tokenfactory.us-central1.nebius.com/v1'
const LEGACY_GLOBAL_BASE_URL = 'https://api.tokenfactory.nebius.com/v1'

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' })

  const apiKey = process.env.NEBIUS_API_KEY?.trim()
  if (!apiKey) return res.status(503).json({ error: 'NEBIUS_NOT_CONFIGURED' })

  const configured = process.env.NEBIUS_TOKEN_FACTORY_BASE_URL?.trim().replace(/\/$/, '')
  const baseUrl = !configured || configured === LEGACY_GLOBAL_BASE_URL ? DEFAULT_BASE_URL : configured

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    })
    const text = await response.text()
    let payload: unknown
    try { payload = JSON.parse(text) } catch { payload = { raw: text.slice(0, 1000) } }

    if (!response.ok) return res.status(response.status).json({ error: 'MODEL_CATALOG_FAILED', baseUrl, payload })

    const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : []
    const ids = data
      .map((item) => isRecord(item) && typeof item.id === 'string' ? item.id : undefined)
      .filter((id): id is string => Boolean(id))
    const nemotron = ids.filter((id) => /nemotron/i.test(id))

    return res.status(200).json({ baseUrl, totalModels: ids.length, nemotron })
  } catch (error) {
    return res.status(500).json({ error: 'MODEL_CATALOG_FAILED', baseUrl, message: error instanceof Error ? error.message : 'Unknown error' })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
