// Shared helpers for the Gmail serverless functions.
// Files starting with "_" are not exposed as routes by Vercel.
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/;

// Gmail address + 16-letter App Password sent by the browser with each request.
// Nothing is stored on the server.
export function creds(req) {
  const { email, appPassword } = req.body || {};
  const user = String(email || '').trim().toLowerCase();
  const pass = String(appPassword || '').replace(/\s+/g, '');
  if (!EMAIL_RE.test(user) || !pass) throw new HttpError(400, 'Missing Gmail address or App Password.');
  return { user, pass };
}

export function smtp({ user, pass }) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user, pass },
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 25000,
  });
}

export async function withImap({ user, pass }, fn) {
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user, pass }, logger: false,
  });
  await client.connect();
  try { return await fn(client); }
  finally { await client.logout().catch(() => {}); }
}

function friendly(e) {
  const t = String(e?.responseText || e?.response || e?.message || e);
  if (e?.authenticationFailed || /535|Username and Password not accepted|AUTHENTICATIONFAILED|Invalid credentials|Application-specific password required/i.test(t))
    return { status: 401, error: 'Gmail did not accept the login. Use your full Gmail address and a 16-letter App Password, not your normal password.' };
  if (/Daily user sending limit|5\.4\.5/i.test(t))
    return { status: 429, error: 'Gmail daily sending limit reached. Try again tomorrow.' };
  if (/ETIMEDOUT|ECONNRESET|timeout/i.test(t))
    return { status: 504, error: 'Gmail took too long to answer. Try again in a moment.' };
  return { status: e?.status || 500, error: t.slice(0, 300) };
}

export function route(fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }
    try { res.status(200).json(await fn(req)); }
    catch (e) { const f = friendly(e); res.status(f.status).json({ error: f.error }); }
  };
}
