#!/usr/bin/env node
// Tells you exactly what is (and isn't) ready for automated Instagram posting.
//   node scripts/daily/check-instagram.mjs
// Never prints the token.
import {ensureUserId, graph, igConfig, missingConfig, publishingQuota} from './instagram.mjs';

const c = igConfig();
const ok = (m) => console.log(`✅ ${m}`);
// ::error / ::notice lines also show as annotations on the run page (and in the control panel).
const bad = (m) => console.log(`❌ ${m}\n::error title=Instagram setup::${m}`);
const info = (m) => console.log(`ℹ️  ${m}`);
let failures = 0;

info(`Login type: ${c.login} → ${c.host}/${c.version}; upload mode: ${c.uploadMode}`);
if (c.login !== 'facebook' && c.uploadMode === 'resumable') {
  bad('Resumable upload is documented for Facebook Login apps only. Set IG_UPLOAD_MODE=url or IG_LOGIN=facebook.');
  failures++;
}
const missing = missingConfig(c);
if (missing.length) {
  bad(`Missing secrets: ${missing.join(', ')}. See AUTOMATION.md → "Instagram setup".`);
  process.exit(1);
}
ok(c.userId ? 'IG_ACCESS_TOKEN and IG_USER_ID are set' : 'IG_ACCESS_TOKEN is set (account id will be looked up from it)');

try {
  if (c.login === 'facebook') {
    const acct = await graph('GET', c.userId, {fields: 'id,username,name'}, c);
    ok(`Token can read the Instagram account @${acct.username ?? '?'} (${acct.id})`);
  } else {
    const me = await graph('GET', 'me', {fields: 'user_id,username,account_type'}, c);
    ok(`Token belongs to @${me.username} (${me.account_type ?? 'account type not returned'}), account id ${me.user_id}`);
    console.log(`::notice title=Instagram account::@${me.username} (${me.account_type ?? '?'}), id ${me.user_id}`);
    if (me.user_id && c.userId && String(me.user_id) !== String(c.userId)) {
      bad(`IG_USER_ID (${c.userId}) differs from the token's user_id (${me.user_id}). Use ${me.user_id}.`);
      failures++;
    }
    if (me.account_type && !['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'].includes(String(me.account_type).toUpperCase())) {
      bad('Publishing requires an Instagram professional (Business or Creator) account.');
      failures++;
    }
  }
} catch (e) {
  bad(`Account lookup failed: ${e.message}`);
  failures++;
}

try {
  await ensureUserId(c);
} catch (e) {
  bad(e.message);
  process.exit(1);
}
const quota = await publishingQuota(c);
if (quota?.error) {
  bad(`Publishing-limit check failed (often a missing content-publish permission): ${quota.error}`);
  failures++;
} else if (quota) {
  ok(`Content publishing permission works; quota usage ${JSON.stringify(quota)}`);
}

if (process.env.HAS_OAUTH === 'true') ok('Writer: Claude Code on your Claude subscription (CLAUDE_CODE_OAUTH_TOKEN)');
else if (process.env.ANTHROPIC_API_KEY) ok('Writer: Claude API (ANTHROPIC_API_KEY)');
else info('Writer: content queue only (no CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY). Reels come from data/queue until it runs out.');

console.log(failures ? `\n${failures} problem(s) to fix before automated posting.` : '\nReady: the publisher can post approved reels.');
if (!failures) console.log('::notice title=Instagram setup::Ready: approved reels will be posted automatically.');
process.exit(failures ? 1 : 0);
