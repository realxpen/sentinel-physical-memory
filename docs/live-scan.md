# SENTINEL live scan

Step 5 connects the scan pipeline to Nebius Token Factory without exposing the Nebius key to the browser.

## Request flow

```text
Browser File
  -> src/scan/client.ts
  -> POST /api/scan
  -> ScanPipeline
  -> NebiusNemotronAdapter
  -> Nebius Token Factory
  -> NVIDIA Nemotron 3 Nano Omni
  -> strict perception validation
  -> typed SENTINEL observations
```

## Server environment

Set these variables in the deployment environment, not in browser-exposed variables:

- `NEBIUS_API_KEY`
- `NEBIUS_TOKEN_FACTORY_BASE_URL` (defaults to `https://api.tokenfactory.nebius.com/v1`)
- `NEBIUS_NEMOTRON_MODEL` (defaults to `nvidia/nemotron-3-nano-omni`)
- `SENTINEL_ALLOWED_ORIGIN` (optional)

## Client usage

```ts
await scanImage({
  environmentId: 'office-demo',
  sourceId: 'scan-source-001',
  file,
})
```

The browser sends an image data URL to the server endpoint. The server owns the Nebius credential and forwards the media to the model adapter.

## Safety boundaries

- The API key is server-only.
- Requests are capped at 6 MB.
- Only HTTPS media URLs and image data URLs are accepted.
- Images must use JPEG, PNG, or WebP.
- Model output is rejected unless it matches the typed perception schema.
- Scan identity is checked so observations cannot silently cross environments or sources.
- Video remains part of the domain contract, but live video inference is intentionally blocked until server-side frame extraction is implemented.
