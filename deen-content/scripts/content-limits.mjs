// Copy-length and structure limits derived from the reel layout (1080×1920,
// safe zone 834 px wide). Shared by the validator and the daily writer prompt,
// so generated copy is checked against the same rules it was asked to follow.

export const LIMITS = {
  hook: {lineChars: 13, lines: [2, 5], sub: 34, kicker: 26},
  headline: {lineChars: 22, lines: [1, 2]},
  kicker: 26,
  cards: {count: [2, 5], text: 30, tag: 18},
  table: {rows: [2, 3], input: 30, chip: 22, notes: [0, 2], note: 38},
  comparison: {label: 26, value: 9, caption: 28, conclusionLineChars: 22},
  checklist: {items: [3, 5], item: 52, rule: 70},
  diagram: {nodes: [3, 5], label: 18, detail: 14, callout: 70},
  terminal: {lines: [2, 7], line: 32, title: 20},
  takeaway: {lineChars: 15, lines: [2, 3], cta: 38},
  cover: {lineChars: 14, lines: [2, 4]},
  // Quotes need reading time: at least base + perChar frames for the English shown.
  source: {english: 260, arabic: 220, excerptMin: 40, baseFrames: 75, perChar: 1.5, maxFrames: 1500},
  scene: {minFrames: 45, maxFrames: 330},
  totalSec: [15, 60],
};

const len = (s) => [...(s ?? '')].length;

/** The English / Arabic a source scene puts on screen (mirrors src/scenes/SourceScene.tsx). */
export const sourceDisplay = (s) => {
  const r = s.resolved;
  if (!r) return {english: '', arabic: ''};
  let english = r.english;
  if (s.excerpt) {
    const e = s.excerpt.trim().replace(/^…\s*|\s*…$/g, '');
    english = `${r.english.startsWith(e) ? '' : '…'}${e}${r.english.endsWith(e) ? '' : '…'}`;
  }
  const arabic = s.arabicExcerpt ? s.arabicExcerpt.trim() : (s.showArabic ?? r.kind === 'quran') && r.kind === 'quran' ? r.arabic : '';
  return {english, arabic};
};

/** Returns a list of human-readable problems ("" when fine). */
export function checkLimits(reel) {
  const L = LIMITS;
  const out = [];
  const lineCheck = (where, lines, max, range) => {
    if (!Array.isArray(lines)) return out.push(`${where}: missing lines`);
    if (range && (lines.length < range[0] || lines.length > range[1])) out.push(`${where}: ${lines.length} lines (allowed ${range[0]}–${range[1]})`);
    lines.forEach((l, i) => len(l.text) > max && out.push(`${where} line ${i + 1} "${l.text}" is ${len(l.text)} chars (max ${max})`));
  };
  const str = (where, s, max) => len(s) > max && out.push(`${where} "${s}" is ${len(s)} chars (max ${max})`);
  const count = (where, arr, [lo, hi]) => (!Array.isArray(arr) || arr.length < lo || arr.length > hi) && out.push(`${where}: ${arr?.length ?? 0} items (allowed ${lo}–${hi})`);

  reel.scenes.forEach((s, i) => {
    const w = `scene ${i + 1} (${s.id}, ${s.type})`;
    const maxFrames = s.type === 'source' ? L.source.maxFrames : L.scene.maxFrames;
    if (s.durationInFrames < L.scene.minFrames || s.durationInFrames > maxFrames) out.push(`${w}: duration ${s.durationInFrames} frames (allowed ${L.scene.minFrames}–${maxFrames})`);
    if (s.kicker) str(`${w} kicker`, s.kicker, L.kicker);
    if (s.headline) lineCheck(`${w} headline`, s.headline, L.headline.lineChars, L.headline.lines);
    for (const cue of s.sfx ?? []) if (cue.at < 0 || cue.at >= s.durationInFrames) out.push(`${w}: sfx at frame ${cue.at} is outside the scene`);
    switch (s.type) {
      case 'source': {
        if (!s.ref) {
          out.push(`${w}: missing ref`);
          break;
        }
        if (!s.resolved) {
          out.push(`${w}: source text not resolved yet (run scripts/sources/cli.mjs apply)`);
          break;
        }
        const d = sourceDisplay(s);
        str(`${w} English on screen`, d.english, L.source.english);
        if (d.arabic) str(`${w} Arabic on screen`, d.arabic, L.source.arabic);
        if (s.excerpt && len(s.excerpt) < L.source.excerptMin) out.push(`${w}: excerpt is too short to keep its meaning (min ${L.source.excerptMin} chars)`);
        const need = Math.ceil(L.source.baseFrames + L.source.perChar * len(d.english));
        if (s.durationInFrames < need) out.push(`${w}: ${s.durationInFrames} frames is too short to read ${len(d.english)} chars of quote (needs ≥${need})`);
        break;
      }
      case 'hook':
        lineCheck(`${w} hook`, s.lines, L.hook.lineChars, L.hook.lines);
        if (s.sub) str(`${w} sub`, s.sub, L.hook.sub);
        break;
      case 'cards':
        count(`${w} cards`, s.cards, L.cards.count);
        (s.cards ?? []).forEach((c, j) => {
          str(`${w} card ${j + 1}`, c.text, L.cards.text);
          if (c.tag) str(`${w} card ${j + 1} tag`, c.tag, L.cards.tag);
          if (c.swap) {
            str(`${w} card ${j + 1} swap`, c.swap.text, L.cards.text);
            str(`${w} card ${j + 1} swap tag`, c.swap.tag, L.cards.tag);
          }
        });
        break;
      case 'table':
        count(`${w} rows`, s.rows, L.table.rows);
        count(`${w} notes`, s.notes, L.table.notes);
        (s.rows ?? []).forEach((r, j) => {
          str(`${w} row ${j + 1} input`, r.input, L.table.input);
          str(`${w} row ${j + 1} expected`, r.expected, L.table.chip);
          str(`${w} row ${j + 1} passIf`, r.passIf, L.table.chip);
        });
        (s.notes ?? []).forEach((n, j) => str(`${w} note ${j + 1}`, n, L.table.note));
        break;
      case 'comparison':
        for (const side of ['left', 'right']) {
          const m = s[side] ?? {};
          str(`${w} ${side} label`, m.label, L.comparison.label);
          str(`${w} ${side} value`, m.value, L.comparison.value);
          str(`${w} ${side} caption`, m.caption, L.comparison.caption);
          if (typeof m.ratio !== 'number' || m.ratio < 0 || m.ratio > 1) out.push(`${w} ${side} ratio must be 0–1`);
        }
        lineCheck(`${w} conclusion`, s.conclusion, L.comparison.conclusionLineChars, [1, 2]);
        break;
      case 'checklist':
        count(`${w} items`, s.items, L.checklist.items);
        (s.items ?? []).forEach((it, j) => str(`${w} item ${j + 1}`, it, L.checklist.item));
        if (s.rule) str(`${w} rule`, s.rule, L.checklist.rule);
        break;
      case 'diagram':
        count(`${w} nodes`, s.nodes, L.diagram.nodes);
        (s.nodes ?? []).forEach((n, j) => {
          str(`${w} node ${j + 1}`, n.label, L.diagram.label);
          if (n.detail) str(`${w} node ${j + 1} detail`, n.detail, L.diagram.detail);
        });
        if (s.callout) str(`${w} callout`, s.callout.text, L.diagram.callout);
        break;
      case 'terminal':
        count(`${w} lines`, s.lines, L.terminal.lines);
        (s.lines ?? []).forEach((l, j) => str(`${w} line ${j + 1}`, l.text, L.terminal.line));
        str(`${w} title`, s.title, L.terminal.title);
        break;
      case 'takeaway':
        lineCheck(`${w} takeaway`, s.lines, L.takeaway.lineChars, L.takeaway.lines);
        str(`${w} cta`, s.cta, L.takeaway.cta);
        break;
      default:
        out.push(`${w}: unknown scene type "${s.type}"`);
    }
  });
  lineCheck('cover headline', reel.cover?.headline, L.cover.lineChars, L.cover.lines);
  if (reel.scenes.at(-1)?.type !== 'takeaway') out.push('last scene must be a takeaway scene');
  return out;
}

/** Markdown table of the limits, injected into the writer prompt. */
export function limitsForPrompt() {
  const L = LIMITS;
  return [
    `- source: give only ref (+ optional verbatim excerpt / arabicExcerpt); English shown ≤${L.source.english} chars, Arabic shown ≤${L.source.arabic}; duration ≥ ${L.source.baseFrames} + ${L.source.perChar} × English chars, ≤${L.source.maxFrames} frames`,
    `- hook: ${L.hook.lines[0]}–${L.hook.lines[1]} lines, ≤${L.hook.lineChars} chars per line (112 px type); sub ≤${L.hook.sub} chars`,
    `- kicker (all scenes): ≤${L.kicker} chars, UPPERCASE`,
    `- headline (cards/table/checklist/diagram/terminal): ${L.headline.lines[0]}–${L.headline.lines[1]} lines, ≤${L.headline.lineChars} chars per line`,
    `- cards: ${L.cards.count[0]}–${L.cards.count[1]} cards; text ≤${L.cards.text} chars; tag ≤${L.cards.tag} chars UPPERCASE`,
    `- table: ${L.table.rows[0]}–${L.table.rows[1]} rows; input ≤${L.table.input}; expected/passIf ≤${L.table.chip}; ≤${L.table.notes[1]} notes of ≤${L.table.note} chars`,
    `- comparison: label ≤${L.comparison.label}; value ≤${L.comparison.value} (e.g. "31 / 50"); caption ≤${L.comparison.caption}; ratio 0–1; conclusion 1–2 lines ≤${L.comparison.conclusionLineChars}`,
    `- checklist: ${L.checklist.items[0]}–${L.checklist.items[1]} items ≤${L.checklist.item} chars; rule ≤${L.checklist.rule}`,
    `- diagram: ${L.diagram.nodes[0]}–${L.diagram.nodes[1]} nodes; label ≤${L.diagram.label}; detail ≤${L.diagram.detail}; callout ≤${L.diagram.callout}`,
    `- terminal: ${L.terminal.lines[0]}–${L.terminal.lines[1]} lines ≤${L.terminal.line} chars; title ≤${L.terminal.title}`,
    `- takeaway: ${L.takeaway.lines[0]}–${L.takeaway.lines[1]} lines ≤${L.takeaway.lineChars} chars; cta ≤${L.takeaway.cta}`,
    `- cover headline: ${L.cover.lines[0]}–${L.cover.lines[1]} lines ≤${L.cover.lineChars} chars, 3–7 words total`,
    `- every non-source scene ${L.scene.minFrames}–${L.scene.maxFrames} frames at 30 fps; whole reel ${L.totalSec[0]}–${L.totalSec[1]} s; last scene is takeaway`,
  ].join('\n');
}
