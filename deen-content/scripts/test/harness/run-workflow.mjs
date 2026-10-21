#!/usr/bin/env node
// Runs the `run:` steps of a GitHub Actions workflow locally, in order, with
// GitHub's expression syntax, step outputs, `if:` conditions, env layering and
// working directories. `uses:` steps are emulated (checkout) or skipped (setup;
// tools must already be installed). Intended for testing the DEEN workflows
// against a local git remote and the fake `gh` in this folder — not a general
// Actions runner.
//
//   node run-workflow.mjs <workflow.yml> --repo <checkout dir> --event <name>
//        [--inputs '{"k":"v"}'] [--event-json '{...}'] [--secrets '{}'] [--vars '{}'] [--job <id>]
// Prints a step-by-step log; exit code 1 if the job failed.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const yamlPath = [path.resolve('node_modules'), '/opt/npm-tools/node_modules', path.join(os.homedir(), '.npm-global/lib/node_modules')]
  .map((p) => {
    try {
      return require.resolve('js-yaml', {paths: [p]});
    } catch {
      return null;
    }
  })
  .find(Boolean);
if (!yamlPath) throw new Error('js-yaml not found (npm i -D js-yaml)');
const yaml = require(yamlPath);

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const wfPath = args[0];
const repo = path.resolve(opt('repo'));
const eventName = opt('event', 'workflow_dispatch');
const inputs = JSON.parse(opt('inputs', '{}'));
const event = JSON.parse(opt('event-json', '{}'));
const secrets = JSON.parse(opt('secrets', '{}'));
const vars = JSON.parse(opt('vars', '{}'));
const wf = yaml.load(fs.readFileSync(wfPath, 'utf8'));
const jobId = opt('job', Object.keys(wf.jobs)[0]);
const job = wf.jobs[jobId];

const steps = {};
let envCtx = {}; // job-level env, visible to step `if:` as env.X (GitHub semantics)
let jobStatus = 'success';
const ctxRaw = () => ({
    inputs,
    secrets,
    vars,
    steps,
    env: envCtx,
    github: {
      event_name: eventName,
      actor: event.actor ?? 'faraz',
      repository: 'fake/AI-projects',
      token: 'fake-token',
      event: {repository: {default_branch: 'main'}, ...event},
    },
  });

// Context paths (github.event.x.y, steps.id.outputs.k, …) are resolved with a
// null-safe walk: anything missing reads as '' like in GitHub Actions, and
// `a.*.b` maps over arrays.
const ROOTS = 'github|inputs|secrets|vars|steps|env';
const getPath = (root, dotted) => {
  let cur = [root];
  let star = false;
  for (const part of dotted.split('.')) {
    if (part === '*') {
      star = true;
      cur = cur.flatMap((c) => (Array.isArray(c) ? c : []));
      continue;
    }
    cur = cur.map((c) => (c === null || c === undefined || c === '' ? undefined : c[part]));
  }
  if (star) return cur.filter((x) => x !== undefined);
  const v = cur[0];
  return v === undefined || v === null ? '' : v;
};
const toJs = (expr) =>
  expr
    .replace(new RegExp(`\\b(${ROOTS})((?:\\.(?:[\\w-]+|\\*))+)`, 'g'), (_, root, rest) => `__get(${root}, ${JSON.stringify(rest.slice(1))})`)
    .replace(/\bfailure\(\)/g, `(jobStatus === 'failure')`)
    .replace(/\bsuccess\(\)/g, `(jobStatus === 'success')`)
    .replace(/\balways\(\)/g, 'true')
    .replace(/\bcontains\(/g, '__contains(')
    .replace(/\bstartsWith\(/g, '__startsWith(');

const evaluate = (expr) => {
  const c = ctxRaw();
  const fn = new Function('github', 'inputs', 'secrets', 'vars', 'steps', 'env', 'jobStatus', '__get', '__contains', '__startsWith', `return (${toJs(expr)});`);
  return fn(
    c.github, c.inputs, c.secrets, c.vars, c.steps, c.env,
    jobStatus,
    getPath,
    (a, b) => (Array.isArray(a) ? a.includes(b) : String(a).includes(b)),
    (a, b) => String(a).startsWith(b),
  );
};
const interpolate = (s) => String(s).replace(/\$\{\{\s*([\s\S]+?)\s*\}\}/g, (_, e) => {
  const v = evaluate(e);
  return v === undefined || v === null ? '' : String(v);
});
const condition = (raw) => {
  if (raw === undefined) return jobStatus === 'success';
  const e = String(raw).trim().replace(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/, '$1');
  const usesStatusFn = /failure\(\)|always\(\)/.test(e);
  const v = !!evaluate(e);
  return usesStatusFn ? v : v && jobStatus === 'success';
};

if (job.if !== undefined && !condition(job.if)) {
  console.log(`[job ${jobId}] skipped by if: ${String(job.if).trim()}`);
  process.exit(0);
}

const baseEnv = {
  ...process.env,
  GITHUB_REPOSITORY: 'fake/AI-projects',
  GITHUB_EVENT_NAME: eventName,
  GITHUB_ACTOR: event.actor ?? 'faraz',
  CI: 'true',
};
const jobEnv = Object.fromEntries(Object.entries(job.env ?? {}).map(([k, v]) => [k, interpolate(v)]));
envCtx = jobEnv;
const defaultWd = job.defaults?.run?.['working-directory'] ?? wf.defaults?.run?.['working-directory'] ?? '.';
const summaryFile = path.join(os.tmpdir(), `summary-${process.pid}.md`);
fs.writeFileSync(summaryFile, '');

for (const [i, step] of job.steps.entries()) {
  const name = step.name ?? step.uses ?? `step ${i + 1}`;
  if (!condition(step.if)) {
    console.log(`  ⏭  ${name}`);
    continue;
  }
  if (step.uses) {
    if (step.uses.startsWith('actions/checkout')) {
      const ref = step.with?.ref ? interpolate(step.with.ref) : null;
      if (ref) {
        const r = spawnSync('git', ['checkout', '-q', ref], {cwd: repo, encoding: 'utf8'});
        if (r.status !== 0) spawnSync('git', ['checkout', '-q', '-B', ref, `origin/${ref}`], {cwd: repo});
        spawnSync('git', ['pull', '-q', '--ff-only', 'origin', ref], {cwd: repo});
      }
      console.log(`  ✓  ${name}${ref ? ` (ref ${ref})` : ''} [emulated]`);
    } else if (step.uses.startsWith('anthropics/claude-code-action')) {
      // Emulated by a test command (HARNESS_CLAUDE_ACTION) that plays Claude Code.
      const cmd = process.env.HARNESS_CLAUDE_ACTION;
      const withEnv = Object.fromEntries(Object.entries(step.with ?? {}).map(([k, v]) => [`INPUT_${k.toUpperCase()}`, interpolate(v)]));
      const r = cmd ? spawnSync('bash', ['-eo', 'pipefail', '-c', cmd], {cwd: repo, env: {...baseEnv, ...jobEnv, ...withEnv}, encoding: 'utf8'}) : {status: 1, stdout: '', stderr: 'no HARNESS_CLAUDE_ACTION'};
      const outcome = r.status === 0 ? 'success' : 'failure';
      if (step.id) steps[step.id] = {outputs: {}, outcome};
      if (outcome === 'failure' && !step['continue-on-error']) jobStatus = 'failure';
      console.log(`  ${outcome === 'success' ? '✓' : '⚠'}  ${name} [emulated Claude Code: ${outcome}]`);
    } else {
      console.log(`  ·  ${name} [skipped: local toolchain]`);
    }
    continue;
  }
  const outFile = path.join(os.tmpdir(), `out-${process.pid}-${i}`);
  fs.writeFileSync(outFile, '');
  const stepEnv = Object.fromEntries(Object.entries(step.env ?? {}).map(([k, v]) => [k, interpolate(v)]));
  const script = interpolate(step.run);
  const cwd = path.join(repo, step['working-directory'] ?? defaultWd);
  const t0 = Date.now();
  const r = spawnSync('bash', ['-eo', 'pipefail', '-c', script], {
    cwd,
    env: {...baseEnv, ...jobEnv, ...stepEnv, GITHUB_OUTPUT: outFile, GITHUB_STEP_SUMMARY: summaryFile},
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const outputs = Object.fromEntries(
    fs
      .readFileSync(outFile, 'utf8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
  if (step.id) steps[step.id] = {outputs, outcome: r.status === 0 ? 'success' : 'failure'};
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const tail = (r.stdout + r.stderr).trim().split('\n').slice(-6).map((l) => `       ${l}`).join('\n');
  if (r.status === 0) {
    console.log(`  ✓  ${name} (${secs}s)${Object.keys(outputs).length ? ` outputs=${JSON.stringify(outputs)}` : ''}`);
    if (process.env.HARNESS_VERBOSE) console.log(tail);
  } else {
    if (step['continue-on-error']) {
      console.log(`  ⚠  ${name} failed (continue-on-error)\n${tail}`);
    } else {
      jobStatus = 'failure';
      console.log(`  ✗  ${name} (exit ${r.status}, ${secs}s)\n${tail}`);
    }
  }
}
const summary = fs.readFileSync(summaryFile, 'utf8').trim();
if (summary) console.log(`  summary: ${summary.split('\n')[0]}`);
console.log(`[job ${jobId}] ${jobStatus}`);
process.exit(jobStatus === 'success' ? 0 : 1);
