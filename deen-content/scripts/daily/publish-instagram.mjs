#!/usr/bin/env node
// Publishes one approved reel to Instagram and records the result in
// archive/<id>/state.json. Refuses unless:
//   - the reel was approved (PR merged), and
//   - the local MP4 + JPEG have exactly the SHA-256 recorded when QA passed.
//   node scripts/daily/publish-instagram.mjs <reelId> [--dry-run]
// Expects the release assets downloaded to output/reels/<id>.mp4 and
// output/covers/<id>.jpg (the workflow does this with `gh release download`).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {OUT, ROOT} from '../lib.mjs';
import {createReelContainer, ensureUserId, igConfig, missingConfig, publishContainer, publishingQuota, resolvePublicUrl, graph, waitForContainer} from './instagram.mjs';

const id = process.argv[2];
const dry = process.argv.includes('--dry-run');
if (!id) {
  console.error('Usage: publish-instagram.mjs <reelId> [--dry-run]');
  process.exit(2);
}
const statePath = path.join(ROOT, 'archive', id, 'state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
const fail = (msg, code = 1) => {
  console.error(`Not published: ${msg}`);
  process.exit(code);
};

if (state.approval?.status !== 'approved') fail('reel is not approved (merge its review PR first).');
if (state.publish?.status === 'published') fail(`already published: ${state.publish.permalink}`, 0);

const video = path.join(OUT.reels, `${id}.mp4`);
const cover = path.join(OUT.covers, `${id}.jpg`);
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for (const [k, p] of [['video', video], ['cover', cover]]) {
  if (!fs.existsSync(p)) fail(`missing ${k} file ${path.relative(ROOT, p)}`);
  if (sha(p) !== state.sha256[k]) fail(`${k} does not match the file that passed QA and was approved (hash mismatch).`);
}
const caption = fs.readFileSync(path.join(ROOT, 'archive', id, 'caption.txt'), 'utf8').trim();
if (caption.length > 2200) fail(`caption is ${caption.length} chars (Instagram max 2,200).`);

const c = igConfig();
const missing = missingConfig(c);
if (missing.length) {
  console.log(`Instagram isn't configured (${missing.join(', ')} missing). Post manually:`);
  console.log(`  video  ${state.release.video} (release ${state.release.tag})\n  cover  ${state.release.cover}\n  caption archive/${id}/caption.txt`);
  state.publish = {...state.publish, status: 'manual-required'};
  save();
  process.exit(0);
}

await ensureUserId(c);

const repo = process.env.GITHUB_REPOSITORY;
const base = process.env.DEEN_PUBLIC_BASE_URL || (repo ? `https://github.com/${repo}/releases/download/${state.release.tag}` : null);
const publicUrl = async (file) => (base ? resolvePublicUrl(`${base.replace(/\/$/, '')}/${file}`) : null);

console.log(`Publishing ${id} via ${c.host} (${c.uploadMode} upload)${dry ? ' — DRY RUN' : ''}`);
const quota = await publishingQuota(c);
if (quota) console.log(`  publishing quota: ${JSON.stringify(quota)}`);
if (dry) {
  console.log(`  would post ${path.relative(ROOT, video)} with ${caption.length}-char caption`);
  process.exit(0);
}

state.publish.attempts = (state.publish.attempts ?? 0) + 1;
try {
  const coverUrl = await publicUrl(state.release.cover);
  const videoUrl = c.uploadMode === 'url' ? await publicUrl(state.release.video) : null;
  if (c.uploadMode === 'url' && !videoUrl) throw new Error('No public video URL: set GITHUB_REPOSITORY or DEEN_PUBLIC_BASE_URL.');
  const containerId = await createReelContainer({caption, videoUrl, coverUrl, filePath: video, c});
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
