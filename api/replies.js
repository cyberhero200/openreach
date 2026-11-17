// Looks in the user's inbox ONLY for messages from the professors they emailed.
import { creds, withImap, route, EMAIL_RE } from './_lib.js';

function cleanReply(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const out = [];
  for (const l of lines) {
    // Stop at the quoted original ("On Mon, ... wrote:" or "-----Original Message-----").
    if (/^On .{5,200}wrote:\s*$/i.test(l.trim()) || /^-{2,}\s*Original Message/i.test(l.trim())) break;
    if (/^>/.test(l)) continue;
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 5000);
}

export default route(async (req) => {
  const c = creds(req);
  const { simpleParser } = await import('mailparser');
  const addresses = [...new Set((req.body?.addresses || [])
    .map(a => String(a).trim().toLowerCase()).filter(a => EMAIL_RE.test(a)))].slice(0, 300);
  if (!addresses.length) return { replies: [] };
  const since = new Date(Number(req.body?.since) || Date.now() - 90 * 864e5);
  const after = `${since.getFullYear()}/${since.getMonth() + 1}/${since.getDate()}`;

  return withImap(c, async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = new Set();
      for (let i = 0; i < addresses.length; i += 30) {
        const chunk = addresses.slice(i, i + 30);
        const found = await client.search({ gmraw: `from:(${chunk.join(' OR ')}) after:${after}` }, { uid: true });
        (found || []).forEach(u => uids.add(u));
      }
      const pick = [...uids].sort((a, b) => a - b).slice(-40);
      const replies = [];
      if (pick.length) {
        for await (const m of client.fetch(pick, { source: true, internalDate: true }, { uid: true })) {
          const p = await simpleParser(m.source);
          const from = (p.from?.value?.[0]?.address || '').toLowerCase();
          if (!addresses.includes(from)) continue;
          replies.push({
            from, fromName: p.from?.value?.[0]?.name || '',
            subject: p.subject || '',
            date: (p.date || m.internalDate || new Date()).toISOString(),
            messageId: p.messageId || '',
            text: cleanReply(p.text || ''),
          });
        }
      }
      return { replies };
    } finally { lock.release(); }
  });
});
