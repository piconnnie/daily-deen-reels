#!/usr/bin/env node
// Publishes one approved reel, carousel or story to Instagram and records the
// result in archive/<id>/state.json. Refuses unless:
//   - it was approved (PR merged), and
//   - every local file has exactly the SHA-256 recorded when QA passed.
//   node scripts/daily/publish-instagram.mjs <id> [--dry-run]
// Expects the release assets downloaded to output/publish/<id>/ (the workflow
// does this with `gh release download`).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from '../lib.mjs';
import {createCarouselContainer, createImageContainer, createReelContainer, ensureUserId, igConfig, missingConfig, publishContainer, publishingQuota, resolvePublicUrl, graph, waitForContainer} from './instagram.mjs';

const id = process.argv[2];
const dry = process.argv.includes('--dry-run');
if (!id) {
  console.error('Usage: publish-instagram.mjs <id> [--dry-run]');
  process.exit(2);
}
const statePath = path.join(ROOT, 'archive', id, 'state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
const fail = (msg, code = 1) => {
  console.error(`Not published: ${msg}`);
  process.exit(code);
};
const kind = state.kind ?? 'reel';
const what = kind === 'reel' ? 'reel' : kind === 'carousel' ? 'carousel' : 'story';

if (state.approval?.status !== 'approved') fail(`${what} is not approved (merge its review PR first).`);
if (state.publish?.status === 'published') fail(`already published: ${state.publish.permalink}`, 0);

const dir = path.join(ROOT, 'output', 'publish', id);
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const local = (name) => path.join(dir, name);
const checks = kind === 'reel' ? [['video', state.release.video, state.sha256.video], ['cover', state.release.cover, state.sha256.cover]] : state.release.slides.map((n, i) => [`image ${i + 1}`, n, state.sha256.slides[i]]);
for (const [k, name, hash] of checks) {
  if (!fs.existsSync(local(name))) fail(`missing ${k} file output/publish/${id}/${name}`);
  if (sha(local(name)) !== hash) fail(`${k} does not match the file that passed QA and was approved (hash mismatch).`);
}
const caption = fs.readFileSync(path.join(ROOT, 'archive', id, 'caption.txt'), 'utf8').trim();
if (caption.length > 2200) fail(`caption is ${caption.length} chars (Instagram max 2,200).`);

const c = igConfig();
const missing = missingConfig(c);
if (missing.length) {
  console.log(`Instagram isn't configured (${missing.join(', ')} missing). Post manually from release ${state.release.tag}:`);
  for (const [, name] of checks) console.log(`  ${name}`);
  console.log(`  caption archive/${id}/caption.txt`);
  state.publish = {...state.publish, status: 'manual-required'};
  save();
  process.exit(0);
}

await ensureUserId(c);

const repo = process.env.GITHUB_REPOSITORY;
const base = process.env.DEEN_PUBLIC_BASE_URL || (repo ? `https://github.com/${repo}/releases/download/${state.release.tag}` : null);
const publicUrl = async (file) => (base ? resolvePublicUrl(`${base.replace(/\/$/, '')}/${file}`) : null);

console.log(`Publishing ${what} ${id} via ${c.host}${kind === 'reel' ? ` (${c.uploadMode} upload)` : ''}${dry ? ' — DRY RUN' : ''}`);
const quota = await publishingQuota(c);
if (quota) console.log(`  publishing quota: ${JSON.stringify(quota)}`);
if (dry) {
  console.log(`  would post ${checks.length} file(s)${kind === 'story' ? '' : ` with a ${caption.length}-char caption`}`);
  process.exit(0);
}

state.publish.attempts = (state.publish.attempts ?? 0) + 1;
try {
  let containerId;
  if (kind === 'reel') {
    const coverUrl = await publicUrl(state.release.cover);
    const videoUrl = c.uploadMode === 'url' ? await publicUrl(state.release.video) : null;
    if (c.uploadMode === 'url' && !videoUrl) throw new Error('No public video URL: set GITHUB_REPOSITORY or DEEN_PUBLIC_BASE_URL.');
    containerId = await createReelContainer({caption, videoUrl, coverUrl, filePath: local(state.release.video), c});
  } else {
    if (!base) throw new Error('No public image URL: set GITHUB_REPOSITORY or DEEN_PUBLIC_BASE_URL.');
    if (kind === 'story') {
      // Stories carry no caption on Instagram; the reply prompt is in the image.
      containerId = await createImageContainer({imageUrl: await publicUrl(state.release.slides[0]), story: true, c});
    } else {
      const children = [];
      for (const name of state.release.slides) {
        const child = await createImageContainer({imageUrl: await publicUrl(name), carouselItem: true, c});
        await waitForContainer(child, {c});
        children.push(child);
      }
      containerId = await createCarouselContainer({children, caption, c});
    }
  }
  console.log(`  container ${containerId} created`);
  await waitForContainer(containerId, {c});
  const mediaId = await publishContainer(containerId, c);
  let permalink = null;
  try {
    permalink = (await graph('GET', mediaId, {fields: 'permalink'}, c)).permalink ?? null;
  } catch {
    /* permalink is nice-to-have */
  }
  state.publish = {...state.publish, status: 'published', mediaId, permalink, publishedAt: new Date().toISOString(), lastError: null};
  save();
  console.log(`Published ${id}: ${permalink ?? mediaId}`);
} catch (e) {
  state.publish = {...state.publish, status: 'failed', lastError: String(e.message).slice(0, 500), lastAttemptAt: new Date().toISOString()};
  save();
  fail(e.message);
}
