// Saves / loads the user's OpenReach data as one message under a private "OpenReach" label
// in their own Gmail. No database needed, and it follows them to any device.
import { creds, withImap, route, HttpError } from './_lib.js';

const BOX = 'OpenReach';
const FILE = 'openreach.json';

export default route(async (req) => {
  const c = creds(req);
  const { action, data } = req.body || {};
  const { default: MailComposer } = await import('nodemailer/lib/mail-composer');
  const { simpleParser } = await import('mailparser');
  if (!['pull', 'push'].includes(action)) throw new HttpError(400, 'Unknown action.');

  return withImap(c, async (client) => {
    const boxes = await client.list();
    if (!boxes.some(b => b.path === BOX)) {
      if (action === 'pull') return { data: null };
      await client.mailboxCreate(BOX);
    }
    const trash = boxes.find(b => b.specialUse === '\\Trash')?.path;
    const lock = await client.getMailboxLock(BOX);
    try {
      if (action === 'push') {
        if (!data || typeof data !== 'object') throw new HttpError(400, 'Nothing to save.');
        const raw = await new MailComposer({
          from: c.user, to: c.user,
          subject: 'OpenReach saved data (please keep)',
          text: 'This message stores your OpenReach profile, drafts and history. Deleting it erases them from your account.',
          attachments: [{ filename: FILE, content: JSON.stringify(data), contentType: 'application/json' }],
        }).compile().build();
        const res = await client.append(BOX, raw, ['\\Seen']);
        const all = (await client.search({ all: true }, { uid: true })) || [];
        const old = all.filter(u => !res?.uid || u !== res.uid);
        if (res?.uid && old.length) {
          if (trash) await client.messageMove(old, trash, { uid: true }).catch(() => {});
          else await client.messageDelete(old, { uid: true }).catch(() => {});
        }
        return { ok: true };
      }
      const all = (await client.search({ all: true }, { uid: true })) || [];
      if (!all.length) return { data: null };
      const msg = await client.fetchOne(String(Math.max(...all)), { source: true }, { uid: true });
      const parsed = await simpleParser(msg.source);
      const att = parsed.attachments?.find(a => a.filename === FILE);
      return { data: att ? JSON.parse(att.content.toString('utf8')) : null };
    } finally { lock.release(); }
  });
});
