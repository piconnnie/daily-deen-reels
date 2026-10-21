// Shared pieces of the daily writer, used by every writer mode:
//   - API mode           scripts/daily/write-reel.mjs (Claude API key)
//   - Subscription mode  prepare-brief.mjs → Claude Code GitHub Action → finalize-draft.mjs
//   - Queue mode         dequeue.mjs (pre-written drafts in data/queue, no model at all)
// The brief, editor rubric, normalisation and validation are identical in all three.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, ensureDir, reelPath} from '../lib.mjs';
import {limitsForPrompt} from '../content-limits.mjs';
import {syncRegistry} from '../sync-registry.mjs';
import {pickStyle} from '../style.mjs';
import {PILLARS, history, nextReelNumber, planNext} from './plan.mjs';
import {applySources} from '../sources/sources.mjs';

export const isoDate = (d = new Date()) => d.toISOString().slice(0, 10);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
export const loadFormats = () => JSON.parse(read('src/templates/formats.json'));

/** Plan today's reel, applying optional overrides ({topic, angle, format, pillar}). */
export function makePlan(overrides = {}, today = new Date()) {
  const plan = planNext({today});
  if (overrides.topic) Object.assign(plan, {topic: overrides.topic, angle: overrides.angle ?? null, backlogId: null, research: !!overrides.research});
  if (overrides.format) plan.format = overrides.format;
  if (overrides.pillar) {
    const k = overrides.pillar.toUpperCase();
    Object.assign(plan, {pillar: k, pillarName: PILLARS[k]});
  }
  const format = loadFormats().find((f) => f.id === plan.format);
  if (!format) throw new Error(`Unknown format ${plan.format}`);
  return {plan, format};
}

export const avoidList = (hist) =>
  hist
    .slice(-40)
    .map((h) => `- ${h.id} [${h.pillar}/${h.format}] topic: ${h.topic} | hook: ${h.hook} | insight: ${h.insight}`)
    .join('\n');

export function systemText() {
  return `You are the writer and editor for the Instagram page "Daily Deen Reminders": short, sincere reminders from the Qur'an and authentic Sunnah that a Muslim can act on today. Each day you produce one complete reel as a JSON content file that a Remotion template renders directly. Nothing you write is post-edited, so the JSON must be correct, the copy must fit the layout, and every religious statement must come from a verified source.

<brand_and_quality_bar>
${read('CONTENT_SYSTEM.md')}
</brand_and_quality_bar>
Note: the codebase described above already exists. Your job is only the content file.

<render_contract>
The JSON must conform to this TypeScript schema (ReelConfig). Scene components exist only for these scene types: source, hook, cards, checklist, takeaway (table, comparison, diagram and terminal exist but rarely suit this page).
${read('src/content/schema.ts')}
</render_contract>

<source_rules>
These are the most important rules. The validator enforces them and fails the build otherwise.
- Quotes come ONLY from: the Qur'an (Arabic: King Fahd Complex Hafs text; English: Saheeh International), Sahih al-Bukhari and Sahih Muslim (sunnah.com numbering). Nothing else: no other hadith collections, no "Islamic quotes" from the web, no scholars' sayings, no weak or unsourced narrations.
- A source scene contains ONLY a ref, e.g. "quran:94:5-6" (max 3 consecutive ayat), "bukhari:6114", "muslim:2564c". Never type the verse or hadith text: the pipeline pulls it word for word from pinned datasets. You may add "excerpt" (a verbatim, contiguous part of the English text, ≥40 chars, that keeps the meaning) and "arabicExcerpt" (a verbatim part of the Arabic text; for hadith this is the only way Arabic is shown, because the full Arabic includes the chain of narrators).
- Find and read refs with: node deen-content/scripts/sources/cli.mjs search "<words>" [--in quran|bukhari|muslim]  and  node deen-content/scripts/sources/cli.mjs show <ref>. Read the whole text before choosing an excerpt, and never use an excerpt that changes the meaning of the full text.
- Your own words (hooks, reflections, checklists, takeaway, caption) must never put words in the mouth of Allah or the Prophet ﷺ ("Allah says…", "the Prophet said…"): that is what source scenes are for. Describe and reflect instead ("This ayah…", "In this hadith…"). Use ﷺ after the Prophet's name.
- Reminders, not rulings: no fatwas, no halal/haram verdicts, no fiqh positions, no sectarian or political content, no criticism of groups of Muslims. If a topic needs a scholar, it is not a topic for this page.
- claims: one entry of kind "source" (with its ref) for each quoted source, and entries of kind "reflection" for our own suggestions. No other kinds.
- Caption: write the opening, body and CTA only. The sources block (citation, translator, grade, link) is generated from the source scenes; don't add one. Text in quotation marks in the caption must be verbatim from a quoted source.
- No chain-message bait ("share or…", "type Ameen", "send to 10 people"), no fear-mongering, no promises of specific rewards that the quoted source doesn't state.
</source_rules>

<layout_limits>
Hard limits enforced by an automated validator (characters, counted literally). Exceeding any of them fails the build.
${limitsForPrompt()}
</layout_limits>

<timing_rules>
- 30 fps. Hook scene 75–90 frames and fully readable on frame 0. Give viewers ~0.35 s per word of on-screen copy plus 1 s; quote scenes need at least the frames the source limit above requires.
- Stage reveals with popStart/popStagger, itemStart/itemStagger, ctaAt and endCardAt (frames relative to the scene start). Leave ≥1.5 s after the final reveal of each scene.
- Reels are silent (no music, no sound effects): don't add sfx cues.
- transitionIn: "fade-up" by default.
</timing_rules>

<tone>
Warm, humble, practical. Speak to one person. No hype, no guilt-tripping, no clickbait. Use typographic apostrophes (’) in on-screen copy. Transliterations: Qur'an, du'a, Sunnah, sadaqah, dhikr.
</tone>

<example_of_a_complete_reel>
${read('src/content/reels/deen-001-hardship-is-never-alone.json')}
</example_of_a_complete_reel>`;
}

export function briefText(plan, format, date = isoDate()) {
  return `Write today's reel (${date}).

Pillar: ${plan.pillarName}
Format: ${format.name} — arc: ${format.arc}
Default scene plan for this format (adapt if needed; keep 4–6 scenes, at least one source scene, last = takeaway):
${format.scenes.map((s, i) => `  ${i + 1}. ${s.type} (~${s.seconds}s) — ${s.purpose}`).join('\n')}
${plan.topic ? `Topic: ${plan.topic}\nAngle to develop: ${plan.angle ?? '(choose the most practical angle)'}` : `Topic: none assigned. Propose an evergreen reminder for this pillar that is clearly different from everything listed below, and put it in brief.topic.`}
${plan.sources?.length ? `Suggested source refs (check each with the show command; use only what fits):\n${plan.sources.map((s) => `- ${s}`).join('\n')}` : 'Suggested source refs: none — find one with the search command.'}

Objective: saves and shares from Muslims who want one authentic, usable reminder a day. "Useful" means one small, concrete thing someone can do or think about today.

Already published or planned — do NOT repeat these topics, sources, hooks or core insights:
${avoidList(plan.history) || '(none yet)'}

Requirements:
- Three genuinely different hook options, honestly scored 1–5 on specificity, relevance, curiosity, credibility, comprehension; choose the best; explain why.
- One core insight a viewer could repeat in one sentence.
- One primary CTA, identical in primaryCta.text and the takeaway scene cta; caption ends with that same CTA in caption.cta. Prefer "save" for du'as and checklists, "share" for reminders people send to someone who needs them.
- Caption: specific first line, readable line breaks (\\n), 3–6 relevant hashtags, under 1,200 characters (the sources block is added after it).
- Fill storyboard, onScreen and purpose for every scene. Fill publish.suggestedDate (today or tomorrow).
- Set brief.format to "${plan.format}", brief.pillar to "${plan.pillarName}", brief.voiceover false, brief.research "not-required".

Return ONLY the JSON object (no prose, no code fences). Omit id, version, status, fps, width, height and audio — the pipeline sets those.`;
}

export function criticText(hist, reelJson) {
  return `Act as a careful editor for this page. Review the draft reel below against the brand brief and the source rules. Judge it as a knowledgeable, sincere Muslim viewer would.

Score 1–5: hook (clear in 2 s, relevant, not clickbait), insight (useful, one idea, actionable today), accuracy (refs fit the point being made; excerpts keep the meaning; nothing attributed to Allah or the Prophet ﷺ in our own words; no rulings), intrigue (would someone save or send it?), clarity (each scene readable, logical flow), brandFit (warm, humble, no hype, no guilt-tripping).
List mustFix items only for real problems (a ref that doesn't support the point, an excerpt that changes the meaning, a ruling, a fabricated claim, a confusing step, filler). Be concrete: name the scene and the fix.

Previously published (novelty check):
${avoidList(hist) || '(none)'}

Draft:
${reelJson}

Return ONLY JSON: {"scores":{"hook":n,"insight":n,"accuracy":n,"intrigue":n,"clarity":n,"brandFit":n},"verdict":"pass"|"revise","mustFix":["..."],"niceToHave":["..."]}. verdict is "pass" only if every score ≥ 4 and mustFix is empty.`;
}

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-');

/**
 * Turns a model- or human-written draft into a complete ReelConfig, pulling
 * every quote's exact text from the pinned datasets (writers give refs only).
 * Source problems are carried to validateReel. Call ensureDatasets() first.
 */
export function normalizeDraft(draft, plan, opts = {}) {
  const reel = buildReel(draft, plan, opts);
  try {
    applySources(reel);
  } catch (e) {
    Object.defineProperty(reel, 'sourceErrors', {value: e.message.split('\n'), enumerable: false});
  }
  return reel;
}

function buildReel(draft, plan, {reelId = null, source = 'unknown', date = isoDate()} = {}) {
  const coverWords = (draft.cover?.headline ?? []).map((l) => l.text).join(' ');
  const id = reelId ?? `deen-${String(nextReelNumber()).padStart(3, '0')}-${slugify(coverWords || draft.brief?.topic || 'reel')}`;
  return {
    id,
    version: 1,
    status: 'draft',
    ...draft,
    brief: {
      ...draft.brief,
      backlogId: plan.backlogId ?? draft.brief?.backlogId ?? null,
      queueId: draft.brief?.queueId ?? null,
      writer: source,
      pillar: plan.pillarName ?? draft.brief?.pillar,
      format: plan.format ?? draft.brief?.format,
      voiceover: false,
      research: plan.research ? 'required' : draft.brief?.research ?? 'not-required',
      constraints: draft.brief?.constraints ?? [],
    },
    fps: 30,
    width: 1080,
    height: 1920,
    style: pickStyle(id, draft.style),
    audio: {bed: `audio/${id}-bed.wav`, bedVolume: 1, voiceover: null, voiceoverVolume: 1},
    claims: draft.claims ?? [],
    publish: {suggestedDate: draft.publish?.suggestedDate ?? date, notes: draft.publish?.notes ?? ''},
  };
}

const words = (s) => new Set((s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3));
const jaccard = (a, b) => {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
};

/**
 * Structural + novelty checks, then writes the reel file and runs the
 * pre-render validator (copy limits, safe-zone layout). Returns error strings.
 * On errors the reel file is removed again.
 */
export function validateReel(reel, hist) {
  if (reel.sourceErrors?.length) return reel.sourceErrors.map((e) => `source reference: ${e}`);
  const errors = [];
  if (!Array.isArray(reel.scenes) || reel.scenes.length < 3) errors.push('scenes: need at least 3 scenes');
  if (!Array.isArray(reel.hooks) || reel.hooks.length !== 3) errors.push('hooks: need exactly 3 options');
  if (!(reel.selectedHook >= 0 && reel.selectedHook < (reel.hooks?.length ?? 0))) errors.push('selectedHook out of range');
  for (const h of hist) {
    if (h.id === reel.id) continue;
    if (jaccard(reel.coreInsight, h.insight) > 0.55 || jaccard(reel.hooks?.[reel.selectedHook]?.text, h.hook) > 0.6) {
      errors.push(`too similar to ${h.id} ("${h.hook}") — choose a different angle`);
    }
  }
  if (errors.length) return errors;
  fs.writeFileSync(reelPath(reel.id), JSON.stringify(reel, null, 2) + '\n');
  syncRegistry();
  const r = spawnSync('node', ['scripts/validate-content.mjs', reel.id, '--pre-render', '--json'], {cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  const line = r.stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop();
  const out = line
    ? JSON.parse(line).checks.filter((c) => !c.pass && c.severity === 'error').map((c) => `${c.name}: ${c.detail}`)
    : [`validator crashed: ${(r.stderr || r.stdout).slice(-600)}`];
  if (out.length) {
    fs.unlinkSync(reelPath(reel.id));
    syncRegistry();
  }
  return out;
}

export function writeLog(reelId, log) {
  ensureDir(path.join(ROOT, 'output', 'daily'));
  fs.writeFileSync(path.join(ROOT, 'output', 'daily', `${reelId}.writer.json`), JSON.stringify(log, null, 2));
}

export {history};
