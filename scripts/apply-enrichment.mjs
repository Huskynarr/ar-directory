// Applies a research-enrichment payload (field changes + new devices) to the
// curated CSV. Run `node scripts/generate-ar-csv.mjs` afterwards to normalize
// and regenerate all derived artifacts.
//
// Usage: node scripts/apply-enrichment.mjs [path-to-enrichment.json]
// Payload shape: { enriched: [{ id, changes: {field: value} }], newDevices: [{ name, manufacturer, ... }] }

import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import Papa from 'papaparse';

const CSV_PATH = 'public/data/ar_glasses.csv';
const PAYLOAD_PATH = process.argv[2] || 'scripts/enrichment-2026.json';

const OUTPUT_FIELDS = [
  'id', 'short_name', 'name', 'manufacturer', 'image_url', 'official_url',
  'announced_date', 'release_date', 'price_usd', 'xr_category', 'active_distribution',
  'eol_status', 'eol_date', 'lifecycle_notes', 'lifecycle_source', 'software',
  'compute_unit', 'display_type', 'optics', 'fov_horizontal_deg', 'fov_vertical_deg',
  'fov_diagonal_deg', 'resolution_per_eye', 'refresh_hz', 'weight_g', 'tracking',
  'eye_tracking', 'hand_tracking', 'passthrough', 'source_dataset', 'source_page',
  'dataset_retrieved_at',
];

// Fields a research agent is allowed to overwrite. Identity, image and provenance
// columns are intentionally excluded so enrichment can never clobber them.
const MUTABLE_FIELDS = new Set([
  'official_url', 'announced_date', 'release_date', 'price_usd', 'xr_category',
  'active_distribution', 'eol_status', 'eol_date', 'lifecycle_notes', 'lifecycle_source',
  'software', 'compute_unit', 'display_type', 'optics', 'fov_horizontal_deg',
  'fov_vertical_deg', 'fov_diagonal_deg', 'resolution_per_eye', 'refresh_hz', 'weight_g',
  'tracking', 'eye_tracking', 'hand_tracking', 'passthrough',
]);

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const makeId = (existing) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const bytes = randomBytes(9);
    let id = '';
    for (let i = 0; i < 9; i += 1) id += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
    if (!existing.has(id)) return id;
  }
  throw new Error('Could not generate a unique id');
};

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');
const norm = (value) => String(value ?? '').trim().toLowerCase();

const main = async () => {
  const csvText = await readFile(CSV_PATH, 'utf8');
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = Array.isArray(parsed.data) ? parsed.data : [];
  // Tolerate recoverable quoting/CRLF warnings as long as rows parsed; rows are
  // fully rewritten on output so the artifact gets repaired.
  if (parsed.errors?.length && !rows.length) {
    throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);
  }

  let payload;
  try {
    payload = JSON.parse(await readFile(PAYLOAD_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read enrichment payload at ${PAYLOAD_PATH}: ${error.message}`);
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  const existingIds = new Set(rows.map((row) => row.id));
  const existingKeys = new Set(rows.map((row) => `${norm(row.name)}|${norm(row.manufacturer)}`));

  // 1) Apply field changes to existing rows.
  let changedRows = 0;
  let changedFields = 0;
  let skippedFields = 0;
  for (const entry of payload.enriched || []) {
    const row = byId.get(entry.id);
    if (!row) {
      console.warn(`! Unknown id in enrichment (skipped): ${entry.id} (${entry.name || ''})`);
      continue;
    }
    let touched = false;
    for (const [field, value] of Object.entries(entry.changes || {})) {
      if (!MUTABLE_FIELDS.has(field)) {
        skippedFields += 1;
        continue;
      }
      const next = String(value ?? '').trim();
      if (!next || next === String(row[field] ?? '').trim()) continue;
      row[field] = next;
      changedFields += 1;
      touched = true;
    }
    if (touched) changedRows += 1;
  }

  // 2) Append verified new devices (deduped by name+manufacturer).
  const added = [];
  for (const device of payload.newDevices || []) {
    const key = `${norm(device.name)}|${norm(device.manufacturer)}`;
    if (!device.name || !device.manufacturer || existingKeys.has(key)) continue;
    existingKeys.add(key);
    const id = makeId(existingIds);
    existingIds.add(id);
    const row = { id, short_name: slug(device.name), name: device.name, manufacturer: device.manufacturer };
    for (const field of OUTPUT_FIELDS) {
      if (row[field] !== undefined) continue;
      row[field] = field in device ? String(device[field] ?? '').trim() : '';
    }
    if (!row.active_distribution) row.active_distribution = 'Ja/Unklar';
    if (!row.eol_status) row.eol_status = 'Aktiv oder ohne EOL-Angabe';
    if (!row.lifecycle_notes) row.lifecycle_notes = 'Neu aufgenommen; aktiver Vertrieb laut Herstellerangaben.';
    row.source_dataset = 'curated_ar_xr_directory_v2';
    row.source_page = 'https://huskynarr.de/';
    rows.push(row);
    added.push(device.name);
  }

  const csv = Papa.unparse(rows, { columns: OUTPUT_FIELDS });
  await writeFile(CSV_PATH, `${csv}\n`, 'utf8');

  console.log(`Enrichment applied:`);
  console.log(`  Rows changed:    ${changedRows}`);
  console.log(`  Fields updated:  ${changedFields}`);
  console.log(`  Fields skipped (immutable): ${skippedFields}`);
  console.log(`  New devices added: ${added.length}${added.length ? ` -> ${added.join(', ')}` : ''}`);
  console.log(`  Total rows now:  ${rows.length}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
