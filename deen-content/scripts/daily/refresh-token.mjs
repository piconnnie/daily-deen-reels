#!/usr/bin/env node
// Refreshes a long-lived Instagram User access token (Instagram Login only;
// these expire after ~60 days unless refreshed). Writes the new token to the
// file given as the first argument so the workflow can store it as a secret.
// Facebook Login Page tokens derived from a long-lived user token don't use this.
//   node scripts/daily/refresh-token.mjs /tmp/new-token
import fs from 'node:fs';
import {igConfig} from './instagram.mjs';

const out = process.argv[2];
const c = igConfig();
if (c.login !== 'instagram') {
  console.log('IG_LOGIN is not "instagram"; nothing to refresh.');
  process.exit(0);
}
if (!c.token) {
  console.error('IG_ACCESS_TOKEN is not set.');
  process.exit(1);
}
const url = new URL(`${process.env.IG_GRAPH_HOST || 'https://graph.instagram.com'}/refresh_access_token`);
url.searchParams.set('grant_type', 'ig_refresh_token');
url.searchParams.set('access_token', c.token);
const res = await fetch(url);
const json = await res.json().catch(() => ({}));
if (!res.ok || !json.access_token) {
  console.error(`Refresh failed (${res.status}): ${json.error?.message ?? 'no token returned'}`);
  process.exit(1);
}
if (out) fs.writeFileSync(out, json.access_token, {mode: 0o600});
console.log(`Token refreshed; valid for ~${Math.round((json.expires_in ?? 0) / 86400)} days.`);
