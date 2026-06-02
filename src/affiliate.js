// Affiliate scaffolding — framework-free, imported by both the app (src/) and the
// static page generator (scripts/lib/render-pages.mjs).
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ ACTIVATION CHECKLIST (do all before flipping AFFILIATE.enabled to true):  │
// │  1. Enter your real partner IDs below (replace every "CHANGEME-*").        │
// │  2. Publish Impressum + Datenschutz (templates: public/impressum.html,     │
// │     public/datenschutz.html — fill the [PLATZHALTER] fields).              │
// │  3. Be an approved partner of each enabled program (Amazon PartnerNet,     │
// │     eBay Partner Network, AWIN for Otto/idealo).                           │
// │  4. Set AFFILIATE.enabled = true and run `npm run data:generate`+build.    │
// │ Until then the site shows only the neutral official shop link (no change). │
// └──────────────────────────────────────────────────────────────────────────┘

export const AFFILIATE = {
  // Master switch. Kept false so no monetized links / disclosure ship before the
  // partner IDs and the legal pages are in place.
  enabled: false,

  // Mandatory disclosure (Amazon PartnerNet requires wording like this in DE).
  disclosureShort: 'Affiliate-Links: Als Partner verdienen wir an qualifizierten Kaeufen. Fuer dich aendert sich der Preis nicht.',

  programs: {
    // Amazon.de tag is live. Only the `tag` param matters for commission — clean
    // links like https://www.amazon.de/dp/<ASIN>?tag=xboxdev.com-21 are sufficient.
    amazonDe: { enabled: true, label: 'Amazon.de', domain: 'www.amazon.de', tag: 'xboxdev.com-21' },
    // Disabled until their IDs are provided (set enabled:true after filling them).
    amazonCom: { enabled: false, label: 'Amazon.com', domain: 'www.amazon.com', tag: 'CHANGEME-20' },
    // eBay Partner Network: campid (Campaign ID) + mkrid (rotation id, market-specific).
    ebay: { enabled: false, label: 'eBay', domain: 'www.ebay.de', campid: 'CHANGEME', mkrid: '707-53477-19255-0' },
    // Otto / idealo run via AWIN — fill awinMid (advertiser) + awinAffid (your id).
    otto: { enabled: false, label: 'Otto', awinMid: 'CHANGEME', awinAffid: 'CHANGEME' },
    idealo: { enabled: false, label: 'idealo', awinMid: 'CHANGEME', awinAffid: 'CHANGEME' },
  },
};

const isSet = (value) => value && !String(value).startsWith('CHANGEME');
const enc = encodeURIComponent;

const searchQuery = (row) => {
  const name = String(row.name || '').trim();
  const mfr = String(row.manufacturer || '').trim();
  // Avoid duplicating the brand when the name already starts with it.
  return mfr && !name.toLowerCase().startsWith(mfr.toLowerCase()) ? `${mfr} ${name}` : name;
};

const withParam = (url, key, value) => {
  try {
    const u = new URL(url);
    u.searchParams.set(key, value);
    return u.toString();
  } catch {
    return url;
  }
};

// AWIN deeplink wrapper; falls back to the untracked target until ids are set,
// so links always work during scaffolding.
const awin = (program, targetUrl) =>
  isSet(program.awinMid) && isSet(program.awinAffid)
    ? `https://www.awin1.com/cread.php?awinmid=${program.awinMid}&awinaffid=${program.awinAffid}&ued=${enc(targetUrl)}`
    : targetUrl;

// Returns ordered buy options for a row. `overrides` is an optional map
// id -> { amazon_de, amazon_com, ebay, otto, idealo } of curated product deeplinks.
export const buildBuyLinks = (row, overrides = {}) => {
  if (!AFFILIATE.enabled) return [];
  const ov = overrides[row.id] || {};
  const q = searchQuery(row);
  const p = AFFILIATE.programs;
  const links = [];

  const push = (key, label, url) => url && links.push({ key, label, url });

  if (p.amazonDe?.enabled) {
    const base = ov.amazon_de || `https://${p.amazonDe.domain}/s?k=${enc(q)}`;
    push('amazonDe', p.amazonDe.label, withParam(base, 'tag', p.amazonDe.tag));
  }
  if (p.amazonCom?.enabled) {
    const base = ov.amazon_com || `https://${p.amazonCom.domain}/s?k=${enc(q)}`;
    push('amazonCom', p.amazonCom.label, withParam(base, 'tag', p.amazonCom.tag));
  }
  if (p.ebay?.enabled) {
    let url = ov.ebay || `https://${p.ebay.domain}/sch/i.html?_nkw=${enc(q)}`;
    if (isSet(p.ebay.campid)) {
      url = withParam(url, 'mkcid', '1');
      url = withParam(url, 'mkrid', p.ebay.mkrid);
      url = withParam(url, 'campid', p.ebay.campid);
      url = withParam(url, 'toolid', '10001');
    }
    push('ebay', p.ebay.label, url);
  }
  if (p.otto?.enabled) {
    push('otto', p.otto.label, awin(p.otto, ov.otto || `https://www.otto.de/suche/${enc(q)}/`));
  }
  if (p.idealo?.enabled) {
    const target = ov.idealo || `https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${enc(q)}`;
    push('idealo', p.idealo.label, awin(p.idealo, target));
  }

  return links;
};

// rel attribute for monetized outbound links (Google: paid links must be marked).
export const AFFILIATE_REL = 'sponsored nofollow noopener';

let overrideStore = {};
export const setAffiliateOverrides = (data) => {
  overrideStore = data && typeof data === 'object' ? data : {};
};
export const getAffiliateOverrides = () => overrideStore;
