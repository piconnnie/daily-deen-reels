#!/usr/bin/env node
// Turns a draft (written by Claude Code, by hand, or taken from the queue)
// into a validated reel content file.
//   node scripts/daily/finalize-draft.mjs <draft.json> [--check] [--source <label>] [--review <review.json>]
//   --check   validate only (used by Claude Code while iterating); prints OK or errors
// Without --check: writes src/content/reels/<id>.json + output/daily/<id>.writer.json
// and prints the reel id on the last stdout line. Exit 1 with the error list on failure.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, reelPath, readJsonIfExists} from '../lib.mjs';
import {syncRegistry} from '../sync-registry.mjs';
import {PILLARS} from './plan.mjs';
import {history, isoDate, normalizeDraft, validateReel, writeLog} from './writer-core.mjs';
import {ensureDatasets} from '../sources/sources.mjs';

const args = process.argv.slice(2);
const draftPath = args[0];
const opt = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const check = args.includes('--check');
const source = opt('source') ?? 'claude-code';
if (!draftPath) {
  console.error('Usage: finalize-draft.mjs <draft.json> [--check] [--source label] [--review review.json]');
  process.exit(2);
}

let draft;
try {
  draft = JSON.parse(fs.readFileSync(path.resolve(draftPath), 'utf8'));
} catch (e) {
  console.error(`Draft is not valid JSON: ${e.message}`);
  process.exit(1);
}

// Plan: today's plan when the brief was prepared (subscription mode), otherwise
// derived from the draft itself (queue / hand-written drafts).
const planFile = path.join(ROOT, 'output', 'daily', 'plan.json');
const prepared = source !== 'queue' ? readJsonIfExists(planFile) : null;
const pillarKey = (draft.brief?.pillar ?? '')[0];
const plan = prepared ?? {
  backlogId: draft.brief?.backlogId ?? null,
  pillar: pillarKey,
  pillarName: PILLARS[pillarKey] ?? draft.brief?.pillar,
  format: draft.brief?.format,
  research: draft.brief?.research === 'required',
};
const hist = history();

const fetchProblems = await ensureDatasets();
if (fetchProblems.length) {
  console.log(`NOT OK — verified source datasets unavailable:\n- ${fetchProblems.join('\n- ')}`);
  process.exit(1);
}
// normalizeDraft pulls every quote's exact text from the pinned datasets.
const reel = normalizeDraft(draft, plan, {source});
const errors = validateReel(reel, hist);
if (errors.length) {
  console.log(`NOT OK — ${errors.length} problem(s):`);
  for (const e of errors) console.log(`- ${e}`);
  process.exit(1);
}
if (check) {
  fs.rmSync(reelPath(reel.id), {force: true});
  syncRegistry();
  console.log(`OK — ${reel.id} passes structure, copy-limit and layout checks.`);
  process.exit(0);
}

const review = opt('review') ? readJsonIfExists(path.resolve(opt('review'))) : null;
writeLog(reel.id, {
  date: isoDate(),
  writer: source,
  plan: prepared ? prepared : {from: 'draft', ...plan},
  reelId: reel.id,
  rounds: [],
  finalCritic: review && {scores: review.scores, verdict: review.verdict, mustFix: review.mustFix ?? [], niceToHave: review.niceToHave ?? []},
  needsAttention: !!review && review.verdict !== 'pass',
  estimatedCostUsd: 0,
});
console.log(`Finalized ${reel.id} (writer: ${source})`);
console.log(reel.id);
