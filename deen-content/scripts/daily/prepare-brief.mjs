#!/usr/bin/env node
// Subscription mode, step 1: plan today's reel and write the complete writing
// brief for the Claude Code GitHub Action (which runs on a Claude Pro/Max
// subscription via CLAUDE_CODE_OAUTH_TOKEN — no API billing).
//   node scripts/daily/prepare-brief.mjs [--topic "..."] [--format <id>] [--pillar A-F]
// Writes output/daily/brief.md (what Claude Code reads) and output/daily/plan.json.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, ensureDir} from '../lib.mjs';
import {briefText, criticText, makePlan, systemText} from './writer-core.mjs';

const args = process.argv.slice(2);
const opt = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const {plan, format} = makePlan({topic: opt('topic'), angle: opt('angle'), format: opt('format'), pillar: opt('pillar')});
const dir = path.join(ROOT, 'output', 'daily');
ensureDir(dir);
for (const f of ['draft.json', 'review.json']) fs.rmSync(path.join(dir, f), {force: true});

const P = 'deen-content';
const md = `# Today's reel — instructions for Claude Code

You are running inside a GitHub Actions job for the "Daily Deen Reminders" Instagram page.
Write ONE reel for today. The working directory is the repository root; the project is in \`${P}/\`.

## Steps (follow exactly)
1. Read this whole file: the role and brand brief, the render schema, the hard layout limits, the example reel, and today's assignment at the end.
2. Write your draft as JSON to \`${P}/output/daily/draft.json\` — the ReelConfig fields except id, version, status, fps, width, height and audio.
3. Check it: \`node ${P}/scripts/daily/finalize-draft.mjs ${P}/output/daily/draft.json --check\`
   It prints \`OK\` or a list of errors (a ref outside the approved collections, an excerpt that isn't verbatim, words attributed to Allah or the Prophet ﷺ outside a source scene, copy too long for a layout slot, too similar to an earlier reel…). Fix every error in draft.json and re-run until it prints \`OK\`. Rewrite for meaning when shortening; don't truncate.
4. Then act as the demanding editor described in "Editor rubric" below. Be honest. If your verdict is "revise", improve the draft and repeat step 3 (at most 2 editorial rounds).
5. Write your final editor verdict (the JSON described in the rubric) to \`${P}/output/daily/review.json\`.
6. Stop. Do not render, commit, push, open PRs, or edit any other file — the workflow does the rest.
Do not use web search for religious content: every quote must come from the source tools above (sources/sources.json lists the only allowed datasets).
---

${systemText()}

---

## Today's assignment

${briefText(plan, format)}

---

## Editor rubric

${criticText(plan.history, '(your draft from draft.json)')}
`;

fs.writeFileSync(path.join(dir, 'brief.md'), md);
fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({...plan, history: undefined}, null, 2));
console.log(`Brief ready: [${plan.pillarName}] ${plan.topic ?? '(writer proposes a topic)'} — ${format.name}${plan.research ? ' — research' : ''}`);
console.log(`output/daily/brief.md (${Math.round(md.length / 1024)} KB)`);
