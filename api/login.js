// Checks that the Gmail address + App Password work, without sending anything.
import { creds, withSmtp, route } from './_lib.js';

export default route(async (req) => {
  const c = creds(req);
  await withSmtp(c, (t) => t.verify());
  return { ok: true, email: c.user };
});
