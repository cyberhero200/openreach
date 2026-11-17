// Self-test: confirms the server functions are deployed and every library loads.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const libs = {};
  for (const [name, load] of [
    ['nodemailer', () => import('nodemailer')],
    ['imapflow', () => import('imapflow')],
    ['mailparser', () => import('mailparser')],
    ['mail-composer', () => import('nodemailer/lib/mail-composer')],
  ]) {
    try { await load(); libs[name] = 'ok'; } catch (e) { libs[name] = 'FAILED: ' + String(e?.message || e).slice(0, 200); }
  }
  const ok = Object.values(libs).every((v) => v === 'ok');
  res.status(ok ? 200 : 500).json({ ok, node: process.version, region: process.env.VERCEL_REGION || 'local', libs, time: new Date().toISOString() });
}
