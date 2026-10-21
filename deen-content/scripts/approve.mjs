#!/usr/bin/env node
// Human approval gate. Nothing is publishable until a named person confirms
// they watched the final render, checked every source link, and automated QA passed.
//   node scripts/approve.mjs <reelId> --by "Name" --watched --sources-checked
import fs from 'node:fs';
import path from 'node:path';
import {OUT, loadReel, readJsonIfExists, reelIdArg, saveReel} from './lib.mjs';

const id = reelIdArg();
const args = process.argv.slice(3);
const by = args.includes('--by') ? args[args.indexOf('--by') + 1] : null;
const metaPath = path.join(OUT.metadata, `${id}.json`);
const meta = readJsonIfExists(metaPath);

const fail = (m) => {
  console.error(`Not approved: ${m}`);
  process.exit(1);
};
if (!meta) fail('no metadata. Run `npm run package` first.');
if (meta.qa?.status !== 'automated-passed') fail(`automated QA status is "${meta.qa?.status ?? 'not-run'}". Run \`npm run validate\` and fix failures.`);
if (!by) fail('pass --by "<your name>".');
if (!args.includes('--watched') || !args.includes('--sources-checked')) {
  fail('confirm the manual checks with --watched (full video at normal speed on a phone) and --sources-checked (opened every quran.com / sunnah.com link and compared it with the screen).');
}
const reelMp4 = path.join(OUT.reels, `${id}.mp4`);
if (!fs.existsSync(reelMp4)) fail('final MP4 not found.');

meta.qa.manualChecks = {status: 'done', confirmedBy: by, confirmedAt: new Date().toISOString(), items: meta.qa.manualChecks?.items ?? []};
meta.approval = {status: 'approved', approvedBy: by, approvedAt: new Date().toISOString(), fileSize: fs.statSync(reelMp4).size};
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
const reel = loadReel(id);
reel.status = 'approved';
saveReel(reel);
console.log(`Approved ${id} by ${by}. It can now be posted (manually, or via a configured publishing integration).`);
