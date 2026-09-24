import { readFile } from 'node:fs/promises'

const files = {
  readme: await readFile(new URL('../README.md', import.meta.url), 'utf8'),
  license: await readFile(new URL('../LICENSE', import.meta.url), 'utf8'),
  env: await readFile(new URL('../.env.example', import.meta.url), 'utf8'),
  architecture: await readFile(new URL('../docs/ARCHITECTURE.md', import.meta.url), 'utf8'),
  testing: await readFile(new URL('../docs/JUDGE_TESTING.md', import.meta.url), 'utf8'),
  demo: await readFile(new URL('../docs/DEMO_SCENARIO.md', import.meta.url), 'utf8'),
  submission: await readFile(new URL('../SUBMISSION.md', import.meta.url), 'utf8'),
  checklist: await readFile(new URL('../SUBMISSION_CHECKLIST.md', import.meta.url), 'utf8'),
}

const requiredReadmeSections = [
  '# SENTINEL',
  '## What SENTINEL is',
  '## The problem',
  '## Why it is different',
  '## How it works',
  '## Architecture',
  '## NVIDIA + Nebius usage',
  '## Local setup',
  '## Judge testing',
  '## Canonical demo scenario',
  '## Reliability and guardrails',
  '## Limitations',
  '## Future direction',
  '## License',
]

for (const section of requiredReadmeSections) {
  expect(files.readme.includes(section), `README missing required judge section: ${section}`)
}

expect(files.readme.includes('https://sentinel-physical-memory.vercel.app'), 'README must contain the working public demo URL')
expect(files.readme.includes('https://github.com/realxpen/sentinel-physical-memory'), 'README must contain the public source repository URL')
expect(files.readme.includes('Best Apps and Agents'), 'README must identify the selected track')
expect(files.readme.includes('nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B'), 'README must identify the NVIDIA model')
expect(files.readme.includes('Nebius Token Factory'), 'README must explain Nebius Token Factory use')
expect(files.readme.includes('npm install') && files.readme.includes('npm run dev:local'), 'README must contain install + local run instructions')
expect(/MIT License/i.test(files.license), 'repository must contain a detectable MIT license')
expect(files.env.includes('NEBIUS_API_KEY=') && files.env.includes('DATABASE_URL='), '.env.example must document required server variables')
expect(!/NEBIUS_API_KEY=\S{8,}/.test(files.env), '.env.example must not contain a real Nebius key')
expect(!/DATABASE_URL=(?:postgres|postgresql):\/\//i.test(files.env), '.env.example must not contain a real database URL')

expect(files.architecture.includes('flowchart') && files.architecture.includes('Nebius Token Factory') && files.architecture.includes('Neon Postgres'), 'architecture doc must contain the end-to-end architecture diagram')
expect(files.testing.includes('No account or login is required'), 'judge testing guide must explain public access')
expect(files.testing.includes('What changed since the last scan?'), 'judge testing guide must provide a real product test')
expect(files.demo.includes('Scan A') && files.demo.includes('Scan B') && files.demo.includes('Scan C'), 'demo guide must contain the canonical three-scan journey')
expect(files.demo.includes('under three minutes'), 'demo guide must retain the official video duration constraint')

const requiredSubmissionSections = [
  '## Project name',
  '## Elevator pitch',
  '## Track',
  '## Working demo',
  '## Public source repository',
  '## Demo video',
  '## About the project',
  '### Inspiration',
  '### What it does',
  '### How we built it',
  '### Challenges',
  '### Accomplishments',
  '### What we learned',
  "### What's next",
  '## How NVIDIA is used',
  '## How Nebius is used',
  '## Nebius / NVIDIA feedback',
  '## Significant update during the submission period',
  '## Testing instructions',
  '## Built with',
]

for (const section of requiredSubmissionSections) {
  expect(files.submission.includes(section), `SUBMISSION.md missing: ${section}`)
}
expect(files.submission.includes('TODO before final submission'), 'submission draft must visibly keep the external YouTube dependency open')
expect(files.checklist.includes('- [ ] Upload video publicly to YouTube'), 'submission checklist must keep YouTube as an explicit external dependency')
expect(files.checklist.includes('- [x] Public GitHub repository'), 'submission checklist must track repository readiness')

console.log('PASS  judge README contains product, architecture, setup, demo, limitations and future direction')
console.log('PASS  MIT license + safe .env.example are submission-ready')
console.log('PASS  architecture / judge testing / demo docs are complete and linked')
console.log('PASS  Devpost draft contains required project, NVIDIA, Nebius, feedback and testing sections')
console.log('PASS  public YouTube link remains explicitly pending rather than fabricated')
console.log('SENTINEL PHASE 17 REPOSITORY SUBMISSION PACKAGE VERIFIED')

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
