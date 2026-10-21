#!/usr/bin/env node
// Publishing is deliberately a separate, opt-in integration.
// This script never auto-publishes. It (1) refuses unapproved assets,
// (2) refuses if the approved file changed after approval, and (3) without an
// explicitly configured and authorised Instagram integration, prints a manual
// posting checklist instead of calling any API.
//   node scripts/publish.mjs <reelId>
import fs from 'node:fs';
import path from 'node:path';
import {OUT, ROOT, readJsonIfExists, reelIdArg} from './lib.mjs';

const id = reelIdArg();
const meta = readJsonIfExists(path.join(OUT.metadata, `${id}.json`));
if (!meta || meta.approval?.status !== 'approved') {
  console.error('Refusing: this asset has not been approved. Run `npm run approve` after reviewing it.');
  process.exit(1);
}
const mp4 = path.join(ROOT, meta.files.reel);
if (!fs.existsSync(mp4) || fs.statSync(mp4).size !== meta.approval.fileSize) {
  console.error('Refusing: the MP4 changed after approval. Re-run validate and approve.');
  process.exit(1);
}

const configured = process.env.IG_USER_ID && process.env.IG_ACCESS_TOKEN && process.env.IG_PUBLISH_ENABLED === 'true';
if (configured) {
  // Placeholder by design: implement against Meta's current Instagram content
  // publishing API only after confirming your app's permissions, account type,
  // and that the video is reachable at a public URL the API can fetch.
  console.error('IG integration env vars are set, but no publishing client is implemented in this repo yet. Post manually (below).');
}

console.log(`Manual posting checklist for ${id}`);
console.log(`  1. Upload ${meta.files.reel} as a Reel.`);
console.log(`  2. Set cover from ${meta.files.cover} (check the grid crop preview).`);
console.log(`  3. Paste caption from ${meta.files.caption}.`);
console.log(`  4. Suggested date: ${meta.suggestedPublicationDate}.`);
console.log(`  5. After 7 days, add a row to data/performance/performance.csv and run \`npm run metrics\`.`);
