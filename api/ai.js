// Relays AI requests for providers that block calls straight from the browser (CORS).
// Only well-known AI APIs are allowed, so this can't be used as an open proxy.
// The user's API key passes through and is never stored or logged.
import { route, HttpError } from './_lib.js';

const ALLOWED = new Set([
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'openrouter.ai',
  'api.cerebras.ai',
  'api.mistral.ai',
  'api.deepseek.com',
  'api.openai.com',
  'api.together.xyz',
  'api.fireworks.ai',
]);

export default route(async (req) => {
  const { url, method = 'POST', headers = {}, body } = req.body || {};
  let u;
  try { u = new URL(url); } catch { throw new HttpError(400, 'Bad AI URL.'); }
  if (u.protocol !== 'https:' || !ALLOWED.has(u.hostname)) throw new HttpError(400, 'This AI provider is not supported by the relay.');

  const h = { 'Content-Type': 'application/json' };
  if (headers.Authorization) h.Authorization = String(headers.Authorization);
  if (u.hostname === 'openrouter.ai') { h['HTTP-Referer'] = req.headers.origin || 'https://openreach.vercel.app'; h['X-Title'] = 'OpenReach'; }

  const isGet = String(method).toUpperCase() === 'GET';
  const r = await fetch(u, { method: isGet ? 'GET' : 'POST', headers: h, body: isGet ? undefined : JSON.stringify(body || {}), signal: AbortSignal.timeout(55000) });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: text.slice(0, 300) || `HTTP ${r.status}` }; }
  return { status: r.status, body: json };
});
