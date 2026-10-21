// Minimal Claude Messages API client (no SDK dependency).
// Handles retries on 429/5xx/overloaded, server-tool `pause_turn`
// continuation (web search), and extracts text + cited source URLs.
// Docs: https://platform.claude.com/docs/en/api/messages
const API = 'https://api.anthropic.com/v1/messages';
export const DEFAULT_MODEL = process.env.DEEN_MODEL || 'claude-opus-5-5';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(body, attempt = 0) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set.');
  const res = await fetch(API, {
    method: 'POST',
    headers: {'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (res.ok) return res.json();
  const text = await res.text();
  const retriable = res.status === 429 || res.status === 529 || res.status >= 500;
  if (retriable && attempt < 5) {
    const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * 2 ** attempt;
    console.warn(`Claude API ${res.status}; retrying in ${Math.round(wait / 1000)}s`);
    await sleep(wait);
    return post(body, attempt + 1);
  }
  throw new Error(`Claude API ${res.status}: ${text.slice(0, 800)}`);
}

/**
 * @param {object} o
 * @param {Array|string} o.system   system prompt (string or content blocks)
 * @param {Array} o.messages        conversation
 * @param {boolean} [o.webSearch]   enable the web search server tool
 * @param {number} [o.maxSearches]
 * @param {number} [o.maxTokens]
 * @param {string} [o.effort]       low | medium | high
 */
export async function ask({system, messages, webSearch = false, maxSearches = 6, maxTokens = 16000, effort, model = DEFAULT_MODEL}) {
  // Offline test mode: DEEN_MOCK_DRAFT=<file> returns that file as the writer's
  // draft and a passing critic verdict. Used for pipeline dry runs without an API key.
  if (process.env.DEEN_MOCK_DRAFT) {
    const fs = await import('node:fs');
    const first = typeof messages[0]?.content === 'string' ? messages[0].content : '';
    const zero = {input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, web_search_requests: 0};
    if (first.startsWith('Act as a demanding editor')) {
      return {text: JSON.stringify({scores: {hook: 4, insight: 4, accuracy: 5, intrigue: 4, clarity: 4, brandFit: 5}, verdict: 'pass', mustFix: [], niceToHave: ['(mock critic)']}), sources: [], usage: zero};
    }
    return {text: fs.readFileSync(process.env.DEEN_MOCK_DRAFT, 'utf8'), sources: [], usage: zero};
  }
  const body = {model, max_tokens: maxTokens, system, messages: [...messages]};
  if (effort) body.output_config = {effort};
  if (webSearch) body.tools = [{type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches}];

  let res;
  let usage = {input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, web_search_requests: 0};
  const allContent = [];
  for (let turn = 0; turn < 6; turn++) {
    res = await post(body);
    usage.input_tokens += res.usage?.input_tokens ?? 0;
    usage.output_tokens += res.usage?.output_tokens ?? 0;
    usage.cache_read_input_tokens += res.usage?.cache_read_input_tokens ?? 0;
    usage.web_search_requests += res.usage?.server_tool_use?.web_search_requests ?? 0;
    allContent.push(...res.content);
    if (res.stop_reason !== 'pause_turn') break;
    // Long server-tool turn paused: send the assistant content back unchanged.
    body.messages = [...body.messages, {role: 'assistant', content: res.content}];
  }
  if (res.stop_reason === 'refusal') throw new Error('Claude declined this request (stop_reason: refusal).');
  if (res.stop_reason === 'max_tokens') throw new Error('Claude response hit max_tokens; increase maxTokens.');

  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const sources = [];
  for (const b of allContent) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) if (r.url) sources.push({url: r.url, title: r.title, pageAge: r.page_age ?? null});
    }
  }
  return {text, sources, usage, raw: res};
}

/** Extracts the first top-level JSON object from model text. */
export function parseJsonObject(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object found in model output.');
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Rough cost estimate in USD for logging (prices from the models overview page). */
export function estimateCost(usage, model = DEFAULT_MODEL) {
  const price = {
    'claude-fable-5-1': [10, 50],
    'claude-opus-5-5': [4, 20],
    'claude-sonnet-5-5': [2, 10],
  }[model] ?? [4, 20];
  return (
    ((usage.input_tokens - (usage.cache_read_input_tokens ?? 0)) * price[0] + (usage.cache_read_input_tokens ?? 0) * price[0] * 0.05 + usage.output_tokens * price[1]) / 1e6 +
    (usage.web_search_requests ?? 0) * 0.01
  );
}
