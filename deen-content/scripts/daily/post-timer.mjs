#!/usr/bin/env node
// The post timer: makes the daily post go out at DEEN_POST_TIME even though
// GitHub's scheduled (cron) runs are often hours late or skipped.
//
// It runs as its own workflow (deen-post-timer.yml), started when the daily
// build or a publish run finishes, by hand, or by backstop schedules. It decides:
//   idle               nothing to post today (already posted, nothing waiting,
//                      or every waiting PR is on hold / needs attention)
//   publish-now        the slot has passed and a post is waiting → start the
//                      publish workflow right away
//   wait-then-publish  the slot is within the next MAX_WAIT minutes → sleep
//                      until the slot, then start the publish workflow
//   wait-then-rearm    the slot is further away → sleep MAX_WAIT, then start a
//                      fresh timer (a job can run at most 6 hours)
// The publish workflow makes the real decision again when it runs, so a timer
// that fires late or twice can never post twice or post something unapproved.
//
//   node scripts/daily/post-timer.mjs            (in Actions: writes action/wait_seconds to $GITHUB_OUTPUT)
// Env: DEEN_POST_TIME (19:00), DEEN_TZ (Asia/Kolkata), DEEN_MAX_PER_DAY (1),
//      DEEN_AUTO_APPROVE (true), DEEN_TIMER_MAX_WAIT_MIN (340), TIMER_TRIGGER
//      (what started this run), DEEN_NOW (ISO time, tests only).
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {loadStates} from './publish-due.mjs';

const SKIP = new Set(['needs-attention', 'hold']);

/** Local date/time parts in a time zone, plus the UTC instant of a local HH:MM today. */
export function localClock(now, tz) {
  const f = new Intl.DateTimeFormat('en-CA', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false});
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  const hh = p.hour === '24' ? '00' : p.hour;
  return {date: `${p.year}-${p.month}-${p.day}`, time: `${hh}:${p.minute}`, seconds: Number(hh) * 3600 + Number(p.minute) * 60 + Number(p.second)};
}

const toSeconds = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) throw new Error(`DEEN_POST_TIME must be HH:MM, got "${hhmm}"`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
};

/**
 * Pure decision. states = archive/*\/state.json, prs = open daily-reel PRs
 * ({labels:[{name}]}). Returns {action, waitSeconds, reason}.
 */
export function decide({now, states, prs, postTime = '19:00', tz = 'Asia/Kolkata', maxPerDay = 1, autoApprove = true, maxWaitMin = 340, trigger = ''}) {
  const clock = localClock(now, tz);
  const postedToday = states.filter((s) => s.publish?.status === 'published' && s.publish.publishedAt && localClock(new Date(s.publish.publishedAt), tz).date === clock.date).length;
  if (postedToday >= maxPerDay) return {action: 'idle', waitSeconds: 0, reason: `already posted ${postedToday} today (${clock.date})`};

  const approvedWaiting = states.filter((s) => s.approval?.status === 'approved' && ['pending', 'failed'].includes(s.publish?.status ?? 'pending') && (s.publish?.attempts ?? 0) < 3);
  const eligiblePrs = autoApprove ? prs.filter((p) => !(p.labels ?? []).some((l) => SKIP.has(l.name ?? l))) : [];
  if (!approvedWaiting.length && !eligiblePrs.length) {
    const why = prs.length && autoApprove ? 'every waiting PR is on hold or needs attention' : prs.length ? 'auto-approve is off and nothing is approved yet' : 'no post is waiting';
    return {action: 'idle', waitSeconds: 0, reason: why};
  }
  const what = approvedWaiting.length ? `${approvedWaiting[0].id} (approved)` : `PR #${eligiblePrs[0].number ?? '?'} (will be auto-approved)`;

  const until = toSeconds(postTime) - clock.seconds;
  if (until <= 0) {
    // A publish run that has just finished after the slot already had its
    // chance; starting another one here would only loop on a failing post.
    if (/publish/i.test(trigger)) return {action: 'idle', waitSeconds: 0, reason: `the slot has passed and the publish run that just finished handled ${what}`};
    return {action: 'publish-now', waitSeconds: 0, reason: `slot ${postTime} has passed; ${what} is waiting`};
  }
  const maxWait = Math.max(0, Math.round(maxWaitMin * 60));
  if (until <= maxWait) return {action: 'wait-then-publish', waitSeconds: until + 30, reason: `${what} goes out at ${postTime} (in ${Math.round(until / 60)} min)`};
  return {action: 'wait-then-rearm', waitSeconds: maxWait, reason: `${what} goes out at ${postTime}; waiting ${Math.round(maxWait / 60)} min, then a fresh timer takes over`};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.env;
  const now = env.DEEN_NOW ? new Date(env.DEEN_NOW) : new Date();
  let prs = [];
  try {
    prs = JSON.parse(execFileSync('gh', ['pr', 'list', '--state', 'open', '--label', 'daily-reel', '--json', 'number,headRefName,labels'], {encoding: 'utf8'}) || '[]').filter((p) => p.headRefName?.startsWith('reel/'));
  } catch (e) {
    console.error(`post-timer: could not list PRs (${String(e.message).split('\n')[0]}); deciding from approved posts only`);
  }
  const res = decide({
    now,
    states: loadStates(),
    prs,
    postTime: env.DEEN_POST_TIME || '19:00',
    tz: env.DEEN_TZ || 'Asia/Kolkata',
    maxPerDay: Number(env.DEEN_MAX_PER_DAY || 1),
    autoApprove: String(env.DEEN_AUTO_APPROVE ?? 'true').toLowerCase() !== 'false',
    maxWaitMin: Number(env.DEEN_TIMER_MAX_WAIT_MIN || 340),
    trigger: env.TIMER_TRIGGER || '',
  });
  console.error(`post-timer: ${res.action} — ${res.reason}${res.waitSeconds ? ` (sleep ${res.waitSeconds}s)` : ''}`);
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `action=${res.action}\nwait_seconds=${res.waitSeconds}\nreason=${res.reason}\n`);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `### Post timer: ${res.action}\n${res.reason}\n`);
  console.log(res.action);
}
