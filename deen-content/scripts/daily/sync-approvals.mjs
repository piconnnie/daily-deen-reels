#!/usr/bin/env node
// Records approval for every reel whose review PR has been merged but whose
// archive/<id>/state.json still says "pending". Runs at the start of every
// publish run, so an approval is never lost — even if the run triggered by the
// merge itself was cancelled (GitHub keeps only one pending run per
// concurrency group, so approving several PRs quickly can drop some runs).
//   node scripts/daily/sync-approvals.mjs          → prints recorded ids (one per line)
// Uses the gh CLI (GH_TOKEN). Comments on each PR it records.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from '../lib.mjs';

const gh = (...args) => execFileSync('gh', args, {encoding: 'utf8'});
const dir = path.join(ROOT, 'archive');
const ids = fs.existsSync(dir) ? fs.readdirSync(dir).filter((id) => fs.existsSync(path.join(dir, id, 'state.json'))) : [];
const recorded = [];

for (const id of ids) {
  const file = path.join(dir, id, 'state.json');
  const state = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (state.approval?.status === 'approved' || state.publish?.status === 'published') continue;
  let prs;
  try {
    prs = JSON.parse(gh('pr', 'list', '--state', 'merged', '--head', `reel/${id}`, '--json', 'number,labels,mergedBy,mergedAt') || '[]');
  } catch (e) {
    console.error(`sync-approvals: couldn't list PRs for ${id}: ${e.message}`);
    continue;
  }
  const pr = prs.find((p) => (p.labels ?? []).some((l) => (l.name ?? l) === 'daily-reel'));
  if (!pr) continue;
  state.approval = {status: 'approved', approvedBy: pr.mergedBy?.login ?? null, approvedAt: pr.mergedAt ?? new Date().toISOString(), pr: pr.number};
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
  recorded.push({id, pr});
}

for (const {id, pr} of recorded) console.log(`${id}\t${pr.number}\t${pr.mergedBy?.login ?? 'unknown'}`);
console.error(`sync-approvals: recorded ${recorded.length} approval(s)`);
