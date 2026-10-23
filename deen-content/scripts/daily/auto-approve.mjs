#!/usr/bin/env node
// Auto-approval (on by default on this page: DEEN_AUTO_APPROVE, set "false" to review by hand).
// Every reel has already passed the source gate (verbatim text from the pinned
// datasets, approved collections, no attributions in our own words, verified
// recitation). Reels with QA warnings (e.g. ruling-type words) are labelled
// needs-attention and always wait for a person. Runs at the start of each
// publish run. Once the local time passes DEEN_POST_TIME, it merges the oldest
// waiting review PR — but only one at a time, only if nothing approved is
// already waiting to post, and only while today's posting cap isn't used up.
//
// The morning-to-post-time gap is the veto window: close the PR, or add the
// `hold` label, and it is never auto-approved. PRs flagged `needs-attention`
// (the editor wasn't satisfied) always wait for a human.
//
//   node scripts/daily/auto-approve.mjs   → prints the merged PR number (or nothing)
// Uses the gh CLI (GH_TOKEN). Never posts by itself; sync-approvals + publish-due do that.
import {execFileSync} from 'node:child_process';
import {loadStates, localParts} from './publish-due.mjs';
import {occasionsOn} from './occasions.mjs';

const log = (m) => console.error(`auto-approve: ${m}`);
if (String(process.env.DEEN_AUTO_APPROVE ?? 'true').toLowerCase() === 'false') {
  log('off (DEEN_AUTO_APPROVE is false: every post waits for a person to merge its PR)');
  process.exit(0);
}
const POST_TIME = process.env.DEEN_POST_TIME || '19:00';
const MAX_PER_DAY = Number(process.env.DEEN_MAX_PER_DAY || 1);
const SKIP = new Set(['needs-attention', 'hold']);
const gh = (...args) => execFileSync('gh', args, {encoding: 'utf8'});

const nowDate = process.env.DEEN_NOW ? new Date(process.env.DEEN_NOW) : new Date();
const now = localParts(nowDate);
if (now.time < POST_TIME) {
  log(`before ${POST_TIME} (now ${now.time}): review window still open`);
  process.exit(0);
}
const states = loadStates();
const waiting = states.filter((s) => s.approval?.status === 'approved' && ['pending', 'failed'].includes(s.publish?.status ?? 'pending') && (s.publish?.attempts ?? 0) < 3);
if (waiting.length) {
  log(`${waiting[0].id} is already approved and waiting to post`);
  process.exit(0);
}
const postedToday = states.filter((s) => s.publish?.status === 'published' && s.publish.publishedAt && localParts(new Date(s.publish.publishedAt)).date === now.date).length;
if (postedToday >= MAX_PER_DAY) {
  log(`already posted ${postedToday} today`);
  process.exit(0);
}

const prs = JSON.parse(gh('pr', 'list', '--state', 'open', '--label', 'daily-reel', '--json', 'number,headRefName,labels,createdAt') || '[]')
  .filter((p) => p.headRefName?.startsWith('reel/'))
  .filter((p) => !(p.labels ?? []).some((l) => SKIP.has(l.name ?? l)))
  .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
if (!prs.length) {
  log('no review PRs eligible (none open, or all on hold / needs-attention)');
  process.exit(0);
}
// Oldest first. A PR that can't be merged (e.g. a conflict) is flagged
// needs-attention for a human and skipped, so it never blocks later reels.
// A Friday / seasonal post belongs to its day. If its day has passed (e.g. the
// slot was missed), don't post it late: flag it for a person and move on.
const git = (...args) => execFileSync('git', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
const occasionOf = (p) => {
  try {
    const id = p.headRefName.replace(/^reel\//, '');
    git('fetch', '--quiet', '--depth', '1', 'origin', p.headRefName);
    return JSON.parse(git('show', `FETCH_HEAD:./src/content/reels/${id}.json`)).publish?.occasion ?? null;
  } catch {
    return null; // can't read it: don't block on this check
  }
};
const today = occasionsOn(nowDate, process.env.DEEN_TZ || 'Asia/Kolkata');
const flag = (number, why) => {
  try {
    gh('label', 'create', 'needs-attention', '--color', 'FFC66D', '--description', 'Waits for a person: QA warning or editor flag', '--force');
    gh('pr', 'edit', String(number), '--add-label', 'needs-attention');
    gh('pr', 'comment', String(number), '--body', why);
  } catch {}
};

const tryMerge = (number) => {
  for (const method of ['--merge', '--squash', '--rebase']) {
    try {
      gh('pr', 'merge', String(number), method);
      return {ok: true};
    } catch (e) {
      const msg = String(e.stderr || e.message).trim();
      if (!/not allowed|merge method/i.test(msg)) return {ok: false, why: msg.split('\n').filter(Boolean).pop() || 'merge failed'};
    }
  }
  return {ok: false, why: 'no merge method is allowed on this repository'};
};
let pr = null;
for (const p of prs) {
  const occasion = occasionOf(p);
  if (occasion && !today.has(occasion)) {
    log(`PR #${p.number} is a "${occasion}" post and today isn't one; flagged instead of posting it late`);
    flag(p.number, `⏸️ Not auto-approved: this is a **${occasion}** post and its day has passed (${now.date}). Posting it now would be out of place, so it waits for you. Close it (it isn't lost — the draft stays in the queue history), or merge it yourself if you still want it out.`);
    continue;
  }
  const res = tryMerge(p.number);
  if (res.ok) {
    pr = p;
    break;
  }
  log(`couldn't merge PR #${p.number}: ${res.why}`);
  flag(p.number, `⚠️ Auto-approve couldn't merge this PR (${res.why}). It now waits for you; the next reel is approved instead.`);
}
if (!pr) {
  log('no PR could be merged');
  process.exit(0);
}
try {
  gh('pr', 'comment', String(pr.number), '--body', `🤖 Auto-approved at ${now.time} (fully automated mode). To stop a future reel, close its PR or add the \`hold\` label before ${POST_TIME}.`);
} catch {}
log(`merged PR #${pr.number} (${pr.headRefName})`);
console.log(pr.number);
