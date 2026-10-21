#!/usr/bin/env node
// API writer mode (needs ANTHROPIC_API_KEY): plans a topic, asks Claude to
// write the reel, then loops deterministic validation + an editor pass →
// revision, up to MAX_ROUNDS. Prints the new reel id on the last stdout line.
//   node scripts/daily/write-reel.mjs [--topic "..."] [--format <id>] [--pillar A-F] [--dry-plan]
// Without an API key, use subscription mode (Claude Code GitHub Action) or the
// queue (dequeue.mjs) instead — see AUTOMATION.md.
import {DEFAULT_MODEL, ask, estimateCost, parseJsonObject} from './claude.mjs';
import {briefText, criticText, isoDate, makePlan, normalizeDraft, systemText, validateReel, writeLog} from './writer-core.mjs';
import {ensureDatasets} from '../sources/sources.mjs';

const sourceProblems = await ensureDatasets();
if (sourceProblems.length) {
  console.error(`Verified source datasets unavailable:\n- ${sourceProblems.join('\n- ')}`);
  process.exit(1);
}

const MAX_ROUNDS = Number(process.env.DEEN_MAX_ROUNDS ?? 3);
const args = process.argv.slice(2);
const opt = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const {plan, format} = makePlan({topic: opt('topic'), angle: opt('angle'), format: opt('format'), pillar: opt('pillar')});
console.log(`Plan: [${plan.pillarName}] ${plan.topic ?? '(writer proposes a topic)'} — format ${format.name}${plan.research ? ' — research on' : ''}`);
if (args.includes('--dry-plan')) process.exit(0);

const system = [{type: 'text', text: systemText(), cache_control: {type: 'ephemeral'}}];
const usageTotal = {input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, web_search_requests: 0};
const addUsage = (u) => Object.keys(usageTotal).forEach((k) => (usageTotal[k] += u?.[k] ?? 0));

const critique = async (reel) => {
  const res = await ask({system, effort: 'medium', maxTokens: 8000, messages: [{role: 'user', content: criticText(plan.history, JSON.stringify(reel))}]});
  return {...parseJsonObject(res.text), usage: res.usage};
};

const messages = [{role: 'user', content: briefText(plan, format)}];
const first = await ask({system, messages, webSearch: plan.research, maxSearches: 8, maxTokens: 32000, effort: 'high'});
addUsage(first.usage);
let rawText = first.text;
let reel;
let reelId = null;
let lastErrors = [];
let lastCritic = null;
const rounds = [];

for (let round = 1; round <= MAX_ROUNDS + 1; round++) {
  let parseError = null;
  try {
    reel = normalizeDraft(parseJsonObject(rawText), plan, {reelId, source: `api:${DEFAULT_MODEL}`});
    reelId = reel.id;
  } catch (e) {
    parseError = `Output was not valid JSON: ${e.message}`;
  }
  lastErrors = parseError ? [parseError] : validateReel(reel, plan.history);
  lastCritic = null;
  if (!lastErrors.length) {
    lastCritic = await critique(reel);
    addUsage(lastCritic.usage);
  }
  const criticIssues = lastCritic && lastCritic.verdict !== 'pass' ? lastCritic.mustFix ?? [] : [];
  rounds.push({round, errors: lastErrors, critic: lastCritic && {scores: lastCritic.scores, verdict: lastCritic.verdict, mustFix: lastCritic.mustFix}});
  console.log(`Round ${round}: ${lastErrors.length} validation error(s); critic ${lastCritic ? `${lastCritic.verdict} ${JSON.stringify(lastCritic.scores)}` : 'skipped'}`);
  if (!lastErrors.length && (!lastCritic || lastCritic.verdict === 'pass')) break;
  if (round > MAX_ROUNDS) break;

  messages.push({role: 'assistant', content: rawText});
  messages.push({
    role: 'user',
    content: `Revise the reel and return the complete corrected JSON object only.
${lastErrors.length ? `Validator errors (all must be fixed; these are hard limits):\n${lastErrors.map((e) => `- ${e}`).join('\n')}` : ''}
${criticIssues.length ? `Editor's must-fix notes:\n${criticIssues.map((e) => `- ${e}`).join('\n')}` : ''}
${lastCritic?.niceToHave?.length ? `Optional improvements:\n${lastCritic.niceToHave.map((e) => `- ${e}`).join('\n')}` : ''}
Keep everything that already works. When shortening copy, rewrite for meaning rather than truncating.`,
  });
  const next = await ask({system, messages, maxTokens: 32000, effort: 'high'});
  addUsage(next.usage);
  rawText = next.text;
}

const log = {
  date: isoDate(),
  writer: `api:${DEFAULT_MODEL}`,
  plan: {...plan, history: undefined},
  reelId: reel?.id ?? null,
  rounds,
  finalCritic: lastCritic && {scores: lastCritic.scores, verdict: lastCritic.verdict, mustFix: lastCritic.mustFix, niceToHave: lastCritic.niceToHave},
  needsAttention: !!lastCritic && lastCritic.verdict !== 'pass',
  searchSources: first.sources,
  usage: usageTotal,
  estimatedCostUsd: +estimateCost(usageTotal).toFixed(3),
};

if (lastErrors.length) {
  writeLog(`failed-${isoDate()}`, log);
  console.error(`Writer could not produce a valid reel after ${rounds.length} round(s):\n${lastErrors.join('\n')}`);
  process.exit(1);
}
writeLog(reel.id, log);
console.log(`Writer cost ≈ $${log.estimatedCostUsd} (${usageTotal.input_tokens} in / ${usageTotal.output_tokens} out tokens, ${usageTotal.web_search_requests} searches)`);
console.log(reel.id);

