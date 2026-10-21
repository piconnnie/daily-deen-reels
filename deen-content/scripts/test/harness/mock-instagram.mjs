#!/usr/bin/env node
// Mock Instagram Graph API for workflow tests. Writes its port to argv[2] and
// logs every request to argv[3] (JSON lines). Serves HEAD /assets/<file> from
// the fake release folders so URL-mode publishing can be exercised.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [portFile, logFile] = process.argv.slice(2);
const relDir = process.env.GH_FAKE_RELEASES;
let polls = 0;
let mediaCount = 0;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const params = Object.fromEntries(new URLSearchParams(body));
    fs.appendFileSync(logFile, JSON.stringify({method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), params, bytes: body.length}) + '\n');
    const json = (o, s = 200) => {
      res.writeHead(s, {'content-type': 'application/json'});
      res.end(JSON.stringify(o));
    };
    if (url.pathname.startsWith('/assets/')) {
      const file = path.basename(url.pathname);
      const hit = fs.existsSync(relDir) && fs.readdirSync(relDir).some((t) => fs.existsSync(path.join(relDir, t, file)));
      res.writeHead(hit ? 200 : 404);
      return res.end();
    }
    if (url.pathname === '/refresh_access_token') return json({access_token: 'REFRESHED_TOKEN', token_type: 'bearer', expires_in: 5184000});
    const p = url.pathname.replace(/^\/v[\d.]+/, '');
    if (p === '/me') return json({user_id: 'IGID', username: 'dailydeenreminders', account_type: 'MEDIA_CREATOR'});
    if (p === '/IGID/content_publishing_limit') return json({data: [{quota_usage: mediaCount, config: {quota_total: 100}}]});
    if (p === '/IGID/media' && req.method === 'POST') return json({id: `c${mediaCount + 1}`});
    if (/^\/c\d+$/.test(p)) return json({status_code: ++polls % 2 === 0 ? 'FINISHED' : 'IN_PROGRESS'});
    if (p === '/IGID/media_publish') {
      mediaCount++;
      return json({id: `m${mediaCount}`});
    }
    if (/^\/m\d+$/.test(p)) return json({permalink: `https://www.instagram.com/reel/TEST${p.slice(2)}/`});
    if (/^\/m\d+\/insights$/.test(p)) {
      const values = {reach: 1840, saved: 61, shares: 23, views: 3120, comments: 9, ig_reels_avg_watch_time: 11800};
      const m = url.searchParams.get('metric');
      if (!(m in values)) return json({error: {message: `(#100) metric[0] must be one of the following values: reach, saved... (${m} does not support this)`, code: 100}}, 400);
      return json({data: [{name: m, values: [{value: values[m]}]}]});
    }
    json({error: {message: `mock: unexpected ${req.method} ${url.pathname}`, code: 1}}, 400);
  });
});
server.listen(0, '127.0.0.1', () => fs.writeFileSync(portFile, String(server.address().port)));
