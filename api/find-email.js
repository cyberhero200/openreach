// Free email finder: no API keys, no paid services.
// Sources (all public): OpenAlex (university domain + ORCID), ORCID public records,
// Europe PMC paper affiliations, free web search (DuckDuckGo, Bing, Mojeek), and the
// professor's own faculty / lab pages. Emails are scored by name + university domain.
import { route, HttpError } from './_lib.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const enc = encodeURIComponent;

async function get(url, { ms = 8000, json = false, headers = {}, method = 'GET', body } = {}) {
  try {
    const r = await fetch(url, {
      method, body, redirect: 'follow', signal: AbortSignal.timeout(ms),
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers },
    });
    if (!r.ok) return null;
    if (json) return await r.json();
    const ct = r.headers.get('content-type') || '';
    if (ct && !/text|html|json|xml/i.test(ct)) return null;
    const buf = await r.arrayBuffer();
    return new TextDecoder().decode(buf.slice(0, 1_500_000));
  } catch { return null; }
}

const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function nameParts(name) {
  const p = norm(name).replace(/\b(prof|professor|dr|phd|md)\b\.?/g, ' ').replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter((x) => x.length > 1);
  return { first: p[0] || '', last: p[p.length - 1] || '', all: p };
}

// ---------- email extraction (handles mailto, entities, Cloudflare protection, [at]/[dot]) ----------
function decodeCf(hex) {
  try { const k = parseInt(hex.slice(0, 2), 16); let s = ''; for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k); return s; }
  catch { return ''; }
}
const EMAIL_RX = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
export function extractEmails(html) {
  const out = new Set();
  let t = String(html || '');
  for (const m of t.matchAll(/data-cfemail="([0-9a-f]+)"/gi)) out.add(decodeCf(m[1]));
  for (const m of t.matchAll(/email-protection#([0-9a-f]+)/gi)) out.add(decodeCf(m[1]));
  t = t.replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
       .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
       .replace(/&commat;/gi, '@').replace(/&period;/gi, '.').replace(/%40/g, '@')
       .replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/\s*(?:\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\}|<\s*at\s*>|\[@\]|\(@\)|\s+\[?at\]?\s+(?=[a-z0-9-]+\s*(?:\.|\[dot\]|\(dot\)|\sdot\s)))\s*/gi, '@')
       .replace(/\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\})\s*/gi, '.');
  for (let i = 0; i < 3; i++) t = t.replace(/(@[a-z0-9-]+(?:\.[a-z0-9-]+)*)\s+dot\s+([a-z0-9-]+)/gi, '$1.$2');
  for (const m of t.matchAll(EMAIL_RX)) out.add(m[0]);
  return [...out]
    .map((e) => e.toLowerCase().replace(/^mailto:/, '').replace(/\.+$/, ''))
    .filter((e) => EMAIL_RX.test(e) && (EMAIL_RX.lastIndex = 0, true))
    .filter((e) => !/\.(png|jpe?g|gif|svg|webp|css|js)$/.test(e) && !/@\d+x\./.test(e) && e.length < 80);
}

const GENERIC = /^(info|contact|admin|admissions?|office|webmaster|web|www|noreply|no-reply|donotreply|support|help|hello|dept|department|enquir(y|ies)|inquir(y|ies)|media|press|news|jobs|careers|hr|privacy|library|registrar|events?|feedback|marketing|example|test|name|email|someone|user|your|yourname|firstname|lastname|first\.?last|abuse|postmaster|secretary|reception|graduate|undergrad|grad|studentservices|itservice|security|sales|editor|editorial|journal|submissions?)$/i;
const FREEMAIL = /^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|qq|163|126|proton(mail)?)\./;

function score(email, np, domain) {
  const [loc, dom] = email.split('@');
  let s = 0;
  if (GENERIC.test(loc) || /^(no|do-?not)reply/.test(loc)) s -= 70;
  if (/example|domain|email\.com|sentry|wixpress|cloudflare|w3\.org|schema\.org/.test(dom)) s -= 80;
  if (/press|media|admin|assist|office|info|contact|lab-?manager|group|team|events|webmaster/.test(loc)) s -= 25;
  const l = loc.replace(/[._-]/g, '');
  if (np.last && np.last.length > 1 && l.includes(np.last)) s += 35;
  else if (np.all.some((x) => x.length > 3 && l.includes(x))) s += 22;
  if (np.first && (l.includes(np.first) || l.startsWith(np.first[0] + np.last) || l === np.first[0] + (np.last[0] || ''))) s += 12;
  if (domain && (dom === domain || dom.endsWith('.' + domain))) s += 35;
  else if (/\.(edu|ac\.[a-z]{2}|edu\.[a-z]{2}|uni-[a-z]+\.de)$/.test(dom) || /(^|\.)(uni|univ|college|inst|tu-)/.test(dom)) s += 12;
  if (FREEMAIL.test(dom)) s -= 5;
  return s;
}

// ---------- free search engines (results + snippets) ----------
async function ddg(q) {
  const html = await get('https://html.duckduckgo.com/html/', { method: 'POST', body: new URLSearchParams({ q, kl: 'us-en' }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!html) return [];
  const res = [];
  const blocks = html.split(/class="result results_links/).slice(1);
  for (const b of blocks) {
    const a = b.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    let u = a[1].replace(/&amp;/g, '&');
    const ud = u.match(/[?&]uddg=([^&]+)/); if (ud) u = decodeURIComponent(ud[1]);
    if (u.startsWith('//')) u = 'https:' + u;
    const sn = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    res.push({ url: u, title: strip(a[2]), snippet: sn ? sn[1] : '' });
  }
  return res;
}
async function bing(q) {
  const html = await get(`https://www.bing.com/search?q=${enc(q)}&setlang=en&cc=US`);
  if (!html) return [];
  const res = [];
  for (const b of html.split(/<li class="b_algo"/).slice(1)) {
    const a = b.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    let u = a[1].replace(/&amp;/g, '&');
    const bu = u.match(/[?&]u=a1([^&]+)/);
    if (bu) { try { u = Buffer.from(bu[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(); } catch {} }
    const sn = b.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    res.push({ url: u, title: strip(a[2]), snippet: sn ? sn[1] : '' });
  }
  return res;
}
async function brave(q) {
  const html = await get(`https://search.brave.com/search?q=${enc(q)}&source=web`);
  if (!html) return [];
  const res = [];
  for (const b of html.split(/data-type="web"/).slice(1)) {
    const a = b.match(/<a[^>]+href="(https?:\/\/[^"]+)"/);
    if (!a || /(^|\.)brave\.com\//.test(a[1])) continue;
    const t = b.match(/class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const sn = b.match(/class="[^"]*(?:snippet-description|generic-snippet|content)[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    res.push({ url: a[1].replace(/&amp;/g, '&'), title: strip(t && t[1]), snippet: sn ? sn[1] : '' });
  }
  return res.slice(0, 12);
}
async function mojeek(q) {
  const html = await get(`https://www.mojeek.com/search?q=${enc(q)}`);
  if (!html) return [];
  const res = [];
  for (const b of html.split(/<li[^>]*class="[^"]*r\d*[^"]*"/).slice(1)) {
    const a = b.match(/<a[^>]+class="ob"[^>]+href="([^"]+)"/) || b.match(/<h2>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const sn = b.match(/<p class="s">([\s\S]*?)<\/p>/);
    res.push({ url: a[1].replace(/&amp;/g, '&'), title: strip(a[2] || ''), snippet: sn ? sn[1] : '' });
  }
  return res;
}

// ---------- scholarly sources ----------
async function openAlexInfo({ openalexId, institution }) {
  const info = { domain: '', orcid: '', instName: institution || '' };
  if (/^A\d+$/.test(openalexId || '')) {
    const a = await get(`https://api.openalex.org/authors/${openalexId}?select=orcid,last_known_institutions`, { json: true });
    if (a) {
      info.orcid = a.orcid || '';
      const inst = a.last_known_institutions?.[0];
      if (inst?.id) {
        info.instName = info.instName || inst.display_name || '';
        const i = await get(`https://api.openalex.org/institutions/${String(inst.id).split('/').pop()}?select=homepage_url`, { json: true });
        if (i?.homepage_url) info.domain = new URL(i.homepage_url).hostname.replace(/^www\d?\./, '');
      }
    }
  }
  if (!info.domain && institution) {
    const s = await get(`https://api.openalex.org/institutions?search=${enc(institution)}&per-page=1&select=homepage_url`, { json: true });
    const hp = s?.results?.[0]?.homepage_url;
    if (hp) { try { info.domain = new URL(hp).hostname.replace(/^www\d?\./, ''); } catch {} }
  }
  // Keep the registrable part (csail.mit.edu → mit.edu, www.ox.ac.uk → ox.ac.uk)
  if (info.domain) {
    const parts = info.domain.split('.');
    const two = /\.(ac|edu|co|org|gov)\.[a-z]{2}$/.test(info.domain);
    info.domain = parts.slice(two ? -3 : -2).join('.');
  }
  return info;
}
async function orcidInfo(orcid) {
  const id = String(orcid || '').replace(/^https?:\/\/orcid\.org\//, '').trim();
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(id)) return { emails: [], urls: [] };
  const j = await get(`https://pub.orcid.org/v3.0/${id}/person`, { json: true, headers: { Accept: 'application/json' } });
  return {
    emails: (j?.emails?.email || []).map((e) => e.email).filter(Boolean),
    urls: (j?.['researcher-urls']?.['researcher-url'] || []).map((u) => u.url?.value).filter(Boolean),
  };
}
async function europePmc(np) {
  if (!np.last) return [];
  const q = `AUTH:"${np.last} ${np.first ? np.first[0] : ''}"`.replace(/\s+"/, '"');
  const j = await get(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${enc(q)}&resultType=core&format=json&pageSize=30`, { json: true, ms: 9000 });
  const found = [];
  for (const r of j?.resultList?.result || []) {
    for (const a of r.authorList?.author || []) {
      if (norm(a.lastName) !== np.last) continue;
      if (np.first && a.firstName && !norm(a.firstName).startsWith(np.first[0])) continue;
      const aff = [a.affiliation, ...(a.authorAffiliationDetailsList?.authorAffiliation || []).map((x) => x.affiliation)].filter(Boolean).join(' ');
      for (const e of extractEmails(aff)) found.push({ email: e, url: r.doi ? `https://doi.org/${r.doi}` : `https://europepmc.org/article/${r.source}/${r.id}`, title: r.title });
    }
  }
  return found;
}

export default route(async (req) => {
  const { name, institution = '', openalexId = '', orcid = '', pageUrl = '' } = req.body || {};
  if (!name || String(name).trim().length < 3) throw new HttpError(400, 'Professor name is required.');
  const np = nameParts(name);
  const cands = new Map(); // email -> {email, score, sources:[{type,url}]}
  const add = (email, type, url, bonus = 0) => {
    const c = cands.get(email) || { email, base: 0, bonus: 0, sources: [] };
    c.bonus = Math.max(c.bonus, bonus);
    if (!c.sources.some((s) => s.url === url)) c.sources.push({ type, url });
    cands.set(email, c);
  };
  const tried = [];

  // Step 1 (parallel): university domain + ORCID, Europe PMC, web search
  const oa = await openAlexInfo({ openalexId, institution });
  const domain = oa.domain;
  const instName = institution || oa.instName;
  const q1 = `"${String(name).trim()}" ${instName} email`;
  const q2 = domain ? `"${np.last}" ${np.first} site:${domain}` : `"${String(name).trim()}" ${instName} faculty`;
  const [orc, pmc, r1, r2, r3] = await Promise.all([
    orcidInfo(orcid || oa.orcid), europePmc(np), ddg(q1), brave(q1), ddg(q2),
  ]);
  tried.push('OpenAlex', 'ORCID', 'Europe PMC', 'DuckDuckGo', 'Brave');
  let results = [...r1, ...r2, ...r3];
  if (results.length < 4) {
    tried.push('Bing', 'Mojeek');
    const [b1, m1] = await Promise.all([bing(q1), mojeek(q1)]);
    results.push(...b1, ...m1);
  }

  orc.emails.forEach((e) => add(e.toLowerCase(), 'ORCID profile', `https://orcid.org/${String(orcid || oa.orcid).split('/').pop()}`, 40));
  pmc.forEach((f) => add(f.email, 'Paper (Europe PMC)', f.url, 25));
  for (const r of results) for (const e of extractEmails(r.snippet)) add(e, 'Search result', r.url, 8);

  // Step 2: read the most promising pages (faculty page, lab site, CV)
  const seen = new Set();
  const pages = [];
  const push = (u, prio) => { try { const x = new URL(u); if (!/^https?:$/.test(x.protocol) || seen.has(x.href)) return; seen.add(x.href); pages.push({ url: x.href, prio }); } catch {} };
  if (pageUrl) push(pageUrl, 100);
  orc.urls.forEach((u) => push(u, 90));
  for (const r of results) {
    let host = ''; try { host = new URL(r.url).hostname; } catch { continue; }
    if (/linkedin|facebook|twitter|x\.com|researchgate|scholar\.google|wikipedia|youtube|instagram|ratemyprofessors|zoominfo|rocketreach|signalhire|contactout/.test(host)) continue;
    const t = norm(r.title + ' ' + r.url);
    let prio = 10;
    if (domain && (host === domain || host.endsWith('.' + domain))) prio += 40;
    if (np.last && t.includes(np.last)) prio += 30;
    if (/people|faculty|staff|profile|directory|person|team|~|lab/.test(r.url)) prio += 10;
    push(r.url, prio);
  }
  pages.sort((a, b) => b.prio - a.prio);
  const top = pages.slice(0, 6);
  const htmls = await Promise.all(top.map((p) => get(p.url, { ms: 8000 })));
  htmls.forEach((html, i) => {
    if (!html) return;
    const p = top[i];
    const title = norm((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const aboutThem = np.last && (title.includes(np.last) || norm(p.url).includes(np.last));
    for (const e of extractEmails(html)) add(e, aboutThem ? 'Their web page' : 'Web page', p.url, aboutThem ? 15 : 0);
  });
  tried.push(`${top.length} web pages`);

  // Score and rank
  const ranked = [...cands.values()]
    .map((c) => ({ ...c, score: score(c.email, np, domain) + c.bonus + Math.min(10, (c.sources.length - 1) * 5) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((c) => ({ email: c.email, score: c.score, confidence: c.score >= 70 ? 'high' : c.score >= 45 ? 'medium' : 'low', source: c.sources[0].type, url: c.sources[0].url }));
  const best = ranked[0] && ranked[0].score >= 40 ? ranked[0] : null;
  return { best, candidates: ranked, domain, tried };
});
