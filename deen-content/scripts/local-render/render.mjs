#!/usr/bin/env node
// Local fallback renderer: bundles the project's React scenes with the Remotion
// API shim, steps frames in headless Chromium, and encodes with ffmpeg.
// Usage (normally via scripts/render-content.mjs):
//   node scripts/local-render/render.mjs reel  <reelId> <out.mp4> [--audio file.wav] [--range 0-120]
//   node scripts/local-render/render.mjs stills <reelId> <outDir> --frames 0,45,300
//   node scripts/local-render/render.mjs cover <reelId> <out.png>
//   node scripts/local-render/render.mjs gallery <scene> <out.png> [--frame 200]
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../..');
const require = createRequire(import.meta.url);

// Resolve tooling from the project first, then common global locations.
const searchPaths = [
  path.join(projectRoot, 'node_modules'),
  process.env.NODE_GLOBAL_MODULES,
  path.join(process.env.HOME ?? '', '.npm-global/lib/node_modules'),
  '/opt/npm-tools/node_modules',
  '/usr/lib/node_modules',
  '/usr/local/lib/node_modules',
].filter(Boolean);

const resolveDep = (name) => {
  for (const p of searchPaths) {
    try {
      return require.resolve(name, {paths: [p]});
    } catch {
      /* try next */
    }
  }
  throw new Error(`Cannot find "${name}". Install it in the project (npm i -D ${name}) or globally.`);
};

const esbuild = require(resolveDep('esbuild'));
const {chromium} = require(resolveDep('playwright'));
const reactDir = path.dirname(resolveDep('react/package.json'));
const reactDomDir = path.dirname(resolveDep('react-dom/package.json'));

const args = process.argv.slice(2);
const [mode, target, out] = args;
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!mode || !target || !out) {
  console.error('Usage: render.mjs <reel|stills|cover|gallery> <reelId|scene> <out> [options]');
  process.exit(2);
}

const scratch = path.join(projectRoot, 'output', '.local-render');
fs.mkdirSync(scratch, {recursive: true});

async function bundle() {
  await esbuild.build({
    entryPoints: [path.join(here, 'entry.tsx')],
    bundle: true,
    outfile: path.join(scratch, 'bundle.js'),
    format: 'iife',
    jsx: 'automatic',
    loader: {'.json': 'json'},
    alias: {
      remotion: path.join(here, 'remotion-shim.tsx'),
      react: reactDir,
      'react-dom': reactDomDir,
    },
    define: {'process.env.NODE_ENV': '"production"'},
    logLevel: 'warning',
  });
  fs.writeFileSync(
    path.join(scratch, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:1080px;height:1920px;overflow:hidden;background:#0B1020}#root{position:relative;width:1080px;height:1920px;overflow:hidden}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`,
  );
}

const mime = {'.js': 'text/javascript', '.html': 'text/html', '.otf': 'font/otf', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav'};

function serve() {
  const publicDir = path.join(projectRoot, 'public');
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
    const within = (dir) => {
      const f = path.resolve(dir, rel);
      return f.startsWith(dir + path.sep) ? f : null;
    };
    const file = [within(scratch), within(publicDir)].find((f) => f && fs.existsSync(f) && fs.statSync(f).isFile());
    if (!file) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, {'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Output size and layout-checker box per kind (keep in sync with src/brand/canvas.tsx).
const CANVAS = {
  reel: {width: 1080, height: 1920, box: {left: 96, right: 930, top: 250, bottom: 1500}},
  carousel: {width: 1080, height: 1350, box: {left: 90, right: 990, top: 60, bottom: 1325}},
  story: {width: 1080, height: 1920, box: {left: 96, right: 984, top: 250, bottom: 1600}},
};
const reelKind = (id) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/content/reels', `${id}.json`), 'utf8')).kind ?? 'reel';
  } catch {
    return 'reel';
  }
};

async function openPage(server, query, size = {width: 1080, height: 1920}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({viewport: {width: size.width, height: size.height}, deviceScaleFactor: 1});
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const {port} = server.address();
  await page.goto(`http://127.0.0.1:${port}/?${query}`);
  await page.waitForFunction(() => window.__ready === true && (window.__pendingRenders ?? 0) === 0, null, {timeout: 30000}).catch(() => {
    throw new Error(`Page did not become ready. Errors: ${errors.join(' | ')}`);
  });
  await page.evaluate(() => document.fonts.ready);
  const fontsOk = await page.evaluate(() =>
    ['700 40px "DEEN Display"', '500 40px "DEEN Body"', '700 40px "DEEN Mono"'].every((f) => document.fonts.check(f)),
  );
  if (!fontsOk) throw new Error('Brand fonts did not load; refusing to render with fallback fonts.');
  if (errors.length) throw new Error(`Page errors: ${errors.join(' | ')}`);
  return {browser, page, errors};
}

async function shot(page, frame, type = 'png', size = {width: 1080, height: 1920}) {
  await page.evaluate((f) => window.__setFrame(f), frame);
  return page.screenshot({type, quality: type === 'jpeg' ? 92 : undefined, clip: {x: 0, y: 0, width: size.width, height: size.height}});
}

async function main() {
  await bundle();
  const server = await serve();
  try {
    if (mode === 'reel') {
      const {browser, page, errors} = await openPage(server, `reel=${encodeURIComponent(target)}&mode=reel`);
      const duration = await page.evaluate(() => window.__duration);
      const range = opt('range');
      const [from, to] = range ? range.split('-').map(Number) : [0, duration - 1];
      const fps = 30;
      const audio = opt('audio');
      const ffArgs = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-'];
      if (audio) ffArgs.push('-i', audio);
      ffArgs.push('-map', '0:v');
      if (audio) ffArgs.push('-map', '1:a', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2');
      ffArgs.push(
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(fps),
        '-t', ((to - from + 1) / fps).toFixed(3), '-movflags', '+faststart', '-use_editlist', '0', out,
      );
      fs.mkdirSync(path.dirname(out), {recursive: true});
      const ff = spawn('ffmpeg', ffArgs, {stdio: ['pipe', 'inherit', 'inherit']});
      const done = new Promise((resolve, reject) => ff.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exited ${c}`)))));
      const t0 = Date.now();
      for (let f = from; f <= to; f++) {
        const buf = await shot(page, f, 'jpeg');
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        if (f % 60 === 0) process.stdout.write(`  frame ${f}/${to} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
      }
      ff.stdin.end();
      await done;
      await browser.close();
      if (errors.length) throw new Error(`Runtime errors during render: ${errors.join(' | ')}`);
      console.log(`Rendered ${to - from + 1} frames → ${out}`);
    } else if (mode === 'stills') {
      const {browser, page} = await openPage(server, `reel=${encodeURIComponent(target)}&mode=reel`);
      fs.mkdirSync(out, {recursive: true});
      const frames = (opt('frames') ?? '0').split(',').map(Number);
      for (const f of frames) {
        fs.writeFileSync(path.join(out, `frame-${String(f).padStart(4, '0')}.png`), await shot(page, f));
      }
      await browser.close();
      console.log(`Wrote ${frames.length} stills → ${out}`);
    } else if (mode === 'slides') {
      // Carousel slides / story: one PNG per scene, each at its settled state.
      const kind = reelKind(target);
      const size = CANVAS[kind === 'story' ? 'story' : 'carousel'];
      const n = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/content/reels', `${target}.json`), 'utf8')).scenes.length;
      fs.mkdirSync(out, {recursive: true});
      for (let i = 0; i < n; i++) {
        const {browser, page} = await openPage(server, `reel=${encodeURIComponent(target)}&mode=still&slide=${i}`, size);
        fs.writeFileSync(path.join(out, `slide-${String(i + 1).padStart(2, '0')}.png`), await shot(page, 0, 'png', size));
        await browser.close();
      }
      console.log(`Wrote ${n} slide(s) → ${out}`);
    } else if (mode === 'layout-check') {
      // Checks every visible text element at the given frames against the
      // Instagram safe zone and for clipped/truncated text. Writes JSON.
      const isCover = opt('cover') === '1';
      const slide = opt('slide');
      const kind = reelKind(target);
      const stillKind = kind === 'story' ? 'story' : 'carousel';
      const size = slide !== undefined ? CANVAS[stillKind] : CANVAS.reel;
      const query = slide !== undefined ? `mode=still&slide=${slide}` : `mode=${isCover ? 'cover' : 'reel'}`;
      const {browser, page} = await openPage(server, `reel=${encodeURIComponent(target)}&${query}`, size);
      const frames = (opt('frames') ?? '0').split(',').map(Number);
      const box = isCover ? {left: 90, right: 990, top: 285, bottom: 1635} : slide !== undefined ? CANVAS[stillKind].box : CANVAS.reel.box;
      const results = [];
      for (const f of frames) {
        await page.evaluate((fr) => window.__setFrame(fr), f);
        const issues = await page.evaluate((b) => {
          const out = [];
          const visible = (el) => {
            let o = 1;
            for (let n = el; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
            return o > 0.05;
          };
          const els = [...document.querySelectorAll('#root *')].filter((el) =>
            [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0),
          );
          for (const el of els) {
            if (!visible(el)) continue;
            const r = el.getBoundingClientRect();
            const text = el.textContent.trim().slice(0, 50);
            const tol = 2;
            if (r.left < b.left - tol || r.right > b.right + tol || r.top < b.top - tol || r.bottom > b.bottom + tol) {
              out.push({type: 'outside-safe-zone', text, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]});
            }
            if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow === 'hidden') {
              out.push({type: 'truncated-text', text});
            }
          }
          return out;
        }, box);
        results.push({frame: f, issues});
      }
      await browser.close();
      fs.mkdirSync(path.dirname(out), {recursive: true});
      fs.writeFileSync(out, JSON.stringify({box, results}, null, 2));
      const n = results.reduce((a, r) => a + r.issues.length, 0);
      console.log(`Layout check: ${n} issue(s) across ${frames.length} frame(s) → ${out}`);
    } else if (mode === 'cover') {
      const {browser, page} = await openPage(server, `reel=${encodeURIComponent(target)}&mode=cover`);
      fs.mkdirSync(path.dirname(out), {recursive: true});
      fs.writeFileSync(out, await shot(page, 0));
      await browser.close();
      console.log(`Cover → ${out}`);
    } else if (mode === 'gallery') {
      const {browser, page} = await openPage(server, `mode=gallery&scene=${encodeURIComponent(target)}`);
      fs.mkdirSync(path.dirname(out), {recursive: true});
      fs.writeFileSync(out, await shot(page, Number(opt('frame') ?? 200)));
      await browser.close();
      console.log(`Gallery still → ${out}`);
    } else {
      throw new Error(`Unknown mode ${mode}`);
    }
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
