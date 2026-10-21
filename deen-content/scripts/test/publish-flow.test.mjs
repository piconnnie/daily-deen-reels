#!/usr/bin/env node
// Offline end-to-end test of approval → scheduling → publishing against a mock
// Instagram Graph API. Runs on a temporary copy of the project, so real
// archive state is never touched.
//   node scripts/test/publish-flow.test.mjs <reelId>
// Requires the reel to be rendered, validated and archived first.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const id = process.argv[2];
if (!id) throw new Error('Usage: publish-flow.test.mjs <reelId>');

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
};

// --- temp copy (only what the publisher needs)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deen-pub-'));
for (const p of ['scripts', 'archive', 'package.json', 'src/content/reels']) fs.cpSync(path.join(ROOT, p), path.join(tmp, p), {recursive: true});
fs.mkdirSync(path.join(tmp, 'output/reels'), {recursive: true});
fs.mkdirSync(path.join(tmp, 'output/covers'), {recursive: true});
fs.copyFileSync(path.join(ROOT, `output/reels/${id}.mp4`), path.join(tmp, `output/reels/${id}.mp4`));
fs.copyFileSync(path.join(ROOT, `output/covers/${id}.jpg`), path.join(tmp, `output/covers/${id}.jpg`));
const statePath = path.join(tmp, 'archive', id, 'state.json');
const readState = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));

// --- mock Graph API
const calls = [];
let polls = 0;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const params = Object.fromEntries(new URLSearchParams(body));
    calls.push({method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), params, headers: req.headers, bytes: body.length});
    const json = (o, s = 200) => {
      res.writeHead(s, {'content-type': 'application/json'});
      res.end(JSON.stringify(o));
    };
    if (req.method === 'HEAD' && url.pathname.startsWith('/assets/')) return res.writeHead(200).end();
    if (url.pathname === '/v26.0/me') return json({user_id: 'IGID', username: 'dailydeenreminders', account_type: 'MEDIA_CREATOR'});
    if (url.pathname === '/v26.0/IGID/content_publishing_limit') return json({data: [{quota_usage: 0, config: {quota_total: 100}}]});
    if (url.pathname === '/v26.0/IGID/media' && req.method === 'POST') {
      return params.upload_type === 'resumable' ? json({id: 'c1', uri: `http://127.0.0.1:${server.address().port}/upload/c1`}) : json({id: 'c1'});
    }
    if (url.pathname === '/upload/c1') return json({success: true, message: 'Upload successful.'});
    if (url.pathname === '/v26.0/c1') return json({status_code: ++polls < 2 ? 'IN_PROGRESS' : 'FINISHED'});
    if (url.pathname === '/v26.0/IGID/media_publish') return json({id: 'm1'});
    if (url.pathname === '/v26.0/m1') return json({permalink: 'https://www.instagram.com/reel/TEST/'});
    json({error: {message: `unexpected ${req.method} ${url.pathname}`, code: 1}}, 400);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const run = (script, args = [], extraEnv = {}) =>
  new Promise((resolve) => {
    const p = spawn('node', [script, ...args], {cwd: tmp, env: {...process.env, ...extraEnv}});
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolve({code, out, err}));
  });

const baseEnv = {
  IG_ACCESS_TOKEN: 'TEST_TOKEN_SECRET',
  IG_USER_ID: 'IGID',
  IG_LOGIN: 'instagram',
  IG_GRAPH_HOST: `http://127.0.0.1:${port}`,
  DEEN_PUBLIC_BASE_URL: `http://127.0.0.1:${port}/assets`,
  DEEN_IG_POLL_MS: '10',
  DEEN_POST_TIME: '00:00',
  GITHUB_OUTPUT: '',
};

// 1. Not approved → not due, and publisher refuses.
let r = await run('scripts/daily/publish-due.mjs', [], baseEnv);
check('Unapproved reel is not scheduled', r.out.trim() === '', r.err.trim());
r = await run('scripts/daily/publish-instagram.mjs', [id], baseEnv);
check('Publisher refuses an unapproved reel', r.code !== 0 && /not approved/.test(r.err));

// 2. Approve (what the merge workflow does).
const s = readState();
s.approval = {status: 'approved', approvedBy: 'tester', approvedAt: new Date().toISOString(), pr: 1};
fs.writeFileSync(statePath, JSON.stringify(s, null, 2));

// 3. Time-slot logic.
r = await run('scripts/daily/publish-due.mjs', [], {...baseEnv, DEEN_POST_TIME: '23:59:99'});
check('Not due before the post time', r.out.trim() === '', r.err.trim());
r = await run('scripts/daily/publish-due.mjs', [], baseEnv);
check('Due after the post time', r.out.trim() === id, r.err.trim());

// 4. Tampered file is refused.
const mp4 = path.join(tmp, `output/reels/${id}.mp4`);
const original = fs.readFileSync(mp4);
fs.appendFileSync(mp4, Buffer.from('x'));
r = await run('scripts/daily/publish-instagram.mjs', [id], baseEnv);
check('Refuses a file that differs from the approved one', r.code !== 0 && /hash mismatch/.test(r.err));
fs.writeFileSync(mp4, original);

// 5. Not configured → manual-required, no API calls.
r = await run('scripts/daily/publish-instagram.mjs', [id], {...baseEnv, IG_ACCESS_TOKEN: ''});
check('Without Instagram credentials it asks for a manual post', r.code === 0 && readState().publish.status === 'manual-required' && calls.length === 0);

// 6. URL-mode publish.
r = await run('scripts/daily/publish-instagram.mjs', [id], baseEnv);
const st = readState();
const create = calls.find((c) => c.path === '/v26.0/IGID/media');
check('Publishes in URL mode', r.code === 0 && st.publish.status === 'published', r.err.trim().slice(-200));
check('Container uses REELS + caption + cover + video URL', create && create.params.media_type === 'REELS' && create.params.caption?.length > 50 && create.params.cover_url?.endsWith('.jpg') && create.params.video_url?.endsWith('.mp4'));
check('Waits for FINISHED before publishing', polls >= 2);
check('Records media id and permalink', st.publish.mediaId === 'm1' && st.publish.permalink?.includes('/reel/'));
check('Token never appears in output', !(r.out + r.err).includes('TEST_TOKEN_SECRET'));

// 7. Second run: already published, nothing posted twice; daily cap respected.
const before = calls.length;
r = await run('scripts/daily/publish-instagram.mjs', [id], baseEnv);
check('Does not post the same reel twice', r.code === 0 && calls.filter((c) => c.path.endsWith('media_publish')).length === 1 && calls.length === before);
r = await run('scripts/daily/publish-due.mjs', [], baseEnv);
check('Daily cap: nothing else due today', r.out.trim() === '', r.err.trim());

// 8. Resumable mode uploads the file bytes.
const s2 = readState();
s2.publish = {status: 'pending', attempts: 0};
fs.writeFileSync(statePath, JSON.stringify(s2, null, 2));
calls.length = 0;
polls = 0;
r = await run('scripts/daily/publish-instagram.mjs', [id], {...baseEnv, IG_LOGIN: 'facebook', IG_UPLOAD_MODE: 'resumable'});
const upload = calls.find((c) => c.path === '/upload/c1');
check('Resumable mode uploads the video with OAuth + offset headers', r.code === 0 && upload && upload.headers.authorization?.startsWith('OAuth ') && upload.headers.offset === '0' && Number(upload.headers.file_size) === original.length, r.err.trim().slice(-200));

// 9. Instagram Login without IG_USER_ID: the account id is looked up from the token.
const s3 = readState();
s3.publish = {status: 'pending', attempts: 0};
fs.writeFileSync(statePath, JSON.stringify(s3, null, 2));
calls.length = 0;
polls = 0;
r = await run('scripts/daily/publish-instagram.mjs', [id], {...baseEnv, IG_USER_ID: ''});
check('Without IG_USER_ID it looks up the account from the token and posts', r.code === 0 && calls[0]?.path === '/v26.0/me' && calls.some((c) => c.path === '/v26.0/IGID/media_publish') && readState().publish.status === 'published', r.err.trim().slice(-200));
r = await run('scripts/daily/check-instagram.mjs', [], {...baseEnv, IG_USER_ID: ''});
check('Setup check passes with just the token and reports the account', r.code === 0 && /::notice title=Instagram account::@dailydeenreminders/.test(r.out) && !r.out.includes('TEST_TOKEN_SECRET'), r.out.slice(-300));

server.close();
fs.rmSync(tmp, {recursive: true, force: true});
console.log(failures ? `\n${failures} check(s) failed` : '\nAll publish-flow checks passed');
process.exit(failures ? 1 : 0);
