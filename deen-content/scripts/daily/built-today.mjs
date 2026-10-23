#!/usr/bin/env node
// Has today's post already been built? The daily build has several backstop
// schedules (GitHub runs them late or not at all), so whichever fires first
// builds today's post and the rest skip. "Today" is the local date in DEEN_TZ.
//   node scripts/daily/built-today.mjs   → prints "yes <PR>" or "no"; writes built=true|false to $GITHUB_OUTPUT
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {localClock} from './post-timer.mjs';

export function builtToday(prs, now, tz) {
  const today = localClock(now, tz).date;
  return prs.find((p) => p.createdAt && localClock(new Date(p.createdAt), tz).date === today) ?? null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tz = process.env.DEEN_TZ || 'Asia/Kolkata';
  const now = process.env.DEEN_NOW ? new Date(process.env.DEEN_NOW) : new Date();
  const prs = JSON.parse(execFileSync('gh', ['pr', 'list', '--label', 'daily-reel', '--state', 'all', '--limit', '30', '--json', 'number,createdAt,headRefName'], {encoding: 'utf8'}) || '[]');
  const hit = builtToday(prs, now, tz);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `built=${hit ? 'true' : 'false'}\n`);
  console.error(hit ? `built-today: yes — PR #${hit.number} (${hit.headRefName}) was opened today (${tz})` : `built-today: no post built yet today (${tz})`);
  console.log(hit ? `yes ${hit.number}` : 'no');
}
