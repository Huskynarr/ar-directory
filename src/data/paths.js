// Shared device URL path derivation. Imported by BOTH the build pipeline
// (scripts/lib/render-pages.mjs, scripts/generate-ar-csv.mjs, vite.config.js)
// and the SPA so the static pages, sitemap, canonicals and client-side links
// all resolve to the exact same /<brand>/<model>/ URLs. Because uniqueness is
// resolved by iterating rows in dataset order, the build and the SPA must run
// this over the same (CSV-order) row list — which they do.

export const slugifyPart = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[äàâ]/g, 'a')
    .replace(/[öô]/g, 'oe')
    .replace(/[üû]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// Brand = the manufacturer up to the first "(" or "/" (drops parentheticals
// like "Meta (2016)" and slash-pairs like "Kopin / Solos").
export const brandSlug = (manufacturer) => {
  const primary = String(manufacturer ?? '').split(/[(/]/)[0];
  return slugifyPart(primary) || 'brand';
};

// Model = the device name with a leading manufacturer prefix stripped so we get
// "/xreal/one-pro" rather than "/xreal/xreal-one-pro". Falls back to the full
// name slug when the name does not start with the manufacturer.
export const modelSlug = (name, manufacturer) => {
  const fullName = String(name ?? '').trim();
  const lower = fullName.toLowerCase();
  const mfr = String(manufacturer ?? '').split(/[(/]/)[0].trim();
  let rest = fullName;
  if (mfr && lower.startsWith(mfr.toLowerCase())) {
    rest = fullName.slice(mfr.length);
  } else {
    const firstWord = mfr.split(/\s+/)[0];
    if (firstWord && lower.startsWith(`${firstWord.toLowerCase()} `)) {
      rest = fullName.slice(firstWord.length);
    }
  }
  return slugifyPart(rest) || slugifyPart(fullName) || 'model';
};

// Returns Map(id -> { brand, model, path, flat }) with globally unique `path`
// (brand/model) and a `flat` form (brand-model) used for /compare/ URLs.
export const assignDevicePaths = (rows) => {
  const used = new Set();
  const map = new Map();
  for (const row of rows) {
    const brand = brandSlug(row.manufacturer);
    const model = modelSlug(row.name, row.manufacturer);
    let candidate = model;
    let n = 2;
    while (used.has(`${brand}/${candidate}`)) candidate = `${model}-${n++}`;
    used.add(`${brand}/${candidate}`);
    const path = `${brand}/${candidate}`;
    map.set(row.id, { brand, model: candidate, path, flat: `${brand}-${candidate}` });
  }
  return map;
};

export const COMPARE_SEPARATOR = '-vs-';
