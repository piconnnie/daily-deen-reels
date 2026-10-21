#!/usr/bin/env node
// Renders a reel MP4 + cover (PNG and Instagram-ready JPEG).
//   node scripts/render-content.mjs <reelId> [--engine remotion|local] [--skip-audio]
// Engine "remotion" (default when installed) uses the official Remotion CLI.
// Engine "local" uses scripts/local-render (Chromium + ffmpeg + API shim) for
// environments where Remotion can't be installed.
// Every MP4 is then conformed to Instagram's Reels spec: moov atom first,
// no edit lists, AAC 128 kbps / 48 kHz.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {OUT, ROOT, ensureDir, kindOf, loadReel, reelIdArg, saveReel, slideFiles} from './lib.mjs';
import {syncRegistry} from './sync-registry.mjs';

const id = reelIdArg();
const args = process.argv.slice(3);
const flag = (n) => args.includes(`--${n}`);
const val = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

syncRegistry();
const reel = loadReel(id);
const hasRemotion = fs.existsSync(path.join(ROOT, 'node_modules', '@remotion', 'cli'));
const engine = val('engine') ?? (hasRemotion ? 'remotion' : 'local');
if (engine === 'remotion' && !hasRemotion) {
  console.error('Remotion is not installed. Run `npm install`, or use --engine local.');
  process.exit(1);
}

const run = (cmd, cmdArgs) => {
  console.log(`$ ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, {cwd: ROOT, stdio: 'inherit'});
  if (r.status !== 0) {
    console.error(`Command failed (${r.status}).`);
    process.exit(r.status ?? 1);
  }
};

ensureDir(OUT.reels);
ensureDir(OUT.covers);

// Carousels and stories are stills: one image per scene, no audio.
if (kindOf(reel) !== 'reel') {
  const t0s = Date.now();
  const dir = path.join(OUT.slides, id);
  fs.rmSync(dir, {recursive: true, force: true});
  ensureDir(dir);
  if (engine === 'remotion') {
    reel.scenes.forEach((_, i) => run('npx', ['remotion', 'still', 'src/index.ts', `Slide-${id}-${i + 1}`, path.join(dir, `slide-${String(i + 1).padStart(2, '0')}.png`)]));
  } else {
    run('node', ['scripts/local-render/render.mjs', 'slides', id, dir]);
  }
  for (const png of slideFiles(id, 'png')) run('ffmpeg', ['-v', 'error', '-y', '-i', png, '-q:v', '2', '-pix_fmt', 'yuvj420p', png.replace(/\.png$/, '.jpg')]);
  const first = slideFiles(id, 'png')[0];
  fs.copyFileSync(first, path.join(OUT.covers, `${id}.png`));
  fs.copyFileSync(first.replace(/\.png$/, '.jpg'), path.join(OUT.covers, `${id}.jpg`));
  reel.status = 'rendered';
  saveReel(reel);
  console.log(`\nDone in ${((Date.now() - t0s) / 1000).toFixed(0)}s: ${slideFiles(id).length} ${kindOf(reel)} image(s) in output/slides/${id}/`);
  process.exit(0);
}

// 1. Audio bed (deterministic, local).
if (reel.audio.bed && !flag('skip-audio')) run('python3', ['scripts/synth-audio.py', id]);
const audioFile = reel.audio.bed ? path.join(ROOT, 'public', reel.audio.bed) : null;
if (audioFile && !fs.existsSync(audioFile)) {
  console.error(`Audio bed missing: ${audioFile}`);
  process.exit(1);
}
if (reel.audio.voiceover && !fs.existsSync(path.join(ROOT, 'public', reel.audio.voiceover))) {
  console.error(`Voiceover file missing: public/${reel.audio.voiceover}. Generate/record it or set audio.voiceover to null.`);
  process.exit(1);
}

const mp4 = path.join(OUT.reels, `${id}.mp4`);
const raw = path.join(OUT.reels, `${id}.raw.mp4`);
const png = path.join(OUT.covers, `${id}.png`);
const jpg = path.join(OUT.covers, `${id}.jpg`);
const t0 = Date.now();

// 2. Video + cover.
if (engine === 'remotion') {
  run('npx', ['remotion', 'render', 'src/index.ts', `Reel-${id}`, raw]);
  run('npx', ['remotion', 'still', 'src/index.ts', `Cover-${id}`, png]);
} else {
  if (reel.audio.voiceover) {
    console.error('The local engine muxes a single audio file. Pre-mix voiceover + bed, or render with --engine remotion.');
    process.exit(1);
  }
  const renderArgs = ['scripts/local-render/render.mjs', 'reel', id, raw];
  if (audioFile) renderArgs.push('--audio', audioFile);
  run('node', renderArgs);
  run('node', ['scripts/local-render/render.mjs', 'cover', id, png]);
}

// 3. Conform to Instagram Reels spec (stream copy for video; audio re-encoded
//    only if it is not already AAC 128k). Then build the JPEG cover IG requires.
run('ffmpeg', [
  '-v', 'error', '-y', '-i', raw,
  '-map', '0:v:0', '-map', '0:a:0?',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
  '-shortest', '-movflags', '+faststart', '-use_editlist', '0', mp4,
]);
fs.unlinkSync(raw);
run('ffmpeg', ['-v', 'error', '-y', '-i', png, '-q:v', '2', '-pix_fmt', 'yuvj420p', jpg]);

reel.status = 'rendered';
saveReel(reel);
console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(0)}s with engine "${engine}".`);
console.log(`  ${path.relative(ROOT, mp4)}\n  ${path.relative(ROOT, png)}\n  ${path.relative(ROOT, jpg)}`);
console.log(`Next: npm run validate -- ${id}`);
