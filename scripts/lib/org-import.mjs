/**
 * scripts/lib/org-import.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * The logic behind scripts/import-organizations.mjs, kept free of Firebase so it can be tested
 * and so a dry run needs no credentials.
 *
 * What it does with a published dataset you downloaded yourself:
 *   parse      ROR (research organizations: universities, hospitals), CMS Hospital General
 *              Information (US hospitals) or a CSV you prepared from another reliable source
 *   clean      names, https-only websites, location, category-specific facts
 *   dedupe     inside the file and against what is already in BeWatu, conservatively: when two
 *              records MIGHT be the same organization they are held back for a person to look at,
 *              never created as a duplicate and never merged by guesswork
 *   merge      into an existing record it only FILLS EMPTY FIELDS. It never changes a name,
 *              description, logo, owner, claim state, verification or follower count.
 *
 * It never invents anything: no descriptions, no logos, no employee counts, no ratings. A fact
 * the source does not state is simply absent. Every record names its source.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

// ── model (mirrors lib/organizations.ts; test/org-import checks they agree) ──
export const ORG_TYPES = ['business', 'college_university', 'hospital', 'health_system', 'research_institute', 'nonprofit', 'government', 'other'];
const PROFILE_KEYS = new Set(['control', 'established', 'enrollment', 'campusSetting', 'accreditation', 'facilityType', 'ownership', 'beds', 'emergencyServices', 'starRating', 'employeeRange', 'regulatoryStatus', 'sicDescription', 'exchange']);

const clean = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const slug = (v) => clean(v, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

export function normalizeName(name) {
  return clean(name, 200).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/^the /, '').replace(/\s+/g, ' ').trim();
}

// ── CSV (RFC 4180: quotes, embedded commas, quotes and newlines) ──
export function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  const src = String(text).replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(field); field = ''; if (row.some(c => c !== '')) rows.push(row); row = []; }
    else field += ch;
  }
  row.push(field); if (row.some(c => c !== '')) rows.push(row);
  if (rows.length === 0) return [];
  const head = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]+/g, ''));
  return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// ── websites ──
/** Only a well-formed web address with a real-looking host. http is upgraded to https only when `upgradeHttp`. */
export function cleanWebsite(raw, { upgradeHttp = false } = {}) {
  const v = clean(raw, 300);
  if (!v) return { url: '', domain: '', reason: '' };
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`); } catch { return { url: '', domain: '', reason: 'not a valid address' }; }
  if (u.username || u.password) return { url: '', domain: '', reason: 'contains credentials' };
  if (u.protocol === 'http:' && !upgradeHttp) return { url: '', domain: '', reason: 'http only (checked with --check-websites)' };
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { url: '', domain: '', reason: 'not a web address' };
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || net.isIP(host) || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return { url: '', domain: '', reason: 'not a public host' };
  const path = u.pathname === '/' ? '/' : u.pathname.replace(/\/+$/, '');
  return { url: `https://${host}${path}`, domain: host.replace(/^www\./, ''), reason: '' };
}

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^22[4-9]\.|^2[3-5]\d\./];
export function isPublicIp(ip) {
  if (net.isIPv4(ip)) return !PRIVATE_V4.some(r => r.test(ip));
  const l = ip.toLowerCase();
  if (l === '::1' || l === '::' || l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb') || l.startsWith('fc') || l.startsWith('fd')) return false;
  const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); if (m) return isPublicIp(m[1]);
  return true;
}

/** Does the site answer? Public hosts only (every redirect re-checked), short timeouts. Returns { ok, url, reason }. */
export async function checkWebsite(url, { timeoutMs = 8000, fetchImpl = fetch, resolve = lookup } = {}) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    let u; try { u = new URL(current); } catch { return { ok: false, reason: 'bad address' }; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'redirected somewhere that is not a web page' };
    try {
      const addrs = await resolve(u.hostname, { all: true });
      if (!addrs.length || addrs.some(a => !isPublicIp(a.address))) return { ok: false, reason: 'does not resolve to a public address' };
    } catch { return { ok: false, reason: 'domain does not exist' }; }
    let res;
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        res = await fetchImpl(current, { method: 'HEAD', redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': 'BeWatuDirectoryCheck/1.0 (+https://www.bewatu.com)' } });
        if (res.status === 405 || res.status === 501) res = await fetchImpl(current, { method: 'GET', redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': 'BeWatuDirectoryCheck/1.0 (+https://www.bewatu.com)' } });
      } finally { clearTimeout(t); }
    } catch (e) { return { ok: false, reason: e?.name === 'AbortError' ? 'timed out' : 'could not connect' }; }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location'); if (!loc) return { ok: false, reason: 'redirect without a destination' };
      current = new URL(loc, current).toString(); continue;
    }
    // 401/403/429: the site is there but declines automated visitors. That still shows the address is real.
    if (res.status < 400 || [401, 403, 429].includes(res.status)) return { ok: true, reason: '' };
    return { ok: false, reason: `answered ${res.status}` };
  }
  return { ok: false, reason: 'too many redirects' };
}

// ── adapters: file text → candidates ──
/** A candidate is everything we would store, plus where it came from. */
function candidate(o) {
  return {
    name: clean(o.name, 120), organizationType: o.organizationType, industry: clean(o.industry, 60),
    subindustries: (o.subindustries ?? []).map(x => clean(x, 50)).filter(Boolean).slice(0, 8),
    description: clean(o.description, 600), websiteRaw: o.website ?? '',
    location: { city: clean(o.location?.city, 60), region: clean(o.location?.region, 60), country: clean(o.location?.country, 60), countryCode: clean(o.location?.countryCode, 3).toUpperCase() },
    profile: o.profile ?? {}, parentSourceId: o.parentSourceId ?? '', sourceId: clean(o.sourceId, 80),
    source: { name: o.source.name, url: o.source.url, key: o.source.key }, hint: o.hint ?? '',
  };
}

const HEALTH_SYSTEM_RE = /\b(health\s*(system|network|partners|alliance)|healthcare\s*(system|network)|medical\s*(system|network|group))\b/i;

/** ROR v2 data dump (JSON array). Education → college/university, healthcare → hospital or health system, as asked. */
export function parseRor(text, { types = ['education', 'healthcare'] } = {}) {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('A ROR file is a JSON array of records.');
  const out = []; const skipped = [];
  for (const r of data) {
    const types_ = Array.isArray(r.types) ? r.types : [];
    const kind = types_.find(t => types.includes(t));
    const id = clean(r.id, 80).replace(/^https?:\/\/ror\.org\//, '').toLowerCase();
    if (!kind || !id) continue;
    if (r.status && r.status !== 'active') { skipped.push({ name: '(inactive)', reason: `ROR status is ${r.status}`, sourceId: id }); continue; }
    const display = (r.names ?? []).find(n => (n.types ?? []).includes('ror_display')) ?? (r.names ?? []).find(n => (n.types ?? []).includes('label')) ?? (r.names ?? [])[0];
    const name = clean(display?.value, 120);
    if (!name) continue;
    const g = (r.locations ?? [])[0]?.geonames_details ?? {};
    const site = (r.links ?? []).find(l => l.type === 'website')?.value ?? '';
    const parent = (r.relationships ?? []).find(x => x.type === 'parent');
    const established = Number(r.established);
    const isEdu = kind === 'education';
    out.push(candidate({
      name, organizationType: isEdu ? 'college_university' : HEALTH_SYSTEM_RE.test(name) ? 'health_system' : 'hospital',
      industry: isEdu ? 'Higher Education' : 'Healthcare', website: site,
      location: { city: g.name, region: g.country_subdivision_name, country: g.country_name, countryCode: g.country_code },
      profile: Number.isFinite(established) && established >= 600 ? { established } : {},
      parentSourceId: parent ? clean(parent.id, 80).replace(/^https?:\/\/ror\.org\//, '').toLowerCase() : '', sourceId: id,
      source: { name: 'Research Organization Registry (ROR)', url: `https://ror.org/${id}`, key: 'ror' },
      hint: isEdu ? '' : 'type inferred from the name (hospital vs health system)',
    }));
  }
  return { candidates: out, skipped };
}

/** CMS "Hospital General Information" CSV (data.cms.gov/provider-data). United States hospitals. */
export function parseCms(text) {
  const rows = parseCsv(text); const out = []; const skipped = [];
  for (const r of rows) {
    const id = clean(r.facilityid ?? r.providerid ?? r.cmscertificationnumberccn, 20);
    const name = clean(r.facilityname ?? r.hospitalname, 120);
    if (!id || !name) { skipped.push({ name: name || '(no name)', reason: 'missing facility id or name', sourceId: id }); continue; }
    const rating = Number(r.hospitaloverallrating);
    const em = clean(r.emergencyservices, 5).toLowerCase();
    out.push(candidate({
      name: titleCaseIfShouting(name), organizationType: 'hospital', industry: 'Healthcare',
      location: { city: titleCaseIfShouting(clean(r.citytown ?? r.city, 60)), region: clean(r.state, 2).toUpperCase(), country: 'United States', countryCode: 'US' },
      profile: {
        facilityType: clean(r.hospitaltype, 80), ownership: clean(r.hospitalownership, 80),
        ...(em === 'yes' || em === 'no' ? { emergencyServices: em === 'yes' ? 'Yes' : 'No' } : {}),
        ...(Number.isInteger(rating) && rating >= 1 && rating <= 5 ? { starRating: rating } : {}),
      },
      sourceId: id, source: { name: 'CMS Hospital General Information', url: 'https://data.cms.gov/provider-data/topics/hospitals', key: 'cms' },
    }));
  }
  return { candidates: out, skipped };
}

function titleCaseIfShouting(s) {
  if (!s || s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_, a, b) => a + b.toUpperCase())
    .replace(/\b(Llc|Lp|Llp|Usa|Va|Uc|Ucla|Ut|Nyu|Mc|Md|Icu|Er)\b/g, m => m.toUpperCase());
}

/** Your own CSV from a reliable source. Columns: name, organization_type, industry, subindustries (; separated), website,
 *  city, region, country, country_code, description, source_id, parent_source_id, profile_<field>. */
export function parseGeneric(text, { sourceName, sourceUrl }) {
  if (!sourceName) throw new Error('--source-name is required for a CSV: say where the data comes from.');
  const su = cleanWebsite(sourceUrl, { upgradeHttp: false });
  if (!su.url) throw new Error('--source-url must be an https address of the dataset or publisher.');
  const out = []; const skipped = [];
  for (const r of parseCsv(text)) {
    const name = clean(r.name, 120);
    if (!name) { skipped.push({ name: '(no name)', reason: 'missing name' }); continue; }
    const t = clean(r.organizationtype ?? r.type, 40).toLowerCase().replace(/[\s-]+/g, '_');
    if (!ORG_TYPES.includes(t)) { skipped.push({ name, reason: `organization_type must be one of ${ORG_TYPES.join(', ')}` }); continue; }
    const profile = {};
    for (const [k, v] of Object.entries(r)) {
      if (!k.startsWith('profile') || !v) continue;
      const key = [...PROFILE_KEYS].find(x => x.toLowerCase() === k.slice(7));
      if (key) profile[key] = /^\d+(\.\d+)?$/.test(v) ? Number(v) : clean(v, 120);
    }
    out.push(candidate({
      name, organizationType: t, industry: r.industry, subindustries: clean(r.subindustries, 200).split(';'), description: r.description,
      website: r.website, location: { city: r.city, region: r.region, country: r.country, countryCode: r.countrycode },
      profile, sourceId: r.sourceid, parentSourceId: r.parentsourceid, source: { name: clean(sourceName, 60), url: su.url, key: slug(sourceName) || 'import' },
    }));
  }
  return { candidates: out, skipped };
}

// ── ids ──
export function orgId(c) {
  const key = c.source.key;
  if (c.sourceId) return `org_${key}_${slug(c.sourceId) || createHash('sha1').update(c.sourceId).digest('hex').slice(0, 12)}`.slice(0, 120);
  const h = createHash('sha1').update([normalizeName(c.name), c.location.country, c.location.city].join('|')).digest('hex').slice(0, 16);
  return `org_${key}_${h}`;
}

// ── the plan ──
/**
 * Decide, for every candidate, whether to create it, merge it into an existing record, hold it for review or skip it.
 * `existing`: [{ id, name, domain, city, country, directorySource: {name,id}|null, hasAdmin }]
 */
export function plan(candidates, existing = [], { websiteStatus = new Map(), max = Infinity } = {}) {
  const result = { create: [], merge: [], review: [], skipped: [], websiteDropped: [] };
  const byNorm = new Map();   // normalized name → records (existing and accepted)
  const byDomain = new Map();
  const bySource = new Map();
  const add = (map, k, v) => { if (!k) return; const l = map.get(k) ?? []; l.push(v); map.set(k, l); };
  const regOf = (e) => ({ id: e.id, name: e.name, norm: normalizeName(e.name), domain: e.domain ?? '', city: clean(e.city, 60).toLowerCase(), country: clean(e.country, 60).toLowerCase(), existing: true, hasAdmin: !!e.hasAdmin });
  for (const e of existing) {
    const r = regOf(e);
    add(byNorm, r.norm, r); add(byDomain, r.domain, r);
    if (e.directorySource?.name && e.directorySource?.id) bySource.set(`${e.directorySource.name}|${e.directorySource.id}`, r);
  }

  for (const c0 of candidates) {
    const c = { ...c0 };
    if (!c.name || !ORG_TYPES.includes(c.organizationType)) { result.skipped.push({ name: c.name || '(no name)', reason: 'missing name or type', sourceId: c.sourceId }); continue; }
    // website: syntax first, then (if checked) whether the site answers
    const w0 = cleanWebsite(c.websiteRaw, { upgradeHttp: websiteStatus.size > 0 });
    let website = w0.url, domain = w0.domain;
    if (c.websiteRaw && !website) result.websiteDropped.push({ name: c.name, site: clean(c.websiteRaw, 120), reason: w0.reason });
    if (website && websiteStatus.size > 0) {
      const st = websiteStatus.get(website);
      if (st && !st.ok) { result.websiteDropped.push({ name: c.name, site: website, reason: st.reason }); website = ''; domain = ''; }
    }
    const id = orgId(c);
    const doc = {
      id, name: c.name, organizationType: c.organizationType, industry: c.industry, subindustries: c.subindustries, description: c.description,
      website, domain, location: c.location, profile: c.profile, parentSourceId: c.parentSourceId, sourceId: c.sourceId, source: c.source, hint: c.hint,
      norm: normalizeName(c.name), city: c.location.city.toLowerCase(), country: c.location.country.toLowerCase(),
    };

    // 1. the very same source record: this is the record we already hold
    const same = bySource.get(`${c.source.name}|${c.sourceId}`);
    if (c.sourceId && same) { same.existing ? result.merge.push({ ...doc, id: same.id }) : result.skipped.push({ name: c.name, reason: 'appears twice in this file', sourceId: c.sourceId }); continue; }

    // Records about an organization "somewhere else" (both cities known and different) are different organizations:
    // two Memorial Hospitals in two cities may share a parent website.
    const elsewhere = (p) => !!(p.city && doc.city && (p.city !== doc.city || p.country !== doc.country));
    const near = (byNorm.get(doc.norm) ?? []).filter(p => !elsewhere(p));
    const swallow = (p, why) => { p.existing ? result.merge.push({ ...doc, id: p.id }) : result.skipped.push({ name: c.name, reason: `duplicate of another record in this file (${why})`, sourceId: c.sourceId }); };
    // 2. same name and same website
    const strong = domain ? near.find(p => p.domain && p.domain === domain) : undefined;
    if (strong) { swallow(strong, 'same name and website'); continue; }
    // 3. same name in the same city
    const place = doc.city ? near.find(p => p.city === doc.city && p.country === doc.country) : undefined;
    if (place) { swallow(place, 'same name and city'); continue; }
    // 4. might be the same organization and nothing settles it: a person decides, nothing is created or merged
    if (near.length > 0) { result.review.push({ name: c.name, reason: 'same name as an existing record, and the place or website does not settle whether it is the same organization', sourceId: c.sourceId, matches: near.map(p => p.id) }); continue; }
    const sameSite = domain ? (byDomain.get(domain) ?? []).find(p => p.norm !== doc.norm && !elsewhere(p)) : undefined;
    if (sameSite) { result.review.push({ name: c.name, reason: `shares the website ${domain} with "${sameSite.name}" under a different name`, sourceId: c.sourceId, matches: [sameSite.id] }); continue; }

    if (result.create.length >= max) { result.skipped.push({ name: c.name, reason: `over the --max-create limit of ${max}`, sourceId: c.sourceId }); continue; }
    const reg = { id, name: c.name, norm: doc.norm, domain, city: doc.city, country: doc.country, existing: false };
    add(byNorm, reg.norm, reg); add(byDomain, reg.domain, reg); if (c.sourceId) bySource.set(`${c.source.name}|${c.sourceId}`, reg);
    result.create.push(doc);
  }
  return result;
}

/** The document for a new organization. Nothing here is made up; everything is from the record or the source's own name. */
export function toNewDoc(p, now, parentIdFor = () => '') {
  const profile = {};
  for (const [k, v] of Object.entries(p.profile ?? {})) if (PROFILE_KEYS.has(k) && v !== '' && v != null) profile[k] = v;
  return {
    name: p.name, organizationType: p.organizationType, industry: p.industry, subindustries: p.subindustries,
    description: p.description, website: p.website, domain: p.domain, logoUrl: '',
    location: p.location, ...(Object.keys(profile).length ? { profile } : {}),
    ...(parentIdFor(p) ? { parentId: parentIdFor(p) } : {}),
    directorySource: { name: p.source.name, id: p.sourceId || '', url: p.source.url, importedAt: now },
    // Ownership: nobody administers an imported organization until someone proves they should.
    claimed: false, verificationStatus: 'unverified', followerCount: 0,
    createdAt: now, updatedAt: now,
  };
}

/** What a merge may change on an existing record: only fields that are empty there. */
export function fillMissing(existingDoc, p, parentId = '') {
  const out = {};
  const empty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
  if (empty(existingDoc.organizationType) && p.organizationType !== 'business') out.organizationType = p.organizationType;
  if (empty(existingDoc.industry) && p.industry) out.industry = p.industry;
  if (empty(existingDoc.subindustries) && p.subindustries.length) out.subindustries = p.subindustries;
  if (empty(existingDoc.website) && p.website) { out.website = p.website; if (empty(existingDoc.domain)) out.domain = p.domain; }
  const loc = existingDoc.location && typeof existingDoc.location === 'object' ? existingDoc.location : {};
  for (const k of ['city', 'region', 'country', 'countryCode']) if (empty(loc[k]) && p.location[k]) out[`location.${k}`] = p.location[k];
  const prof = existingDoc.profile && typeof existingDoc.profile === 'object' ? existingDoc.profile : {};
  for (const [k, v] of Object.entries(p.profile ?? {})) if (PROFILE_KEYS.has(k) && empty(prof[k]) && v !== '' && v != null) out[`profile.${k}`] = v;
  if (empty(existingDoc.parentId) && parentId) out.parentId = parentId;
  if (!existingDoc.directorySource) out.directorySource = { name: p.source.name, id: p.sourceId || '', url: p.source.url };
  return out;
}
