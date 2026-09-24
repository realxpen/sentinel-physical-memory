import { readFile } from 'node:fs/promises'

const [timelineText, finalDoc, youtube, checklist, submission] = await Promise.all([
  readFile(new URL('../docs/demo-timeline.json', import.meta.url), 'utf8'),
  readFile(new URL('../docs/FINAL_DEMO_VIDEO.md', import.meta.url), 'utf8'),
  readFile(new URL('../docs/YOUTUBE_COPY.md', import.meta.url), 'utf8'),
  readFile(new URL('../docs/RECORDING_CHECKLIST.md', import.meta.url), 'utf8'),
  readFile(new URL('../SUBMISSION.md', import.meta.url), 'utf8'),
])

const timeline = JSON.parse(timelineText)
expect(Number.isFinite(timeline.targetDurationSeconds), 'demo timeline needs targetDurationSeconds')
expect(timeline.targetDurationSeconds <= 179, 'target demo duration must leave safety below 3:00')
expect(Array.isArray(timeline.segments) && timeline.segments.length >= 10, 'demo timeline must contain the full product story')

let previousEnd = 0
for (const [index, segment] of timeline.segments.entries()) {
  expect(Number.isFinite(segment.start) && Number.isFinite(segment.end), 'segment ' + index + ' needs numeric timing')
  expect(segment.start >= previousEnd, 'segment ' + index + ' overlaps an earlier segment')
  expect(segment.end > segment.start, 'segment ' + index + ' must have positive duration')
  expect(typeof segment.label === 'string' && segment.label.trim(), 'segment ' + index + ' needs a label')
  expect(typeof segment.voiceover === 'string' && segment.voiceover.trim(), 'segment ' + index + ' needs voiceover')
  previousEnd = segment.end
}
expect(timeline.segments[0].start === 0, 'demo must start at 0:00')
expect(previousEnd <= 179, 'demo timeline must remain below 180s')
expect(previousEnd === timeline.targetDurationSeconds, 'timeline end must equal targetDurationSeconds')

const labels = timeline.segments.map((item) => item.label.toLowerCase()).join(' | ')
for (const required of ['give this place a memory', 'observe', 'remembered', 'evidence', 'reality diff', 'priority', 'action plan', 'fix and rescan', 'verified', 'close']) {
  expect(labels.includes(required), 'demo timeline missing required story beat: ' + required)
}

expect(finalDoc.includes('Target runtime: **2:58**'), 'final demo guide must state the locked runtime')
expect(finalDoc.includes('Browser zoom: **100%**'), 'final demo guide must fix recording zoom')
expect(
  /model waiting time/i.test(finalDoc) || /remove the waiting section in editing/i.test(finalDoc),
  'editing guide must remove inference waiting time',
)
expect(finalDoc.includes('Nebius Token Factory · NVIDIA Nemotron 3 Nano'), 'video plan must include brief Nebius/NVIDIA proof')
expect(finalDoc.includes('no secrets'), 'video quality gate must protect secrets')
expect(finalDoc.includes('final result visibly says **Verified**'), 'video quality gate must require the closed-loop result')

expect(youtube.includes('SENTINEL — AI Memory for the Physical World'), 'YouTube copy needs project title')
expect(youtube.includes('Nebius Token Factory'), 'YouTube description needs Nebius')
expect(youtube.includes('NVIDIA Nemotron 3 Nano 30B-A3B'), 'YouTube description needs NVIDIA model')
expect(youtube.includes('https://sentinel-physical-memory.vercel.app'), 'YouTube description needs live demo URL')
expect(youtube.includes('https://github.com/realxpen/sentinel-physical-memory'), 'YouTube description needs source URL')

expect(checklist.includes('Visibility = Public'), 'recording checklist must require public YouTube visibility')
expect(checklist.includes('duration shown by YouTube is < 3:00'), 'recording checklist must verify actual uploaded duration')
expect(checklist.includes('Replace TODO in `SUBMISSION.md`'), 'recording checklist must wire video URL back into submission')
expect(submission.includes('TODO before final submission'), 'until upload happens, public YouTube URL must remain explicitly pending')

console.log('PASS  locked demo timeline is 178 seconds with no overlap')
console.log('PASS  demo includes Memory → Observe → Reality Diff → Ask → Action → Verify')
console.log('PASS  recording guide protects readability, secrets, trust semantics and runtime')
console.log('PASS  YouTube copy names Nebius Token Factory + NVIDIA Nemotron and links demo/source')
console.log('PASS  external YouTube URL remains explicit pending work rather than fabricated')
console.log('SENTINEL PHASE 18 REPOSITORY DEMO PACKAGE VERIFIED')

function expect(condition, message) {
  if (!condition) throw new Error(message)
}
