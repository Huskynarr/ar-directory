import { mkdir, readFile, writeFile } from 'node:fs/promises';
import Papa from 'papaparse';
import {
  assignSlugs,
  buildDatenschutz,
  buildDevicePage,
  buildGlossary,
  buildImpressum,
  buildModelIndex,
} from './lib/render-pages.mjs';

const INPUT_CSV_PATH = 'public/data/ar_glasses.csv';
const OUTPUT_CSV_PATH = 'public/data/ar_glasses.csv';
const OUTPUT_METADATA_PATH = 'public/data/ar_glasses.metadata.json';
const OUTPUT_STRUCTURED_DATA_PATH = 'public/data/structured-data.json';
const OUTPUT_SITEMAP_PATH = 'public/sitemap.xml';
const OUTPUT_LLMS_PATH = 'public/llms.txt';
const OUTPUT_LLMS_FULL_PATH = 'public/llms-full.txt';
const OUTPUT_AI_SEARCH_PATH = 'public/ai-search.json';

const SOURCE_DATASET = 'curated_ar_xr_directory_v2';
const BASE_URL = 'https://ardirectory.huskynarr.de/';
const SOURCE_PAGE = 'https://huskynarr.de/';

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]+/g;

const sanitize = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(CONTROL_CHAR_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const safeHttpUrl = (value) => {
  const input = sanitize(value);
  if (!input) {
    return '';
  }

  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
};

// Image URLs may be absolute http(s) URLs OR root-relative local asset paths
// (e.g. "/images/manufacturers/x.png") produced by the image-enrichment step.
const safeImageUrl = (value) => {
  const input = sanitize(value);
  if (!input) {
    return '';
  }
  if (input.startsWith('/')) {
    return input;
  }
  return safeHttpUrl(input);
};

const normalizeCategory = (value) => {
  const text = sanitize(value).toUpperCase();
  return text === 'XR' ? 'XR' : 'AR';
};

const toNumberOrEmpty = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value).trim();
  if (!text) {
    return '';
  }
  const normalized = text.replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : '';
};

const parseCsv = async (path) => {
  const csvText = await readFile(path, 'utf8');
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const rows = Array.isArray(parsed.data) ? parsed.data : [];

  // Papa flags recoverable quoting quirks (a stray quoted trailing field, mixed
  // CRLF endings) as errors while still returning usable rows. Only treat it as
  // fatal when nothing parsed; otherwise warn and continue, since the generator
  // rewrites every field on output and thereby repairs the artifact.
  if (parsed.errors?.length) {
    if (!rows.length) {
      throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);
    }
    console.warn(`! CSV parsed with ${parsed.errors.length} recoverable warning(s); first: ${parsed.errors[0].message}`);
  }

  return { rows };
};

const OUTPUT_FIELDS = [
  'id',
  'short_name',
  'name',
  'manufacturer',
  'image_url',
  'official_url',
  'announced_date',
  'release_date',
  'price_usd',
  'xr_category',
  'active_distribution',
  'eol_status',
  'eol_date',
  'lifecycle_notes',
  'lifecycle_source',
  'software',
  'compute_unit',
  'display_type',
  'optics',
  'fov_horizontal_deg',
  'fov_vertical_deg',
  'fov_diagonal_deg',
  'resolution_per_eye',
  'refresh_hz',
  'weight_g',
  'tracking',
  'eye_tracking',
  'hand_tracking',
  'passthrough',
  'chipset',
  'brightness_nits',
  'connectivity',
  'audio',
  'battery',
  'ipd_mm',
  'prescription_support',
  'camera',
  'source_dataset',
  'source_page',
  'dataset_retrieved_at',
];

// Treat the same "no data" markers the front-end (src/utils.js) treats as unknown.
const UNKNOWN_VALUES = new Set(['', 'k.a.', 'k. a.', 'n/a', 'na', 'unknown', 'unbekannt', '-', '–', 'null', 'undefined']);
const hasValue = (value) => !UNKNOWN_VALUES.has(String(value ?? '').trim().toLowerCase());

const xmlEscape = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const buildMetadata = (rows, retrievedAt) => {
  const arRecords = rows.filter((row) => row.xr_category === 'AR').length;
  const xrRecords = rows.filter((row) => row.xr_category === 'XR').length;
  const manufacturers = [...new Set(rows.map((row) => row.manufacturer).filter(Boolean))];

  // Field-level coverage so consumers can see how complete the dataset is.
  const coverage = {};
  for (const field of OUTPUT_FIELDS) {
    const filled = rows.filter((row) => hasValue(row[field])).length;
    coverage[field] = {
      filled,
      percent: rows.length ? Math.round((filled / rows.length) * 1000) / 10 : 0,
    };
  }

  const releaseDates = rows.map((row) => row.release_date).filter(hasValue).sort();
  const prices = rows.map((row) => Number(row.price_usd)).filter((value) => Number.isFinite(value) && value > 0);

  return {
    generated_at: retrievedAt,
    source_dataset: SOURCE_DATASET,
    source_page: SOURCE_PAGE,
    records: rows.length,
    ar_records: arRecords,
    xr_records: xrRecords,
    manufacturers: manufacturers.length,
    official_shop_links: rows.filter((row) => row.official_url).length,
    image_links: rows.filter((row) => hasValue(row.image_url)).length,
    active_models: rows.filter((row) => sanitize(row.active_distribution).toLowerCase().startsWith('ja')).length,
    discontinued_models: rows.filter((row) => {
      const status = String(row.eol_status || '').toLowerCase();
      if (!status || status.includes('aktiv') || status.includes('ohne eol')) return false;
      return /eol|discontinued|eingestellt|support beendet|support-ende/.test(status);
    }).length,
    newest_release: releaseDates.at(-1) || '',
    oldest_release: releaseDates[0] || '',
    price_range_usd: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    field_coverage: coverage,
    note: 'Curated local dataset without external comparison-provider links; image_url can be enriched from official manufacturer pages.',
  };
};

const buildStructuredData = (rows, retrievedAt, slugs = new Map()) => {
  const itemListElement = rows.map((row, index) => {
    const offers = Number(row.price_usd) > 0
      ? {
          '@type': 'Offer',
          priceCurrency: 'USD',
          price: String(row.price_usd),
          availability: sanitize(row.active_distribution).toLowerCase().startsWith('ja')
            ? 'https://schema.org/InStock'
            : 'https://schema.org/Discontinued',
        }
      : undefined;

    const product = {
      '@type': 'Product',
      name: row.name,
      category: row.xr_category === 'XR' ? 'XR-Headset' : 'AR-Brille',
      brand: { '@type': 'Brand', name: row.manufacturer },
    };
    if (hasValue(row.image_url)) product.image = row.image_url;
    if (slugs.get(row.id)) product.url = `${BASE_URL}modelle/${slugs.get(row.id)}.html`;
    if (hasValue(row.official_url)) product.sameAs = row.official_url;
    if (hasValue(row.release_date)) product.releaseDate = row.release_date;
    if (offers) product.offers = offers;

    return {
      '@type': 'ListItem',
      position: index + 1,
      item: product,
    };
  });

  return [
    {
      '@type': 'WebSite',
      '@id': `${BASE_URL}#website`,
      url: BASE_URL,
      name: 'AR/XR Brillen Vergleich',
      inLanguage: 'de-DE',
      description:
        'Vergleichsseite fuer AR- und XR-Brillen mit Spezifikationen, Preisen, Shop-Links und Lifecycle-Status.',
    },
    {
      '@type': 'CollectionPage',
      '@id': `${BASE_URL}#collection`,
      url: BASE_URL,
      name: 'AR/XR Brillen Modelle',
      isPartOf: { '@id': `${BASE_URL}#website` },
      about: ['AR Brillen', 'XR Brillen', 'Smart Glasses', 'Headsets'],
      dateModified: retrievedAt,
    },
    {
      '@type': 'Dataset',
      '@id': `${BASE_URL}data/ar_glasses.csv#dataset`,
      name: 'AR/XR Glasses Directory Dataset',
      url: `${BASE_URL}data/ar_glasses.csv`,
      description: `Kuratierter Datensatz mit ${rows.length} AR/XR-Brillen inkl. Spezifikationen, Preisen und Lifecycle-Status.`,
      isAccessibleForFree: true,
      inLanguage: 'de-DE',
      dateModified: retrievedAt,
      distribution: [
        {
          '@type': 'DataDownload',
          encodingFormat: 'text/csv',
          contentUrl: `${BASE_URL}data/ar_glasses.csv`,
        },
        {
          '@type': 'DataDownload',
          encodingFormat: 'application/json',
          contentUrl: `${BASE_URL}data/ar_glasses.metadata.json`,
        },
      ],
    },
    {
      '@type': 'ItemList',
      '@id': `${BASE_URL}#modelliste`,
      name: 'AR/XR Brillen Modelle',
      numberOfItems: rows.length,
      itemListElement,
    },
  ];
};

const buildSitemap = (lastmod, rows = [], slugs = new Map()) => {
  const urls = [
    { loc: BASE_URL, changefreq: 'daily', priority: '1.0' },
    { loc: `${BASE_URL}modelle/`, changefreq: 'weekly', priority: '0.9' },
    { loc: `${BASE_URL}glossar.html`, changefreq: 'monthly', priority: '0.6' },
    { loc: `${BASE_URL}impressum.html`, changefreq: 'yearly', priority: '0.3' },
    { loc: `${BASE_URL}datenschutz.html`, changefreq: 'yearly', priority: '0.3' },
    { loc: `${BASE_URL}data/ar_glasses.csv`, changefreq: 'daily', priority: '0.8' },
    { loc: `${BASE_URL}data/ar_glasses.metadata.json`, changefreq: 'daily', priority: '0.7' },
    { loc: `${BASE_URL}llms.txt`, changefreq: 'weekly', priority: '0.7' },
    { loc: `${BASE_URL}llms-full.txt`, changefreq: 'weekly', priority: '0.6' },
    ...rows.map((row) => ({ loc: `${BASE_URL}modelle/${slugs.get(row.id)}.html`, changefreq: 'weekly', priority: '0.7' })),
  ];
  const body = urls
    .map(
      (url) =>
        `  <url>\n    <loc>${xmlEscape(url.loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${url.changefreq}</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
};

const buildLlms = (metadata, lastmod) =>
  `# AR/XR Brillen Vergleich

Kurzer Maschinenindex fuer LLMs und Suchsysteme.

- Hauptseite: ${BASE_URL}
- Sprache: de-DE
- Thema: Vergleich von AR- und XR-Brillen (aktuell + historisch)
- Datensatz: ${metadata.records} Modelle (${metadata.ar_records} AR, ${metadata.xr_records} XR) von ${metadata.manufacturers} Herstellern

## Kerninhalte

- Karten- und Tabellenansicht fuer AR/XR Brillen
- Filter fuer Display, Optik, Tracking, FOV, Refresh, Preis, Lifecycle
- Shop-Links, Preise, aktiver Vertrieb, Software und EOL-Status
- Direktvergleich von bis zu sechs Modellen inkl. Radar-Chart
- Legacy-Modelle inkl. HoloLens 1 und weitere historische Brillen

## Strukturierte Datenquellen

- CSV: ${BASE_URL}data/ar_glasses.csv
- Metadata JSON: ${BASE_URL}data/ar_glasses.metadata.json
- JSON-LD Strukturdaten: ${BASE_URL}data/structured-data.json
- AI Search Manifest: ${BASE_URL}ai-search.json
- Vollindex: ${BASE_URL}llms-full.txt

## Relevante Entitaeten

- AR Brillen
- XR Brillen
- Smart Glasses
- Head-mounted Displays
- AI Glasses

## Aktualisierung

Letzte Datengenerierung: ${lastmod}.
`;

const fmt = (value, suffix = '') => (hasValue(value) ? `${value}${suffix}` : 'k. A.');

const buildLlmsFull = (rows, metadata, lastmod) => {
  const header = `# AR/XR Brillen Vergleich – Vollindex

Maschinenlesbarer Volldatensatz aller gelisteten AR/XR-Brillen. Sprache: de-DE. Quelle: ${BASE_URL}
Stand: ${lastmod} | ${metadata.records} Modelle (${metadata.ar_records} AR, ${metadata.xr_records} XR) | ${metadata.manufacturers} Hersteller

Felder pro Modell: Hersteller, Kategorie, Release/Ankuendigung, Preis (USD), Display, Optik, FOV (H/V/D in Grad),
Aufloesung pro Auge, Refresh (Hz), Gewicht (g), Tracking, Eye-/Hand-Tracking, Passthrough, Software, Recheneinheit,
Lifecycle/Vertriebsstatus und offizielle Produktseite.

`;

  const blocks = rows
    .map((row) => {
      const fov = [row.fov_horizontal_deg, row.fov_vertical_deg, row.fov_diagonal_deg]
        .map((value) => (hasValue(value) ? value : '–'))
        .join(' / ');
      return `## ${row.name} (${row.manufacturer})
- Kategorie: ${row.xr_category}
- Angekuendigt: ${fmt(row.announced_date)} | Release: ${fmt(row.release_date)}
- Preis: ${hasValue(row.price_usd) ? `${row.price_usd} USD` : 'k. A.'}
- Display: ${fmt(row.display_type)} | Optik: ${fmt(row.optics)}
- FOV (H/V/D Grad): ${fov}
- Aufloesung pro Auge: ${fmt(row.resolution_per_eye)} | Refresh: ${fmt(row.refresh_hz, ' Hz')}
- Gewicht: ${fmt(row.weight_g, ' g')}
- Tracking: ${fmt(row.tracking)} | Eye-Tracking: ${fmt(row.eye_tracking)} | Hand-Tracking: ${fmt(row.hand_tracking)} | Passthrough: ${fmt(row.passthrough)}
- Software: ${fmt(row.software)} | Recheneinheit: ${fmt(row.compute_unit)}
- Lifecycle: ${fmt(row.eol_status)} | Aktiver Vertrieb: ${fmt(row.active_distribution)}${hasValue(row.lifecycle_notes) ? ` – ${row.lifecycle_notes}` : ''}
- Offizielle Seite: ${fmt(row.official_url)}`;
    })
    .join('\n\n');

  return `${header}${blocks}\n`;
};

const buildAiSearch = (metadata, lastmod) => ({
  name: 'AR/XR Brillen Vergleich',
  version: '1.1',
  language: 'de-DE',
  primary_url: BASE_URL,
  description:
    'Vergleich fuer AR- und XR-Brillen mit Spezifikationen, Preisen, Shop-Links, Lifecycle und EOL-Status.',
  dataset_summary: {
    records: metadata.records,
    ar_records: metadata.ar_records,
    xr_records: metadata.xr_records,
    manufacturers: metadata.manufacturers,
    newest_release: metadata.newest_release,
  },
  resources: [
    { type: 'web', url: BASE_URL, title: 'AR/XR Brillen Vergleich Startseite' },
    { type: 'dataset', format: 'csv', url: `${BASE_URL}data/ar_glasses.csv`, title: 'AR/XR Dataset CSV' },
    {
      type: 'dataset_metadata',
      format: 'json',
      url: `${BASE_URL}data/ar_glasses.metadata.json`,
      title: 'AR/XR Dataset Metadata',
    },
    {
      type: 'structured_data',
      format: 'application/ld+json',
      url: `${BASE_URL}data/structured-data.json`,
      title: 'AR/XR JSON-LD Strukturdaten',
    },
    { type: 'llm_index', format: 'text/plain', url: `${BASE_URL}llms.txt`, title: 'LLM Index' },
    { type: 'llm_index_full', format: 'text/plain', url: `${BASE_URL}llms-full.txt`, title: 'LLM Full Index' },
  ],
  topics: ['AR Brillen', 'XR Brillen', 'Smart Glasses', 'AI Glasses', 'Preisvergleich', 'EOL', 'Tracking', 'FOV', 'Refresh Rate'],
  updated_at: lastmod,
});

const main = async () => {
  const retrievedAt = new Date().toISOString();
  const lastmod = retrievedAt.slice(0, 10);
  const { rows } = await parseCsv(INPUT_CSV_PATH);

  const normalizedRows = rows
    .map((row) => ({
      id: sanitize(row.id),
      short_name: sanitize(row.short_name),
      name: sanitize(row.name),
      manufacturer: sanitize(row.manufacturer),
      image_url: safeImageUrl(row.image_url),
      official_url: safeHttpUrl(row.official_url),
      announced_date: sanitize(row.announced_date),
      release_date: sanitize(row.release_date),
      price_usd: toNumberOrEmpty(row.price_usd),
      xr_category: normalizeCategory(row.xr_category),
      active_distribution: sanitize(row.active_distribution),
      eol_status: sanitize(row.eol_status),
      eol_date: sanitize(row.eol_date),
      lifecycle_notes: sanitize(row.lifecycle_notes),
      lifecycle_source: safeHttpUrl(row.lifecycle_source),
      software: sanitize(row.software),
      compute_unit: sanitize(row.compute_unit),
      display_type: sanitize(row.display_type),
      optics: sanitize(row.optics),
      fov_horizontal_deg: toNumberOrEmpty(row.fov_horizontal_deg),
      fov_vertical_deg: toNumberOrEmpty(row.fov_vertical_deg),
      fov_diagonal_deg: toNumberOrEmpty(row.fov_diagonal_deg),
      resolution_per_eye: sanitize(row.resolution_per_eye),
      refresh_hz: toNumberOrEmpty(row.refresh_hz),
      weight_g: toNumberOrEmpty(row.weight_g),
      tracking: sanitize(row.tracking),
      eye_tracking: sanitize(row.eye_tracking),
      hand_tracking: sanitize(row.hand_tracking),
      passthrough: sanitize(row.passthrough),
      chipset: sanitize(row.chipset),
      brightness_nits: toNumberOrEmpty(row.brightness_nits),
      connectivity: sanitize(row.connectivity),
      audio: sanitize(row.audio),
      battery: sanitize(row.battery),
      ipd_mm: sanitize(row.ipd_mm),
      prescription_support: sanitize(row.prescription_support),
      camera: sanitize(row.camera),
      source_dataset: SOURCE_DATASET,
      source_page: SOURCE_PAGE,
      dataset_retrieved_at: retrievedAt,
    }))
    .filter((row) => row.name && row.manufacturer)
    .sort((left, right) => left.name.localeCompare(right.name, 'de', { sensitivity: 'base' }));

  const csv = Papa.unparse(normalizedRows, { columns: OUTPUT_FIELDS });

  await mkdir('public/data', { recursive: true });
  await writeFile(OUTPUT_CSV_PATH, `${csv}\n`, 'utf8');

  const metadata = buildMetadata(normalizedRows, retrievedAt);
  await writeFile(OUTPUT_METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  // Stable per-device slug -> used by sitemap, structured data and static pages.
  const slugs = assignSlugs(normalizedRows);

  // Derived SEO + LLM artifacts so the CSV stays the single source of truth.
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': buildStructuredData(normalizedRows, retrievedAt, slugs),
  };
  await writeFile(OUTPUT_STRUCTURED_DATA_PATH, `${JSON.stringify(structuredData, null, 2)}\n`, 'utf8');
  await writeFile(OUTPUT_SITEMAP_PATH, buildSitemap(lastmod, normalizedRows, slugs), 'utf8');
  await writeFile(OUTPUT_LLMS_PATH, buildLlms(metadata, lastmod), 'utf8');
  await writeFile(OUTPUT_LLMS_FULL_PATH, buildLlmsFull(normalizedRows, metadata, lastmod), 'utf8');
  await writeFile(OUTPUT_AI_SEARCH_PATH, `${JSON.stringify(buildAiSearch(metadata, lastmod), null, 2)}\n`, 'utf8');

  // Curated affiliate deeplink overrides (optional); search links are auto-built.
  let affiliateOverrides = {};
  try {
    affiliateOverrides = JSON.parse(await readFile('public/data/affiliate-overrides.json', 'utf8'));
  } catch {
    affiliateOverrides = {};
  }

  // Editorial descriptions + highlights per device (optional).
  let descriptions = {};
  try {
    descriptions = JSON.parse(await readFile('public/data/descriptions.json', 'utf8'));
  } catch {
    descriptions = {};
  }

  // Static, crawlable pages: one per device + model hub + glossary/FAQ + legal.
  await mkdir('public/modelle', { recursive: true });
  await Promise.all(
    normalizedRows.map((row) =>
      writeFile(
        `public/modelle/${slugs.get(row.id)}.html`,
        buildDevicePage(row, normalizedRows, slugs, BASE_URL, affiliateOverrides, descriptions),
        'utf8',
      ),
    ),
  );
  await writeFile('public/modelle/index.html', buildModelIndex(normalizedRows, slugs, metadata, BASE_URL), 'utf8');
  await writeFile('public/glossar.html', buildGlossary(metadata, BASE_URL), 'utf8');
  await writeFile('public/impressum.html', buildImpressum(metadata, BASE_URL), 'utf8');
  await writeFile('public/datenschutz.html', buildDatenschutz(metadata, BASE_URL), 'utf8');

  console.log(
    `Generated ${normalizedRows.length} curated AR/XR records at ${retrievedAt}\n` +
      `  -> CSV, metadata, structured-data.json, sitemap.xml, llms.txt, llms-full.txt, ai-search.json\n` +
      `  -> ${normalizedRows.length} device pages + modelle/index.html + glossar.html + impressum.html + datenschutz.html`,
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
