type Request = { method?: string }
type Response = { status(code: number): Response; json(body: unknown): void; setHeader?(name: string, value: string): void }

export default function handler(req: Request, res: Response) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Use GET /api/health' })

  res.setHeader?.('Cache-Control', 'no-store')
  return res.status(200).json({
    status: 'ok',
    persistenceConfigured: Boolean(process.env.DATABASE_URL?.trim()),
    node: process.version,
  })
}
