// Instagram Graph API helpers for Reels publishing.
// Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing
//       https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
//
// Configuration (GitHub secrets / variables):
//   IG_ACCESS_TOKEN  Instagram User token (Instagram Login) or Page token (Facebook Login)
//   IG_USER_ID       Instagram professional account ID (optional with Instagram Login:
//                    looked up from the token via /me)
//   IG_LOGIN         "instagram" (graph.instagram.com) or "facebook" (graph.facebook.com)
//   IG_API_VERSION   default v26.0
//   IG_UPLOAD_MODE   "url" (Meta fetches a public video URL) or "resumable" (upload the
//                    file directly; documented for Facebook Login apps only)

export const igConfig = () => {
  const login = (process.env.IG_LOGIN || 'instagram').toLowerCase();
  return {
    token: process.env.IG_ACCESS_TOKEN || '',
    userId: process.env.IG_USER_ID || '',
    login,
    version: process.env.IG_API_VERSION || 'v26.0',
    // IG_GRAPH_HOST overrides the host (used only by the offline test harness).
    host: process.env.IG_GRAPH_HOST || (login === 'facebook' ? 'https://graph.facebook.com' : 'https://graph.instagram.com'),
    uploadMode: (process.env.IG_UPLOAD_MODE || (login === 'facebook' ? 'resumable' : 'url')).toLowerCase(),
  };
};

export const missingConfig = (c = igConfig()) =>
  [!c.token && 'IG_ACCESS_TOKEN', !c.userId && c.login === 'facebook' && 'IG_USER_ID'].filter(Boolean);

// With Instagram Login the token identifies the account, so IG_USER_ID can be
// looked up instead of configured. Fills c.userId in place and returns it.
export async function ensureUserId(c = igConfig()) {
  if (c.userId || c.login === 'facebook' || !c.token) return c.userId;
  const me = await graph('GET', 'me', {fields: 'user_id,username'}, c);
  c.userId = String(me.user_id ?? me.id ?? '');
  if (!c.userId) throw new Error('Could not look up the Instagram account id from the token (GET /me returned no user_id).');
  return c.userId;
}

const redact = (s, token) => (token ? String(s).split(token).join('***') : String(s));

export async function graph(method, pathname, params = {}, c = igConfig()) {
  const url = new URL(`${c.host}/${c.version}/${pathname.replace(/^\/+/, '')}`);
  let body;
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    url.searchParams.set('access_token', c.token);
  } else {
    body = new URLSearchParams({...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), access_token: c.token});
  }
  const res = await fetch(url, {method, body});
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = {raw: text};
  }
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new Error(redact(`Graph API ${method} ${pathname} → ${res.status}: ${e.message ?? text.slice(0, 300)} (type ${e.type ?? '?'}, code ${e.code ?? '?'}, subcode ${e.error_subcode ?? '?'})`, c.token));
  }
  return json;
}

/** Follows a GitHub release-asset redirect to the direct (signed) file URL. */
export async function resolvePublicUrl(url) {
  let current = url;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(current, {method: 'HEAD', redirect: 'manual'});
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`Public URL check failed (${res.status}) for ${url}`);
    return current;
  }
  return current;
}

export async function createReelContainer({caption, videoUrl, coverUrl, filePath, c = igConfig()}) {
  const params = {media_type: 'REELS', caption, share_to_feed: 'true'};
  if (coverUrl) params.cover_url = coverUrl;
  else params.thumb_offset = '0';
  if (c.uploadMode === 'resumable') {
    params.upload_type = 'resumable';
    const created = await graph('POST', `${c.userId}/media`, params, c);
    const fs = await import('node:fs');
    const size = fs.statSync(filePath).size;
    const uri = created.uri ?? `https://rupload.facebook.com/ig-api-upload/${c.version}/${created.id}`;
    const up = await fetch(uri, {
      method: 'POST',
      headers: {Authorization: `OAuth ${c.token}`, offset: '0', file_size: String(size)},
      body: fs.readFileSync(filePath),
    });
    const upText = await up.text();
    if (!up.ok) throw new Error(redact(`Resumable upload failed (${up.status}): ${upText.slice(0, 300)}`, c.token));
    return created.id;
  }
  if (!videoUrl) throw new Error('videoUrl is required in url upload mode.');
  params.video_url = videoUrl;
  const created = await graph('POST', `${c.userId}/media`, params, c);
  return created.id;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls once a minute (Meta's guidance) until FINISHED, up to `tries`. */
export async function waitForContainer(containerId, {tries = 10, intervalMs = Number(process.env.DEEN_IG_POLL_MS || 60000), c = igConfig()} = {}) {
  for (let i = 0; i < tries; i++) {
    const s = await graph('GET', containerId, {fields: 'status_code,status'}, c);
    console.log(`  container ${containerId}: ${s.status_code}${s.status ? ` (${s.status})` : ''}`);
    if (s.status_code === 'FINISHED') return s;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Container ${s.status_code}: ${s.status ?? 'no detail'}`);
    await sleep(intervalMs);
  }
  throw new Error('Container did not finish processing in time.');
}

export async function publishContainer(containerId, c = igConfig()) {
  const res = await graph('POST', `${c.userId}/media_publish`, {creation_id: containerId}, c);
  return res.id;
}

export async function publishingQuota(c = igConfig()) {
  try {
    const r = await graph('GET', `${c.userId}/content_publishing_limit`, {fields: 'quota_usage,config'}, c);
    return r.data?.[0] ?? null;
  } catch (e) {
    return {error: e.message};
  }
}

/** Image container: a carousel item, or a story (media_type STORIES). Images must be public JPEG URLs. */
export async function createImageContainer({imageUrl, carouselItem = false, story = false, caption, c = igConfig()}) {
  if (!imageUrl) throw new Error('imageUrl is required (Instagram fetches images from a public URL).');
  const params = {image_url: imageUrl};
  if (carouselItem) params.is_carousel_item = 'true';
  if (story) params.media_type = 'STORIES';
  if (caption && !carouselItem && !story) params.caption = caption;
  return (await graph('POST', `${c.userId}/media`, params, c)).id;
}

/** Carousel container from 2–10 finished item containers. */
export async function createCarouselContainer({children, caption, c = igConfig()}) {
  if (children.length < 2 || children.length > 10) throw new Error(`a carousel needs 2–10 items (got ${children.length})`);
  return (await graph('POST', `${c.userId}/media`, {media_type: 'CAROUSEL', children: children.join(','), caption}, c)).id;
}
