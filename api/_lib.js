// Shared helpers for the Gmail serverless functions.
// Files starting with "_" are not exposed as routes by Vercel.
import nodemailer from 'nodemailer';

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

function transport({ user, pass }, port) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com', port, secure: port === 465, requireTLS: port !== 465,
    auth: { user, pass },
    connectionTimeout: 15000, greetingTimeout: 12000, socketTimeout: 30000,
  });
}
const isNetErr = (e) => /ETIMEDOUT|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|timeout|socket/i.test(String(e?.code || '') + ' ' + String(e?.message || ''));

// Runs an SMTP action on port 465 (SSL); if the network blocks it, retries on 587 (STARTTLS).
export async function withSmtp(c, fn) {
  try { return await fn(transport(c, 465)); }
  catch (e) { if (!isNetErr(e)) throw e; console.warn('SMTP 465 failed, trying 587:', e.code || e.message); return fn(transport(c, 587)); }
}
export const smtp = (c) => transport(c, 465);

export async function withImap({ user, pass }, fn) {
  const { ImapFlow } = await import('imapflow');
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
  if (/\b421\b|\b454\b|4\.7\.0|temporar|try again later|too many/i.test(t) && !/5\.4\.5/.test(t))
    return { status: 429, error: 'Gmail is temporarily limiting sending. Try again in a few minutes.' };
  if (/Daily user sending limit|5\.4\.5/i.test(t))
    return { status: 429, error: 'Gmail daily sending limit reached. Try again tomorrow.' };
  if (/ETIMEDOUT|ECONNRESET|ECONNREFUSED|timeout/i.test(t + ' ' + (e?.code || '')))
    return { status: 504, error: 'Could not reach Gmail from the server (network timeout). Try again in a moment.' };
  if (/IMAP access is disabled|Web login required|WEBALERT|Please log in via your web browser/i.test(t))
    return { status: 403, error: 'Google blocked the sign-in as unusual. Open gmail.com in your browser, confirm it was you, then try again.' };
  return { status: e?.status || 500, error: t.slice(0, 300) };
}

export function route(fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }
    try { res.status(200).json(await fn(req)); }
    catch (e) {
      const f = friendly(e);
      if (f.status >= 500) console.error(`[${req.url}]`, e?.code || '', e?.responseText || e?.response || e?.stack || e);
      res.status(f.status).json({ error: f.error });
    }
  };
}
