// Checks that the Gmail address + App Password work, without sending anything.
import { creds, smtp, route } from './_lib.js';

export default route(async (req) => {
  const c = creds(req);
  await smtp(c).verify();
  return { ok: true, email: c.user };
});
