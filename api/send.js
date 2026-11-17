// Sends ONE email the user reviewed, from their own Gmail (it also lands in their Sent folder).
import { creds, withSmtp, route, HttpError, EMAIL_RE } from './_lib.js';

export default route(async (req) => {
  const c = creds(req);
  const { to, subject, text, fromName, attachment, inReplyTo, references } = req.body || {};
  const rcpt = String(to || '').trim();
  if (!EMAIL_RE.test(rcpt)) throw new HttpError(400, 'Recipient email looks wrong.');
  if (!String(subject || '').trim() || !String(text || '').trim()) throw new HttpError(400, 'Subject and message cannot be empty.');

  const attachments = [];
  if (attachment?.b64) {
    attachments.push({
      filename: String(attachment.name || 'CV.pdf').replace(/[^\w.\- ]/g, '_'),
      content: attachment.b64, encoding: 'base64',
      contentType: attachment.type || 'application/pdf',
    });
  }

  const info = await withSmtp(c, (t) => t.sendMail({
    from: fromName ? { name: String(fromName).slice(0, 80), address: c.user } : c.user,
    to: rcpt,
    subject: String(subject).slice(0, 300),
    text: String(text),
    inReplyTo: inReplyTo || undefined,
    references: references || undefined,
    attachments,
  }));
  if (!info.accepted?.length) throw new HttpError(502, 'Gmail did not accept the recipient: ' + (info.rejected || []).join(', '));
  return { ok: true, messageId: info.messageId };
});
