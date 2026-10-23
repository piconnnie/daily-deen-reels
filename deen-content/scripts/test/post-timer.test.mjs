#!/usr/bin/env node
// Unit tests for the post timer's decisions (scripts/daily/post-timer.mjs),
// including a replay of 23 Oct 2026, when GitHub's "hourly" schedule ran at
// 18:49 IST and then not again until after midnight, so the post never went out.
//   node scripts/test/post-timer.test.mjs
import {decide} from '../daily/post-timer.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
};
const ist = (s) => new Date(`${s}+05:30`);
const posted = (id, at) => ({id, approval: {status: 'approved'}, publish: {status: 'published', publishedAt: ist(at).toISOString()}});
const approved = (id) => ({id, approval: {status: 'approved', approvedAt: '2026-10-23T10:00:00Z'}, publish: {status: 'pending', attempts: 0}});
const pr = (number, labels = []) => ({number, headRefName: `reel/x-${number}`, labels: labels.map((name) => ({name}))});
const history = [posted('deen-001', '2026-10-21T17:35:53'), posted('deen-002', '2026-10-22T19:14:05')];

// The replay: PR #3 opened at 10:43 IST (the daily build was itself 4h41m late).
let r = decide({now: ist('2026-10-23T10:45:00'), states: history, prs: [pr(3)]});
check('After the 10:43 build: wait (8h15m to the slot is more than one job may run), then re-arm', r.action === 'wait-then-rearm' && r.waitSeconds === 340 * 60, `${r.action} ${r.waitSeconds}s`);
r = decide({now: ist('2026-10-23T16:25:00'), states: history, prs: [pr(3)]});
check('The re-armed timer at 16:25 waits until 19:00 and then publishes', r.action === 'wait-then-publish' && Math.abs(r.waitSeconds - (2 * 3600 + 35 * 60 + 30)) <= 1, `${r.action} ${r.waitSeconds}s`);
r = decide({now: ist('2026-10-23T18:49:00'), states: history, prs: [pr(3)]});
check('A run at 18:49 (the one that actually happened) now waits 11 min instead of giving up', r.action === 'wait-then-publish' && r.waitSeconds === 11 * 60 + 30, `${r.action} ${r.waitSeconds}s`);
r = decide({now: ist('2026-10-23T19:00:30'), states: history, prs: [pr(3)], trigger: 'workflow_dispatch'});
check('At/after the slot with a post waiting: publish now', r.action === 'publish-now');

// Idle cases.
r = decide({now: ist('2026-10-22T19:20:00'), states: history, prs: [pr(4)]});
check('Already posted today: idle (the next PR waits for tomorrow)', r.action === 'idle' && /already posted/.test(r.reason), r.reason);
r = decide({now: ist('2026-10-23T12:00:00'), states: history, prs: []});
check('Nothing waiting: idle', r.action === 'idle' && /no post/.test(r.reason), r.reason);
r = decide({now: ist('2026-10-23T12:00:00'), states: history, prs: [pr(3, ['hold']), pr(4, ['needs-attention'])]});
check('Only held / needs-attention PRs: idle', r.action === 'idle' && /hold or needs attention/.test(r.reason), r.reason);
r = decide({now: ist('2026-10-23T12:00:00'), states: history, prs: [pr(3)], autoApprove: false});
check('Auto-approve off and nothing approved: idle', r.action === 'idle' && /auto-approve is off/.test(r.reason), r.reason);
r = decide({now: ist('2026-10-23T12:00:00'), states: [...history, approved('deen-003')], prs: [], autoApprove: false});
check('Auto-approve off but you approved one: still waits for the slot', r.action === 'wait-then-rearm' || r.action === 'wait-then-publish', r.action);

// Loop guard: a publish run that has just finished after the slot.
r = decide({now: ist('2026-10-23T19:06:00'), states: [...history, {...approved('deen-003'), publish: {status: 'failed', attempts: 1}}], prs: [], trigger: 'DEEN · Approve & publish'});
check('After a publish run past the slot: idle (no retry loop on a failing post)', r.action === 'idle', r.reason);
r = decide({now: ist('2026-10-23T15:00:00'), states: history, prs: [pr(3)], trigger: 'DEEN · Approve & publish'});
check('After a publish run before the slot: keep timing', r.action !== 'idle', r.action);

// Edges.
r = decide({now: ist('2026-10-23T00:10:00'), states: history, prs: [pr(3)]});
check('Just after midnight with a carried-over PR: wait for tonight, never post early', r.action === 'wait-then-rearm', r.action);
r = decide({now: ist('2026-10-23T18:59:00'), states: history, prs: [pr(3)], maxWaitMin: 0});
check('MAX_WAIT 0 (tests): re-arm immediately', r.action === 'wait-then-rearm' && r.waitSeconds === 0, `${r.action} ${r.waitSeconds}`);
r = decide({now: ist('2026-10-23T20:30:00'), states: history, prs: [pr(3)], postTime: '21:00'});
check('A changed post time (21:00) is respected', r.action === 'wait-then-publish' && r.waitSeconds === 30 * 60 + 30, `${r.action} ${r.waitSeconds}`);
r = decide({now: new Date('2026-10-23T13:35:00Z'), states: history, prs: [pr(3)], tz: 'Europe/London', postTime: '19:00'});
check('Another time zone works (London 14:35 → wait to 19:00)', r.action === 'wait-then-publish' && r.waitSeconds === 4 * 3600 + 25 * 60 + 30, `${r.action} ${r.waitSeconds}`);
r = decide({now: ist('2026-10-23T19:30:00'), states: history, prs: [pr(3)], maxPerDay: 2});
check('DEEN_MAX_PER_DAY counts only today', r.action === 'publish-now', r.action);

console.log(failures ? `\n${failures} post-timer check(s) failed` : '\nAll post-timer checks passed');
process.exit(failures ? 1 : 0);
