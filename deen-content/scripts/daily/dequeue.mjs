#!/usr/bin/env node
// Queue writer mode (no model, no cost): takes the oldest unused draft from
// data/queue/ and finalizes it into today's reel. A draft counts as used once
// any reel (merged or awaiting review) carries its queueId, so parallel review
// PRs never pick the same one. Drafts are never deleted — they're the record.
//   node scripts/daily/dequeue.mjs            → prints the new reel id (last line)
//   node scripts/daily/dequeue.mjs --status   → how many drafts are left (with names)
//   node scripts/daily/dequeue.mjs --count    → just the number
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ROOT, listReels, loadReel} from '../lib.mjs';

const dir = path.join(ROOT, 'data', 'queue');
const drafts = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
const used = new Set(listReels().map((id) => loadReel(id).brief?.queueId).filter(Boolean));
const remaining = drafts.filter((f) => !used.has(f.replace(/\.json$/, '')));

if (process.argv.includes('--count')) {
  console.log(remaining.length);
  process.exit(0);
}
if (process.argv.includes('--status')) {
  console.log(`${remaining.length} unused draft(s) in data/queue: ${remaining.join(', ') || '(none)'}`);
  process.exit(0);
}
if (!remaining.length) {
  console.error('The content queue is empty. Refill it for free: ask Claude in chat to "write the next batch of queue drafts for daily-deen-reels" and commit the files to data/queue/. (Paid writers stay off unless the DEEN_WRITER variable opts in.)');
  process.exit(1);
}

for (const file of remaining) {
  const queueId = file.replace(/\.json$/, '');
  const draft = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  draft.brief = {...draft.brief, queueId};
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'deen-q-')), 'draft.json');
  fs.writeFileSync(tmp, JSON.stringify(draft));
  const r = spawnSync('node', ['scripts/daily/finalize-draft.mjs', tmp, '--source', 'queue'], {cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  if (r.status === 0) {
    const id = r.stdout.trim().split('\n').pop();
    console.log(`Dequeued ${file} → ${id} (${remaining.length - 1} left)`);
    console.log(id);
    process.exit(0);
  }
  console.warn(`Skipping ${file}: it no longer passes validation (e.g. too similar to a newer reel):\n${r.stdout.trim()}`);
}
console.error('No queued draft passed validation.');
process.exit(1);
