import { mkdir, writeFile } from 'node:fs/promises';

const SUMMARY_URL = 'https://vr-compare.com/api/headsets?hidden=false&detailLevel=summary';
const SOURCE_PAGE_URL = 'https://vr-compare.com/';
const SOURCE_DETAIL_BASE = 'https://vr-compare.com/headset/';
const IMAGE_BASE = 'https://vr-compare.com/img/headsets/preview/';
const LEGACY_SOURCE_DATASET = 'manual_legacy_seed_v1';
const LEGACY_SOURCE_PAGE = 'https://en.wikipedia.org/wiki/Smartglasses';
const XR_GLASSES_KEYWORDS = ['glass', 'glasses', 'eyewear', 'nxtwear', 'smarteyeglass'];
const XR_GLASSES_EXCLUDE_KEYWORDS = [
  '12k qled',
  'quest',
  'vive',
  'rift',
  'index',
  'varjo',
  'reverb',
  'ps vr',
  'playstation vr',
];

const lifecycleOverrides = {
  microsofthololens2: {
    active_distribution: 'Nein',
    eol_status: 'Support-Ende angekuendigt',
    eol_date: '2027-12-31',
    lifecycle_notes:
      'Microsoft nennt HoloLens 2 als out of stock; Support bis 31 Dec 2027.',
    lifecycle_source: 'https://learn.microsoft.com/en-us/answers/questions/2144910/hololens-2-out-of-stock',
  },
  microsofthololens: {
    active_distribution: 'Nein',
    eol_status: 'EOL / Support beendet',
    eol_date: '2024-12-10',
    lifecycle_notes:
      'Microsoft Release Notes: Support fuer HoloLens (1st gen) endete am 10 Dec 2024.',
    lifecycle_source: 'https://learn.microsoft.com/en-us/hololens/hololens-release-notes',
  },
};

const nameOverrides = {
  microsofthololens: 'Microsoft HoloLens 1',
};

const legacySeedRecords = [
  {
    id: 'legacy-microsofthololens',
    short_name: 'microsofthololens',
    name: 'Microsoft HoloLens 1',
    manufacturer: 'Microsoft',
    official_url: 'https://learn.microsoft.com/en-us/hololens/hololens1-hardware',
    announced_date: '2015-01-21',
    release_date: '2016-03-30',
    price_usd: 3000,
    active_distribution: 'Nein',
    eol_status: 'EOL / Support beendet',
    eol_date: '2024-12-10',
    lifecycle_notes: 'Legacy-Seed (Fallback), falls API-Eintrag fehlt.',
    lifecycle_source: 'https://learn.microsoft.com/en-us/hololens/hololens-release-notes',
    software: 'Windows Holographic',
    compute_unit: 'Standalone',
    display_type: 'LCoS',
    optics: 'Waveguides',
    fov_horizontal_deg: 30,
    fov_vertical_deg: 17,
    resolution_per_eye: '1268x720',
    refresh_hz: 60,
    weight_g: 579,
    tracking: 'Inside-out',
    eye_tracking: 'Nein',
    hand_tracking: 'Ja',
    passthrough: 'Native passthrough, 2MP camera',
    source_page: 'https://learn.microsoft.com/en-us/hololens/hololens1-hardware',
  },
  {
    id: 'legacy-epsonmoveriobt-200',
    short_name: 'epsonmoveriobt-200',
    name: 'Epson Moverio BT-200',
    manufacturer: 'Epson',
    official_url: 'https://epson.com/For-Work/Wearables/Smart-Glasses/c/w420',
    announced_date: '2014-01-07',
    release_date: '2014-05-01',
    price_usd: 699,
    active_distribution: 'Nein',
    eol_status: 'EOL / Discontinued',
    lifecycle_notes: 'Legacy AR-Brille (Seed), nicht mehr aktiv im Handel.',
    lifecycle_source: 'https://en.wikipedia.org/wiki/Epson_Moverio',
    software: 'Android',
    compute_unit: 'Standalone',
    display_type: 'Si-OLED',
    optics: 'Optical see-through',
    resolution_per_eye: '960x540',
    tracking: 'Non-positional',
    eye_tracking: 'Nein',
    hand_tracking: 'Nein',
    passthrough: 'No camera passthrough',
    source_page: 'https://en.wikipedia.org/wiki/Epson_Moverio',
  },
  {
    id: 'legacy-sonysmarteyeglassde',
    short_name: 'sonysmarteyeglassde',
    name: 'Sony SmartEyeglass (SED-E1)',
    manufacturer: 'Sony',
    official_url: 'https://developer.sony.com/develop/smarteyeglass-sed-e1/',
    announced_date: '2014-09-03',
    release_date: '2015-03-10',
    price_usd: 840,
    active_distribution: 'Nein',
    eol_status: 'EOL / Discontinued',
    lifecycle_notes: 'Developer Edition, inzwischen eingestellt.',
    lifecycle_source: 'https://developer.sony.com/develop/smarteyeglass-sed-e1/',
    software: 'Android',
    compute_unit: 'Phone',
    display_type: 'Monochrome OLED',
    optics: 'Holographic waveguide',
    resolution_per_eye: '419x138',
    tracking: 'Non-positional',
    eye_tracking: 'Nein',
    hand_tracking: 'Nein',
    passthrough: 'Native passthrough',
    source_page: 'https://developer.sony.com/develop/smarteyeglass-sed-e1/',
  },
  {
    id: 'legacy-reconjet',
    short_name: 'reconjet',
    name: 'Recon Jet',
    manufacturer: 'Recon Instruments',
    official_url: 'https://en.wikipedia.org/wiki/Recon_Jet',
    announced_date: '2014-06-12',
    release_date: '2015-04-01',
    price_usd: 699,
    active_distribution: 'Nein',
    eol_status: 'EOL / Discontinued',
    lifecycle_notes: 'Fruehe Sport-AR-Brille, Produktlinie eingestellt.',
    lifecycle_source: 'https://en.wikipedia.org/wiki/Recon_Instruments',
    software: 'Android',
    compute_unit: 'Standalone',
    display_type: 'LCOS',
    optics: 'HUD prism',
    tracking: 'Non-positional',
    eye_tracking: 'Nein',
    hand_tracking: 'Nein',
    passthrough: 'No camera passthrough',
    source_page: 'https://en.wikipedia.org/wiki/Recon_Jet',
  },
  {
    id: 'legacy-vuzixm100',
    short_name: 'vuzixm100',
    name: 'Vuzix M100',
    manufacturer: 'Vuzix',
    official_url: 'https://www.vuzix.com/pages/vuzix-m100',
    announced_date: '2012-12-05',
    release_date: '2013-08-15',
    price_usd: 999,
    active_distribution: 'Nein',
    eol_status: 'EOL / Discontinued',
    lifecycle_notes: 'Legacy-Modell aus der fruehen Smart-Glasses-Generation.',
    lifecycle_source: 'https://www.vuzix.com/pages/vuzix-m100',
    software: 'Android',
    compute_unit: 'Standalone',
    display_type: 'WQVGA',
    optics: 'Prism',
    resolution_per_eye: '400x240',
    tracking: 'Non-positional',
    eye_tracking: 'Nein',
    hand_tracking: 'Nein',
    passthrough: 'No camera passthrough',
    source_page: 'https://www.vuzix.com/pages/vuzix-m100',
  },
];

const asDate = (value) => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
};

const yesNoUnknown = (value) => {
  if (value === true) {
    return 'Ja';
  }
  if (value === false) {
    return 'Nein';
  }
  return 'Unklar';
};

const toNumberOrEmpty = (value) => {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  return Number.isFinite(value) ? value : '';
};

const sanitize = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/\s+/g, ' ').trim();
};

const escapeCsv = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const pickPrice = (headset) => {
  const values = [headset.price, headset.priceWithControllers, headset.priceWithControllersBaseStations];
  const valid = values.find((price) => Number.isFinite(price));
  return valid ?? '';
};

const isXrGlassesCandidate = (headset) => {
  if (headset.augmentedReality) {
    return false;
  }

  const searchable = sanitize(
    `${headset.name || ''} ${headset.shortName || ''} ${headset.manufacturer?.name || ''}`,
  ).toLowerCase();

  const hasIncludedKeyword = XR_GLASSES_KEYWORDS.some((keyword) => searchable.includes(keyword));
  const hasExcludedKeyword = XR_GLASSES_EXCLUDE_KEYWORDS.some((keyword) =>
    searchable.includes(keyword),
  );

  return hasIncludedKeyword && !hasExcludedKeyword;
};

const mapHeadset = (headset, retrievedAt) => {
  const override = lifecycleOverrides[headset.shortName] ?? {};
  const activeDistribution =
    override.active_distribution ?? (headset.discontinued ? 'Nein' : 'Ja/Unklar');

  const eolStatus =
    override.eol_status ?? (headset.discontinued ? 'EOL / Discontinued' : 'Aktiv oder ohne EOL-Angabe');

  const eolDate = override.eol_date ?? '';

  const lifecycleNotes =
    override.lifecycle_notes ??
    (headset.discontinued
      ? 'Als discontinued markiert.'
      : 'Keine eindeutige EOL-Angabe in den Quelldaten.');

  const lifecycleSource = override.lifecycle_source ?? SOURCE_PAGE_URL;

  const fovDiagonal = toNumberOrEmpty(headset.dFov ?? headset.dFovRendered ?? '');
  const fovHorizontal = toNumberOrEmpty(headset.hFov ?? headset.hFovRendered ?? '');
  const fovVertical = toNumberOrEmpty(headset.vFov ?? headset.vFovRendered ?? '');

  const resolutionPerEye =
    Number.isFinite(headset.hRes) && Number.isFinite(headset.vRes)
      ? `${headset.hRes}x${headset.vRes}`
      : '';

  const software = sanitize(headset.operatingSystem || headset.platform || '');

  return {
    id: sanitize(headset.id || headset._id),
    short_name: sanitize(headset.shortName),
    name: sanitize(nameOverrides[headset.shortName] || headset.name),
    manufacturer: sanitize(headset.manufacturer?.name || ''),
    image_url: `${IMAGE_BASE}${encodeURIComponent(headset.shortName)}.png`,
    vrcompare_url: `${SOURCE_DETAIL_BASE}${encodeURIComponent(headset.shortName)}`,
    official_url: sanitize(headset.externalUrl || ''),
    announced_date: asDate(headset.announcedDate),
    release_date: asDate(headset.releaseDate),
    price_usd: pickPrice(headset),
    xr_category: headset.augmentedReality ? 'AR' : 'XR',
    active_distribution: activeDistribution,
    eol_status: eolStatus,
    eol_date: eolDate,
    lifecycle_notes: lifecycleNotes,
    lifecycle_source: lifecycleSource,
    software,
    compute_unit: sanitize(headset.computeUnit || ''),
    display_type: sanitize(headset.display || ''),
    optics: sanitize(headset.optics || ''),
    fov_horizontal_deg: fovHorizontal,
    fov_vertical_deg: fovVertical,
    fov_diagonal_deg: fovDiagonal,
    resolution_per_eye: resolutionPerEye,
    refresh_hz: toNumberOrEmpty(headset.refreshRate),
    weight_g: toNumberOrEmpty(headset.weight),
    tracking: sanitize(headset.tracking || ''),
    eye_tracking: yesNoUnknown(headset.eyeTracking),
    hand_tracking: yesNoUnknown(headset.handTracking),
    passthrough: sanitize(headset.passthrough || ''),
    source_dataset: SUMMARY_URL,
    source_page: SOURCE_PAGE_URL,
    dataset_retrieved_at: retrievedAt,
  };
};

const mapLegacySeed = (seed, retrievedAt) => ({
  id: sanitize(seed.id),
  short_name: sanitize(seed.short_name),
  name: sanitize(seed.name),
  manufacturer: sanitize(seed.manufacturer),
  image_url: sanitize(seed.image_url || ''),
  vrcompare_url: sanitize(seed.vrcompare_url || ''),
  official_url: sanitize(seed.official_url || ''),
  announced_date: asDate(seed.announced_date),
  release_date: asDate(seed.release_date),
  price_usd: toNumberOrEmpty(seed.price_usd),
  xr_category: sanitize(seed.xr_category || 'AR'),
  active_distribution: sanitize(seed.active_distribution || 'Nein'),
  eol_status: sanitize(seed.eol_status || 'EOL / Discontinued'),
  eol_date: asDate(seed.eol_date),
  lifecycle_notes: sanitize(seed.lifecycle_notes || 'Legacy-Seed-Eintrag.'),
  lifecycle_source: sanitize(seed.lifecycle_source || LEGACY_SOURCE_PAGE),
  software: sanitize(seed.software || ''),
  compute_unit: sanitize(seed.compute_unit || ''),
  display_type: sanitize(seed.display_type || ''),
  optics: sanitize(seed.optics || ''),
  fov_horizontal_deg: toNumberOrEmpty(seed.fov_horizontal_deg),
  fov_vertical_deg: toNumberOrEmpty(seed.fov_vertical_deg),
  fov_diagonal_deg: toNumberOrEmpty(seed.fov_diagonal_deg),
  resolution_per_eye: sanitize(seed.resolution_per_eye || ''),
  refresh_hz: toNumberOrEmpty(seed.refresh_hz),
  weight_g: toNumberOrEmpty(seed.weight_g),
  tracking: sanitize(seed.tracking || ''),
  eye_tracking: sanitize(seed.eye_tracking || 'Unklar'),
  hand_tracking: sanitize(seed.hand_tracking || 'Unklar'),
  passthrough: sanitize(seed.passthrough || ''),
  source_dataset: LEGACY_SOURCE_DATASET,
  source_page: sanitize(seed.source_page || LEGACY_SOURCE_PAGE),
  dataset_retrieved_at: retrievedAt,
});

const toCsv = (rows) => {
  if (rows.length === 0) {
    return '';
  }
  const columns = Object.keys(rows[0]);
  const header = columns.map(escapeCsv).join(',');
  const lines = rows.map((row) => columns.map((column) => escapeCsv(row[column])).join(','));
  return [header, ...lines].join('\n');
};

const response = await fetch(SUMMARY_URL, {
  signal: AbortSignal.timeout(60_000),
  headers: {
    accept: 'application/json',
  },
});

if (!response.ok) {
  throw new Error(`Request failed for ${SUMMARY_URL} with status ${response.status}`);
}

const rawJson = await response.text();

if (!rawJson || rawJson.trim().length === 0) {
  throw new Error(`No data returned from ${SUMMARY_URL}`);
}

let allHeadsets;
try {
  allHeadsets = JSON.parse(rawJson);
} catch {
  throw new Error(`Invalid JSON returned from ${SUMMARY_URL}`);
}

if (!Array.isArray(allHeadsets)) {
  throw new Error(`Unexpected payload format from ${SUMMARY_URL}`);
}
const retrievedAt = new Date().toISOString();

const apiArHeadsets = allHeadsets
  .filter((headset) => headset.visible && headset.augmentedReality)
  .map((headset) => mapHeadset(headset, retrievedAt));

const apiXrGlassesHeadsets = allHeadsets
  .filter((headset) => headset.visible && isXrGlassesCandidate(headset))
  .map((headset) => mapHeadset(headset, retrievedAt));

const apiSelectedByShortName = new Map();
for (const row of [...apiArHeadsets, ...apiXrGlassesHeadsets]) {
  if (!apiSelectedByShortName.has(row.short_name)) {
    apiSelectedByShortName.set(row.short_name, row);
  }
}

const apiXrHeadsets = [...apiSelectedByShortName.values()];
const existingShortNames = new Set(apiXrHeadsets.map((row) => row.short_name));
const legacySeedHeadsets = legacySeedRecords
  .map((seed) => mapLegacySeed(seed, retrievedAt))
  .filter((seedRow) => !existingShortNames.has(seedRow.short_name));

const xrGlassesHeadsets = [...apiXrHeadsets, ...legacySeedHeadsets].sort((left, right) =>
  left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }),
);

await mkdir('public/data', { recursive: true });
await writeFile('public/data/ar_glasses.csv', `${toCsv(xrGlassesHeadsets)}\n`, 'utf8');
await writeFile(
  'public/data/ar_glasses.metadata.json',
  JSON.stringify(
    {
      generated_at: retrievedAt,
      source_dataset: SUMMARY_URL,
      source_page: SOURCE_PAGE_URL,
      records: xrGlassesHeadsets.length,
      api_records: apiXrHeadsets.length,
      api_ar_records: apiArHeadsets.length,
      api_xr_glasses_records: apiXrGlassesHeadsets.length,
      legacy_seed_total: legacySeedRecords.length,
      legacy_seed_added: legacySeedHeadsets.length,
    },
    null,
    2,
  ),
  'utf8',
);

console.log(
  `Generated ${xrGlassesHeadsets.length} XR glasses records at ${retrievedAt} (${legacySeedHeadsets.length} legacy seeds added)`,
);
