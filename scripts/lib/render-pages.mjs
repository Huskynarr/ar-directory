// Static page rendering for SEO/LLM depth: one standalone, crawlable page per
// device, a model hub/index, a glossary + FAQ page, and legal pages. CSV-derived.

import { AFFILIATE, AFFILIATE_REL, buildBuyLinks } from '../../src/affiliate.js';

const UNKNOWN = new Set(['', 'k.a.', 'k. a.', 'n/a', 'na', 'unknown', 'unbekannt', '-', '–', 'null', 'undefined']);
export const hasValue = (v) => !UNKNOWN.has(String(v ?? '').trim().toLowerCase());

export const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Assign a unique, filesystem-safe slug per row (prefers existing short_name).
export const assignSlugs = (rows) => {
  const used = new Set();
  const map = new Map();
  for (const row of rows) {
    let base = slugify(row.short_name || row.name || row.id) || row.id;
    let slug = base;
    let n = 2;
    while (used.has(slug)) slug = `${base}-${n++}`;
    used.add(slug);
    map.set(row.id, slug);
  }
  return map;
};

const CATEGORY_LABEL = (c) => (String(c).toUpperCase() === 'XR' ? 'XR-Headset' : 'AR-Brille');

// Ordered spec rows for the detail table. `deep` rows render only when present.
const SPEC_ROWS = [
  ['manufacturer', 'Hersteller'],
  ['xr_category', 'Kategorie'],
  ['announced_date', 'Angekündigt'],
  ['release_date', 'Release'],
  ['display_type', 'Display'],
  ['optics', 'Optik'],
  ['__fov__', 'Sichtfeld (FOV, H/V/D)'],
  ['resolution_per_eye', 'Auflösung pro Auge'],
  ['refresh_hz', 'Bildwiederholrate', ' Hz'],
  ['brightness_nits', 'Helligkeit', ' nits'],
  ['weight_g', 'Gewicht', ' g'],
  ['chipset', 'Chipsatz'],
  ['compute_unit', 'Recheneinheit'],
  ['software', 'Software'],
  ['tracking', 'Tracking'],
  ['eye_tracking', 'Eye-Tracking'],
  ['hand_tracking', 'Hand-Tracking'],
  ['passthrough', 'Passthrough'],
  ['camera', 'Kamera'],
  ['connectivity', 'Konnektivität'],
  ['audio', 'Audio'],
  ['battery', 'Akku'],
  ['ipd_mm', 'IPD'],
  ['prescription_support', 'Sehstärke'],
];

const fovValue = (row) => {
  const parts = [row.fov_horizontal_deg, row.fov_vertical_deg, row.fov_diagonal_deg].map((v) =>
    hasValue(v) ? `${v}°` : '–',
  );
  return parts.every((p) => p === '–') ? '' : parts.join(' / ');
};

const head = ({ title, description, canonical, image, imageAlt = '', ogType = 'website', extraMeta = '', jsonLd, baseUrl }) => {
  const ogImage = image || `${baseUrl}og/startseite.png`;
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="dark light" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="robots" content="index,follow,max-image-preview:large" />
<link rel="canonical" href="${esc(canonical)}" />
<link rel="icon" type="image/svg+xml" href="/icon.svg" />
<meta name="theme-color" content="#0c0a09" />
<meta property="og:type" content="${esc(ogType)}" />
<meta property="og:site_name" content="AR/XR Brillen Vergleich" />
<meta property="og:locale" content="de_DE" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="${esc(ogImage)}" />
<meta property="og:image:alt" content="${esc(imageAlt || title)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(ogImage)}" />
<meta name="twitter:image:alt" content="${esc(imageAlt || title)}" />
${extraMeta}
<style>
:root{color-scheme:dark light}
*{box-sizing:border-box}
body{margin:0;background:#080b0d;color:#f4f7f5;font:16px/1.6 Inter,system-ui,-apple-system,Segoe UI,sans-serif}
a,button{cursor:pointer}
a{color:#a3e635;text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1040px;margin:0 auto;padding:28px 24px 64px}
nav.bc{font-size:14px;color:#a8a29e;margin-bottom:24px}
nav.bc a{color:#a8a29e}
h1{font-size:clamp(32px,5vw,52px);letter-spacing:-.04em;line-height:1.08;margin:8px 0 6px;text-wrap:balance}
.badges{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.badge{font-size:13px;padding:3px 10px;border-radius:999px;border:1px solid #44403c;color:#d6d3d1}
.badge.cat,.badge.xr{border-color:#44403c;color:#e7e5e4;background:#12181c}
.hero{display:grid;grid-template-columns:minmax(220px,320px) 1fr;gap:28px;align-items:start;margin:22px 0 12px}
.hero img{max-width:280px;width:100%;border-radius:12px;background:#1c1917;border:1px solid #292524}
.ph{width:280px;height:160px;border-radius:12px;border:1px solid #292524;display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:700;background:linear-gradient(135deg,#1c1917,#0c0a09);color:#3f3f46}
.price{font-size:24px;font-weight:700;color:#fafaf9;margin:6px 0}
.lead{color:#d6d3d1;margin:4px 0 20px}
table{width:100%;border-collapse:collapse;margin:8px 0 24px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid #292524;vertical-align:top}
th{color:#a8a29e;font-weight:500;width:42%}
.cta{display:inline-block;margin:4px 8px 4px 0;padding:9px 16px;border-radius:10px;border:1px solid #44403c;color:#fafaf9}
.cta.primary{background:#4d7c0f;border-color:#4d7c0f}
.note{background:#1c1917;border:1px solid #292524;border-radius:12px;padding:14px 16px;margin:8px 0 24px;color:#d6d3d1}
h2{font-size:20px;margin:28px 0 8px}
ul.rel{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px}
ul.rel a{display:inline-block;padding:6px 12px;border:1px solid #292524;border-radius:999px}
footer{margin-top:40px;padding-top:20px;border-top:1px solid #292524;color:#78716c;font-size:14px}
.buy{margin:8px 0 20px}.buy h2{margin:0 0 8px}
.buyrow{display:flex;flex-wrap:wrap;gap:8px}
.cta.buy{background:transparent;border-color:#44403c;color:#f5f5f4}
.cta.buy:hover{background:#1c1917;border-color:#84cc16;color:#bef264;text-decoration:none}
.affnote{font-size:12px;color:#78716c;margin:8px 0 0}
.hl{background:#1c1917;border:1px solid #292524;border-radius:14px;padding:14px 18px;margin:4px 0 20px}
.hl h2{margin:0 0 8px;font-size:16px;color:#bef264}
.hl ul{margin:0;padding-left:18px}.hl li{margin:3px 0}
.aud{margin:10px 0 0;color:#a8a29e;font-size:14px}
.share{margin:24px 0 8px}.share h2{margin:0 0 8px}
.sharerow{display:flex;flex-wrap:wrap;gap:8px}
.cta.share{padding:7px 13px;font-size:14px}
@media(max-width:680px){.wrap{padding:20px 16px 48px}.hero{grid-template-columns:1fr}.hero img,.ph{max-width:100%;width:100%}}
@media(prefers-color-scheme:light){
  body{background:#f2f4ef;color:#17201b}
  a{color:#3f6212}nav.bc,nav.bc a,th,.affnote,.aud{color:#526159}
  .badge,.badge.cat,.badge.xr,.cta{border-color:#d3dbd2;color:#17201b;background:#f1f4ed}
  .hero img,.ph,.note,.hl{background:#fbfcf8;border-color:#d3dbd2;color:#526159}
  .price{color:#17201b}th,td,footer{border-color:#d3dbd2}.lead{color:#526159}
  .cta.primary{background:#3f6212;border-color:#3f6212;color:#fff}
  .cta.buy{border-color:#adb9ae;color:#17201b}.cta.buy:hover{background:#e8ede4;border-color:#4d7c0f;color:#3f6212}
}
</style>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
</head>`;
};

// Social share intent links (no APIs/keys; open in a new tab).
const shareButtons = (title, url) => {
  const u = encodeURIComponent(url);
  const tt = encodeURIComponent(title);
  const tu = encodeURIComponent(`${title} ${url}`);
  const links = [
    ['X', `https://twitter.com/intent/tweet?text=${tt}&url=${u}`],
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ['WhatsApp', `https://wa.me/?text=${tu}`],
    ['LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ['Reddit', `https://www.reddit.com/submit?url=${u}&title=${tt}`],
    ['Telegram', `https://t.me/share/url?url=${u}&text=${tt}`],
    ['E-Mail', `mailto:?subject=${tt}&body=${tu}`],
  ];
  return `<div class="share"><h2>Teilen</h2><div class="sharerow">${links
    .map(([label, href]) => `<a class="cta share" href="${esc(href)}" target="_blank" rel="noopener nofollow">${esc(label)}</a>`)
    .join('')}</div></div>`;
};

export const buildDevicePage = (row, rows, slugs, paths, baseUrl, overrides = {}, descriptions = {}) => {
  const slug = slugs.get(row.id);
  const pagePath = paths.get(row.id).path;
  const editorial = descriptions[row.id] || {};
  const highlightsHtml = Array.isArray(editorial.highlights) && editorial.highlights.length
    ? `<div class="hl"><h2>Highlights</h2><ul>${editorial.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>${editorial.audience ? `<p class="aud"><strong>Geeignet für:</strong> ${esc(editorial.audience)}</p>` : ''}</div>`
    : '';
  const buyLinks = buildBuyLinks(row, overrides);
  const buyHtml = buyLinks.length
    ? `<section class="buy"><h2>Kaufen bei</h2><div class="buyrow">${buyLinks
        .map((l) => `<a class="cta buy" href="${esc(l.url)}" rel="${AFFILIATE_REL}" target="_blank">${esc(l.label)} ↗</a>`)
        .join('')}</div><p class="affnote">* ${esc(AFFILIATE.disclosureShort)} <a href="/datenschutz.html">Mehr</a></p></section>`
    : '';
  const canonical = `${baseUrl}${pagePath}/`;
  const cat = CATEGORY_LABEL(row.xr_category);
  const isXr = String(row.xr_category).toUpperCase() === 'XR';
  const priceText = hasValue(row.price_usd) ? `ca. ${row.price_usd} USD` : 'Preis k. A.';

  const descParts = [
    `${row.name} (${row.manufacturer}) — ${cat}.`,
    hasValue(row.price_usd) ? `Preis ca. $${row.price_usd}.` : '',
    hasValue(row.display_type) ? `${row.display_type}.` : '',
    fovValue(row) ? `FOV ${fovValue(row)}.` : '',
    hasValue(row.resolution_per_eye) ? `${row.resolution_per_eye} pro Auge.` : '',
    'Specs, Preis, Lifecycle & Vergleich.',
  ].filter(Boolean);
  const description = (editorial.description || descParts.join(' ')).slice(0, 300);

  const specRowsHtml = SPEC_ROWS.map(([key, label, suffix]) => {
    let value = key === '__fov__' ? fovValue(row) : row[key];
    if (key === 'release_date' || key === 'announced_date') value = hasValue(value) ? value : '';
    if (!hasValue(value) && key !== '__fov__') return '';
    if (key === '__fov__' && !value) return '';
    if (key === 'xr_category') value = `${row.xr_category} (${cat})`;
    return `<tr><th>${label}</th><td>${esc(value)}${suffix && hasValue(row[key]) ? suffix : ''}</td></tr>`;
  })
    .filter(Boolean)
    .join('\n');

  const lifecycle = `<div class="note"><strong>Lifecycle:</strong> ${esc(row.eol_status || 'k. A.')}` +
    `${hasValue(row.active_distribution) ? ` · Aktiver Vertrieb: ${esc(row.active_distribution)}` : ''}` +
    `${hasValue(row.eol_date) ? ` · EOL: ${esc(row.eol_date)}` : ''}` +
    `${hasValue(row.lifecycle_notes) ? `<br>${esc(row.lifecycle_notes)}` : ''}` +
    `${hasValue(row.lifecycle_source) ? ` <a href="${esc(row.lifecycle_source)}" rel="nofollow noopener">Quelle</a>` : ''}</div>`;

  const related = rows
    .filter((r) => r.id !== row.id && r.manufacturer === row.manufacturer)
    .slice(0, 8)
    .map((r) => `<li><a href="/${paths.get(r.id).path}/">${esc(r.name)}</a></li>`)
    .join('');
  const sameCat = rows
    .filter((r) => r.id !== row.id && r.xr_category === row.xr_category && r.manufacturer !== row.manufacturer)
    .slice(0, 8)
    .map((r) => `<li><a href="/${paths.get(r.id).path}/">${esc(r.name)}</a></li>`)
    .join('');

  const image = hasValue(row.image_url) ? row.image_url : '';
  const heroMedia = image
    ? `<img src="${esc(image)}" alt="${esc(row.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="280" height="160" />`
    : `<div class="ph">${esc((row.name || '?').slice(0, 2).toUpperCase())}</div>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Start', item: baseUrl },
          { '@type': 'ListItem', position: 2, name: 'Modelle', item: `${baseUrl}modelle/` },
          { '@type': 'ListItem', position: 3, name: row.name, item: canonical },
        ],
      },
      {
        '@type': 'Product',
        name: row.name,
        category: cat,
        brand: { '@type': 'Brand', name: row.manufacturer },
        ...(image ? { image } : {}),
        ...(hasValue(row.release_date) ? { releaseDate: row.release_date } : {}),
        description,
        additionalProperty: SPEC_ROWS.flatMap(([key, label]) => {
          const v = key === '__fov__' ? fovValue(row) : row[key];
          return hasValue(v) ? [{ '@type': 'PropertyValue', name: label, value: String(v) }] : [];
        }),
        ...(hasValue(row.price_usd)
          ? {
              offers: {
                '@type': 'Offer',
                priceCurrency: 'USD',
                price: String(row.price_usd),
                availability: String(row.active_distribution).toLowerCase().startsWith('ja')
                  ? 'https://schema.org/InStock'
                  : 'https://schema.org/Discontinued',
                ...(hasValue(row.official_url) ? { url: row.official_url } : {}),
              },
            }
          : {}),
      },
    ],
  };

  const pageTitle = `${row.name} – Specs, Preis & Vergleich | AR/XR Brillen Vergleich`;
  const shareTitle = `${row.name} (${row.manufacturer}) – AR/XR Brillen Vergleich`;
  const imageAlt = `${row.name} – ${cat} von ${row.manufacturer}`;
  const inStock = String(row.active_distribution).toLowerCase().startsWith('ja');
  const extraMeta = [
    `<meta property="og:image:width" content="1200" />\n<meta property="og:image:height" content="630" />`,
    `<meta property="product:brand" content="${esc(row.manufacturer)}" />`,
    hasValue(row.price_usd)
      ? `<meta property="product:price:amount" content="${esc(row.price_usd)}" />\n<meta property="product:price:currency" content="USD" />\n<meta property="product:availability" content="${inStock ? 'in stock' : 'discontinued'}" />`
      : '',
    `<meta name="twitter:label1" content="Preis" />\n<meta name="twitter:data1" content="${esc(hasValue(row.price_usd) ? `${row.price_usd} USD` : 'k. A.')}" />`,
    `<meta name="twitter:label2" content="Kategorie" />\n<meta name="twitter:data2" content="${esc(cat)}" />`,
  ]
    .filter(Boolean)
    .join('\n');

  const ogCard = `${baseUrl}og/models/${slug}.png`;
  return `${head({ title: pageTitle, description, canonical, image: ogCard, imageAlt, ogType: 'product', extraMeta, jsonLd, baseUrl })}
<body>
<div class="wrap">
<nav class="bc"><a href="/">Start</a> › <a href="/modelle/">Modelle</a> › ${esc(row.name)}</nav>
<header>
<h1>${esc(row.name)}</h1>
<div class="badges"><span class="badge ${isXr ? 'xr' : 'cat'}">${esc(cat)}</span><span class="badge">${esc(row.manufacturer)}</span>${hasValue(row.release_date) ? `<span class="badge">Release ${esc(row.release_date)}</span>` : ''}</div>
</header>
<div class="hero">
${heroMedia}
<div>
<p class="price">${esc(priceText)}</p>
<p class="lead">${esc(editorial.description || `${row.name} von ${row.manufacturer} im AR/XR Brillen Vergleich: alle Spezifikationen, Preis, Lifecycle-Status und der direkte Vergleich mit anderen Modellen.`)}</p>
<a class="cta primary" href="/?selectedIds=${esc(row.id)}&compareMode=true">Im Vergleich öffnen</a>
${hasValue(row.official_url) ? `<a class="cta" href="${esc(row.official_url)}" rel="nofollow noopener">Offizielle Produktseite</a>` : ''}
</div>
</div>
${highlightsHtml}
${buyHtml}
<h2>Technische Daten</h2>
<table><tbody>
${specRowsHtml}
</tbody></table>
${lifecycle}
${related ? `<h2>Weitere Modelle von ${esc(row.manufacturer)}</h2><ul class="rel">${related}</ul>` : ''}
${sameCat ? `<h2>Aehnliche ${esc(cat)}-Modelle</h2><ul class="rel">${sameCat}</ul>` : ''}
${shareButtons(shareTitle, canonical)}
<footer>
Teil des <a href="/">AR/XR Brillen Vergleichs</a> · <a href="/modelle/">Alle Modelle</a> · <a href="/glossar.html">Glossar &amp; FAQ</a> · <a href="/impressum.html">Impressum</a> · <a href="/datenschutz.html">Datenschutz</a><br>
Angaben ohne Gewähr; Spezifikationen und Preise können je nach Region/Revision/Zeitpunkt abweichen.
</footer>
</div>
</body>
</html>
`;
};

// Lightweight redirect stub for the legacy /modelle/<slug>.html URLs. GitHub
// Pages can't issue real 301s, so we keep these tiny pages with a canonical to
// the new /brand/model/ URL plus an instant meta-refresh + JS fallback. Google
// treats an instant meta-refresh as a redirect and follows the canonical.
export const buildRedirectStub = (target, name = '') => `<!doctype html>
<html lang="de"><head><meta charset="utf-8" />
<title>${esc(name)} – verschoben</title>
<link rel="canonical" href="${esc(target)}" />
<meta name="robots" content="noindex,follow" />
<meta http-equiv="refresh" content="0; url=${esc(target)}" />
<script>location.replace(${JSON.stringify(target)});</script>
</head><body>Diese Seite ist umgezogen: <a href="${esc(target)}">${esc(target)}</a></body></html>
`;

export const buildModelIndex = (rows, slugs, paths, meta, baseUrl) => {
  const canonical = `${baseUrl}modelle/`;
  const byMfr = new Map();
  for (const row of rows) {
    if (!byMfr.has(row.manufacturer)) byMfr.set(row.manufacturer, []);
    byMfr.get(row.manufacturer).push(row);
  }
  const mfrs = [...byMfr.keys()].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
  const sections = mfrs
    .map((mfr) => {
      const items = byMfr
        .get(mfr)
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
        .map((r) => `<li><a href="/${paths.get(r.id).path}/">${esc(r.name)}</a>${hasValue(r.price_usd) ? ` <span style="color:#78716c">· $${esc(r.price_usd)}</span>` : ''}</li>`)
        .join('');
      return `<section><h2>${esc(mfr)}</h2><ul class="rel">${items}</ul></section>`;
    })
    .join('\n');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Alle AR/XR Brillen Modelle',
    url: canonical,
    isPartOf: { '@type': 'WebSite', url: baseUrl, name: 'AR/XR Brillen Vergleich' },
  };

  return `${head({
    title: `Alle ${meta.records} AR/XR Brillen Modelle (A–Z) | AR/XR Brillen Vergleich`,
    description: `Vollständige Liste aller ${meta.records} AR- und XR-Brillen (${meta.ar_records} AR, ${meta.xr_records} XR) von ${meta.manufacturers} Herstellern mit Einzelseiten, Specs und Preisen.`,
    canonical,
    jsonLd,
    baseUrl,
  })}
<body>
<div class="wrap">
<nav class="bc"><a href="/">Start</a> › Modelle</nav>
<h1>Alle ${meta.records} AR/XR Brillen Modelle</h1>
<p class="lead">${meta.ar_records} AR-Brillen und ${meta.xr_records} XR-Headsets von ${meta.manufacturers} Herstellern. Jede Brille hat eine eigene Detailseite mit allen Spezifikationen.</p>
<p><a class="cta primary" href="/">Interaktiv vergleichen &amp; filtern</a> <a class="cta" href="/glossar.html">Glossar &amp; FAQ</a></p>
${sections}
<footer>Teil des <a href="/">AR/XR Brillen Vergleichs</a> · <a href="/glossar.html">Glossar &amp; FAQ</a> · <a href="/impressum.html">Impressum</a> · <a href="/datenschutz.html">Datenschutz</a></footer>
</div>
</body>
</html>
`;
};

const FAQ = [
  ['Was ist der Unterschied zwischen AR- und XR-Brillen?', 'AR-Brillen (Augmented Reality) blenden digitale Inhalte in die reale Umgebung ein, meist über transparente Optiken wie Waveguides oder Birdbath-Linsen. XR ist der Oberbegriff (Extended Reality) und umfasst hier vor allem VR-/MR-Headsets mit Kamera-Passthrough, die die Umgebung digital darstellen.'],
  ['Welche AR-Brille hat das größte Sichtfeld (FOV)?', 'Das Sichtfeld (FOV) unterscheidet sich stark: viele Display-/Birdbath-Brillen liegen bei 40–52° diagonal, Waveguide-Brillen oft darunter, während MR-Headsets deutlich größere Sichtfelder erreichen. Im Vergleich lässt sich nach minimalem FOV filtern und sortieren.'],
  ['Was bedeutet "EOL" bzw. Support-Ende?', 'EOL (End of Life) bedeutet, dass ein Gerät nicht mehr verkauft und/oder nicht mehr mit Software-Updates versorgt wird. Im Datensatz ist pro Modell vermerkt, ob es noch aktiv im Vertrieb ist und ob ein Support-Ende angekündigt wurde.'],
  ['Was ist Birdbath- vs. Waveguide-Optik?', 'Birdbath-Optiken nutzen einen halbtransparenten Spiegel und liefern helle, kontrastreiche Bilder bei kompakter Bauform – typisch für Display-Brillen am Smartphone/PC. Waveguides leiten Licht durch dünne Glassubstrate und ermöglichen schlankere, brillenähnliche Designs, meist mit kleinerem FOV.'],
  ['Standalone, Phone oder PC – was heisst das?', 'Die Recheneinheit zeigt, wie eine Brille betrieben wird: "Standalone" hat eigenen Prozessor/Akku, "Phone" wird per USB-C an ein Smartphone angeschlossen, "PC" benötigt einen Rechner. Das beeinflusst Mobilität, Leistung und Preis.'],
  ['Sind die Preise aktuell?', 'Die Preise sind kuratierte USD-Richtwerte (UVP zum Launch oder aktueller Marktpreis) und dienen der Orientierung. Auf der Startseite kann optional ein Live-EUR-Kurs zur Umrechnung eingeblendet werden.'],
];

const GLOSSARY = [
  ['FOV (Field of View)', 'Sichtfeld der Anzeige in Grad, angegeben horizontal/vertikal/diagonal. Größer = immersiver.'],
  ['Waveguide', 'Optik, die Licht durch ein dünnes Glassubstrat ins Auge leitet; ermöglicht schlanke AR-Brillen.'],
  ['Birdbath', 'Optik mit halbtransparentem Spiegel; helle, kontrastreiche Bilder bei kompakter Bauform.'],
  ['Passthrough', 'Kamera-Durchsicht: bei MR-Headsets wird die Umgebung digital ins Display übertragen.'],
  ['IPD', 'Pupillendistanz; verstellbar (mechanisch/Software) oder fix – wichtig für scharfes, komfortables Bild.'],
  ['Nits', 'Einheit der Display-Helligkeit; höhere Werte verbessern die Sichtbarkeit, besonders im Hellen.'],
  ['Refresh-Rate (Hz)', 'Bildwiederholrate; höhere Werte sorgen für flüssigere Darstellung und weniger Uebelkeit.'],
  ['Inside-out Tracking', 'Positionsbestimmung über Kameras im Gerät selbst, ohne externe Basisstationen.'],
  ['Micro-OLED', 'Sehr kleine, hochauflösende OLED-Panels; verbreitet in modernen Display-/AR-Brillen.'],
  ['EOL (End of Life)', 'Produktende: kein Verkauf und/oder keine Software-Updates mehr.'],
];

export const buildGlossary = (meta, baseUrl) => {
  const canonical = `${baseUrl}glossar.html`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map(([q, a]) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
      {
        '@type': 'DefinedTermSet',
        name: 'AR/XR Glossar',
        hasDefinedTerm: GLOSSARY.map(([t, d]) => ({ '@type': 'DefinedTerm', name: t, description: d })),
      },
    ],
  };
  return `${head({
    title: 'AR/XR Glossar & FAQ: FOV, Waveguide, Birdbath, Passthrough erklärt | AR/XR Brillen Vergleich',
    description: 'Glossar und häufige Fragen rund um AR- und XR-Brillen: FOV, Waveguide vs. Birdbath, Passthrough, IPD, Nits, Tracking, EOL und mehr – einfach erklärt.',
    canonical,
    jsonLd,
    baseUrl,
  })}
<body>
<div class="wrap">
<nav class="bc"><a href="/">Start</a> › Glossar &amp; FAQ</nav>
<h1>AR/XR Glossar &amp; FAQ</h1>
<p class="lead">Die wichtigsten Begriffe und Fragen rund um AR- und XR-Brillen – einfach erklärt. Begleitend zum Vergleich von ${meta.records} Modellen.</p>
<h2>Häufige Fragen</h2>
${FAQ.map(([q, a]) => `<section><h3>${esc(q)}</h3><p>${esc(a)}</p></section>`).join('\n')}
<h2>Glossar</h2>
<table><tbody>
${GLOSSARY.map(([t, d]) => `<tr><th>${esc(t)}</th><td>${esc(d)}</td></tr>`).join('\n')}
</tbody></table>
<footer>Teil des <a href="/">AR/XR Brillen Vergleichs</a> · <a href="/modelle/">Alle Modelle</a> · <a href="/impressum.html">Impressum</a> · <a href="/datenschutz.html">Datenschutz</a></footer>
</div>
</body>
</html>
`;
};

const legalPage = (title, description, canonical, baseUrl, bodyHtml) => `${head({ title, description, canonical, baseUrl })}
<body>
<div class="wrap">
<nav class="bc"><a href="/">Start</a> › ${esc(title.split('|')[0].trim())}</nav>
${bodyHtml}
<footer>Teil des <a href="/">AR/XR Brillen Vergleichs</a> · <a href="/impressum.html">Impressum</a> · <a href="/datenschutz.html">Datenschutz</a></footer>
</div>
</body>
</html>
`;

export const buildImpressum = (meta, baseUrl) =>
  legalPage(
    'Impressum | AR/XR Brillen Vergleich',
    'Impressum und Anbieterkennzeichnung des AR/XR Brillen Vergleichs.',
    `${baseUrl}impressum.html`,
    baseUrl,
    `<h1>Impressum</h1>
<h2>Angaben gemäß § 5 DDG</h2>
<p>Huskynarr<br>Eichstetter Straße 11<br>79106 Freiburg<br>Deutschland</p>
<h2>Kontakt</h2>
<p>Telefon: +49 761 45891814<br>E-Mail und weitere Kontaktmöglichkeiten: <a href="https://huskynarr.de/impressum/" rel="noopener">zentrales Impressum von Huskynarr</a></p>
<h2>Verantwortlich i.S.d. § 18 Abs. 2 MStV</h2>
<p>Huskynarr (Anschrift wie oben)</p>
<h2>Haftung für Inhalte &amp; Links</h2>
<p>Die Inhalte dieser Seiten wurden mit Sorgfalt erstellt, jedoch ohne Gewähr für Aktualität, Vollständigkeit und Richtigkeit der Geräte-Spezifikationen und Preise. Für Inhalte verlinkter externer Seiten sind deren Betreiber verantwortlich.</p>
<h2>Affiliate-Hinweis</h2>
<p>Affiliate-Links sind derzeit deaktiviert. Eine künftige Aktivierung wird auf der Website und an den Links eindeutig kenntlich gemacht.</p>
<h2>Verbraucherstreitbeilegung</h2>
<p>Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen. Die frühere EU-OS-Plattform wurde 2025 eingestellt.</p>`,
  );

export const buildDatenschutz = (meta, baseUrl) =>
  legalPage(
    'Datenschutzerklärung | AR/XR Brillen Vergleich',
    'Datenschutzerklärung des AR/XR Brillen Vergleichs: Hosting, Logfiles, lokale Speicherung, externe Dienste und Affiliate-Programme.',
    `${baseUrl}datenschutz.html`,
    baseUrl,
    `<h1>Datenschutzerklärung</h1>
<h2>1. Verantwortlicher</h2>
<p>Huskynarr, Eichstetter Straße 11, 79106 Freiburg. Kontakt siehe <a href="/impressum.html">Impressum</a>.</p>
<h2>2. Hosting &amp; Server-Logfiles</h2>
<p>Beim Aufruf verarbeitet der technische Hostinganbieter notwendige Server-Logfiles (IP-Adresse, Datum/Uhrzeit, abgerufene URL und User-Agent) zur sicheren Auslieferung der Website. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO.</p>
<h2>3. Lokale Speicherung (kein Tracking)</h2>
<p>Die App speichert Einstellungen (Theme, Sprache, Favoriten, Filter) ausschliesslich lokal in deinem Browser (localStorage). Es werden keine Cookies zu Analyse-/Werbezwecken gesetzt und keine personenbezogenen Daten an uns übertragen.</p>
<h2>4. Externe Inhalte</h2>
<p>Zur USD-/EUR-Umrechnung wird bei Bedarf die API <code>api.frankfurter.dev</code> abgerufen; dabei wird deine IP-Adresse an diesen Dienst übertragen. Produktbilder werden teils direkt von den jeweils im <a href="/asset-notices.html">Bildnachweis</a> genannten externen Servern geladen. Der Browser übermittelt dabei technisch die IP-Adresse, jedoch durch <code>referrerpolicy=no-referrer</code> nicht die besuchte Unterseite. Ein Service Worker (PWA) speichert statische Inhalte lokal.</p>
<h2>5. Affiliate-Programme</h2>
<p>Affiliate-Funktionen sind derzeit deaktiviert. Die Website gibt daher keine Affiliate-Links oder entsprechenden Trackingparameter aus.</p>
<h2>6. Deine Rechte</h2>
<p>Du hast Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie ein Beschwerderecht bei einer Aufsichtsbehörde.</p>`,
  );

export const buildAssetNotices = (rows, baseUrl) => {
  const entries = rows
    .filter((row) => hasValue(row.image_url))
    .map((row) => {
      const local = String(row.image_url).startsWith('/');
      const source = local
        ? `<code>${esc(row.image_url)}</code>`
        : `<a href="${esc(row.image_url)}" rel="nofollow noopener noreferrer">Originalquelle</a>`;
      return `<li><strong>${esc(row.name)}</strong> — ${esc(row.manufacturer)} · ${source} · Rechte: jeweiliger Hersteller bzw. dort genannter Rechteinhaber; keine freie Lizenz behauptet.</li>`;
    })
    .join('');

  return legalPage(
    'Bildnachweise | AR/XR Brillen Vergleich',
    'Quellen- und Rechtehinweise für Produktbilder im AR/XR Brillen Vergleich.',
    `${baseUrl}asset-notices.html`,
    baseUrl,
    `<h1>Bildnachweise</h1>
<p>Produktnamen und Marken gehören den jeweiligen Rechteinhabern. Externe Produktabbildungen dienen ausschließlich der redaktionellen Identifikation im Geräteverzeichnis. Sie werden nicht als frei lizenziert ausgewiesen und bleiben Eigentum der jeweils genannten Hersteller oder ursprünglichen Rechteinhaber.</p>
<p>Die lokal erzeugten schematischen Brillen-Platzhalter sowie Website-Icon und Open-Graph-Grafiken sind Projektgrafiken. Bei einem fehlerhaften Nachweis oder einem Löschwunsch nutze bitte die Kontaktmöglichkeit im <a href="/impressum.html">Impressum</a>.</p>
<h2>Verwendete Produktabbildungen (${entries ? rows.filter((row) => hasValue(row.image_url)).length : 0})</h2>
<ul>${entries}</ul>`,
  );
};
