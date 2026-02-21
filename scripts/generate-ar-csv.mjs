import { mkdir, readFile, writeFile } from 'node:fs/promises';
import Papa from 'papaparse';

const INPUT_CSV_PATH = 'public/data/ar_glasses.csv';
const OUTPUT_CSV_PATH = 'public/data/ar_glasses.csv';
const OUTPUT_METADATA_PATH = 'public/data/ar_glasses.metadata.json';
const SOURCE_DATASET = 'curated_ar_xr_directory_v2';
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

  if (parsed.errors?.length) {
    throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);
  }

  return {
    rows: Array.isArray(parsed.data) ? parsed.data : [],
  };
};

const main = async () => {
  const retrievedAt = new Date().toISOString();
  const { rows } = await parseCsv(INPUT_CSV_PATH);

  const normalizedRows = rows
    .map((row) => ({
      id: sanitize(row.id),
      short_name: sanitize(row.short_name),
      name: sanitize(row.name),
      manufacturer: sanitize(row.manufacturer),
      image_url: safeHttpUrl(row.image_url),
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
      source_dataset: SOURCE_DATASET,
      source_page: SOURCE_PAGE,
      dataset_retrieved_at: retrievedAt,
    }))
    .filter((row) => row.name && row.manufacturer)
    .sort((left, right) => left.name.localeCompare(right.name, 'de', { sensitivity: 'base' }));

  const outputFields = [
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
    'source_dataset',
    'source_page',
    'dataset_retrieved_at',
  ];

  const csv = Papa.unparse(normalizedRows, {
    columns: outputFields,
  });

  await mkdir('public/data', { recursive: true });
  await writeFile(OUTPUT_CSV_PATH, `${csv}\n`, 'utf8');

  const metadata = {
    generated_at: retrievedAt,
    source_dataset: SOURCE_DATASET,
    source_page: SOURCE_PAGE,
    records: normalizedRows.length,
    ar_records: normalizedRows.filter((row) => row.xr_category === 'AR').length,
    xr_records: normalizedRows.filter((row) => row.xr_category === 'XR').length,
    official_shop_links: normalizedRows.filter((row) => row.official_url).length,
    note: 'Curated local dataset without external comparison-provider links; image_url can be enriched from official manufacturer pages.',
  };

  await writeFile(OUTPUT_METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

  console.log(
    `Generated ${normalizedRows.length} curated AR/XR records at ${retrievedAt} (no external comparison-provider links; manufacturer image enrichment optional).`,
  );
};

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
