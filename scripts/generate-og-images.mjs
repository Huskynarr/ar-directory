// Generates branded 1200x630 OpenGraph share cards (one PNG per device) into
// public/og/models/<slug>.png. Run locally and COMMIT the PNGs — they are static
// assets, so the production host needs no build dependency.
//
// Usage: npm run og:generate

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import Papa from 'papaparse';
import sharp from 'sharp';

const CSV_PATH = 'public/data/ar_glasses.csv';
const OUT_DIR = 'public/og/models';
const W = 1200;
const H = 630;
const FONT = 'DejaVu Sans, Liberation Sans, Arial, sans-serif';

const UNKNOWN = new Set(['', 'k.a.', 'k. a.', 'n/a', 'na', 'unknown', 'unbekannt', '-', '–', 'null', 'undefined']);
const has = (v) => !UNKNOWN.has(String(v ?? '').trim().toLowerCase());
const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Word-wrap to at most `maxLines`, ~`maxChars` per line; ellipsis if it overflows.
const wrap = (text, maxChars, maxLines) => {
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines - 1) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  // account for any leftover words
  const used = lines.join(' ').split(/\s+/).length;
  if (used < words.length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1]}…`;
  }
  return lines.slice(0, maxLines);
};

const chip = (x, y, label) => {
  const w = 26 + label.length * 18;
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="54" rx="14" fill="#1c1917" stroke="#3f3f46"/>
    <text x="${x + 18}" y="${y + 36}" font-family="${FONT}" font-size="26" fill="#d6d3d1">${esc(label)}</text>
  </g>`;
};

const buildSvg = (row) => {
  const isXr = String(row.xr_category).toUpperCase() === 'XR';
  const accent = isXr ? '#22d3ee' : '#a3e635';
  const catLabel = isXr ? 'XR-HEADSET' : 'AR-BRILLE';
  const nameLines = wrap(row.name, 24, 2);
  const nameFontSize = nameLines.length > 1 || row.name.length > 16 ? 72 : 88;
  const nameStartY = nameLines.length > 1 ? 268 : 300;

  const specs = [];
  if (has(row.display_type)) specs.push(String(row.display_type).slice(0, 20));
  if (has(row.fov_diagonal_deg)) specs.push(`${row.fov_diagonal_deg}° FOV`);
  else if (has(row.fov_horizontal_deg)) specs.push(`${row.fov_horizontal_deg}° FOV`);
  if (has(row.resolution_per_eye)) specs.push(String(row.resolution_per_eye));
  if (has(row.refresh_hz)) specs.push(`${row.refresh_hz} Hz`);
  if (has(row.weight_g)) specs.push(`${row.weight_g} g`);
  const chipDefs = specs.slice(0, 4);
  let chipX = 80;
  const chipsSvg = chipDefs
    .map((label) => {
      const g = chip(chipX, 446, label);
      chipX += 26 + label.length * 18 + 16;
      return g;
    })
    .join('');

  const price = has(row.price_usd) ? `${Number(row.price_usd).toLocaleString('de-DE')} USD` : 'Preis auf Anfrage';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="acc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a3e635"/><stop offset="1" stop-color="#22d3ee"/>
    </linearGradient>
    <radialGradient id="bg" cx="18%" cy="12%" r="80%">
      <stop offset="0" stop-color="#141b14"/><stop offset="1" stop-color="#0a0f16"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="14" height="${H}" fill="url(#acc)"/>
  <!-- brand row -->
  <g fill="none" stroke="url(#acc)" stroke-width="7" stroke-linecap="round">
    <rect x="80" y="70" width="58" height="44" rx="14"/>
    <rect x="150" y="70" width="58" height="44" rx="14"/>
    <path d="M138 90c5-5 7-5 12 0"/>
  </g>
  <text x="232" y="101" font-family="${FONT}" font-size="28" font-weight="700" letter-spacing="3" fill="#a8a29e">AR/XR BRILLEN VERGLEICH</text>
  <text x="${W - 80}" y="101" text-anchor="end" font-family="${FONT}" font-size="24" fill="#57534e">ar-directory.huskynarr.de</text>

  <!-- category + manufacturer -->
  <rect x="80" y="158" width="${56 + catLabel.length * 16}" height="44" rx="22" fill="none" stroke="${accent}" stroke-width="2"/>
  <text x="108" y="188" font-family="${FONT}" font-size="24" font-weight="700" fill="${accent}">${esc(catLabel)}</text>
  <text x="${108 + catLabel.length * 16 + 36}" y="188" font-family="${FONT}" font-size="26" fill="#a8a29e">${esc(row.manufacturer)}</text>

  <!-- device name -->
  ${nameLines
    .map(
      (ln, i) =>
        `<text x="80" y="${nameStartY + i * (nameFontSize + 8)}" font-family="${FONT}" font-size="${nameFontSize}" font-weight="700" fill="#fafaf9">${esc(ln)}</text>`,
    )
    .join('')}

  <!-- spec chips -->
  ${chipsSvg}

  <!-- price + tagline -->
  <text x="80" y="566" font-family="${FONT}" font-size="64" font-weight="700" fill="${accent}">${esc(price)}</text>
  <text x="${W - 80}" y="566" text-anchor="end" font-family="${FONT}" font-size="26" fill="#78716c">Specs · Preis · Vergleich</text>
</svg>`;
};

const main = async () => {
  const parsed = Papa.parse(await readFile(CSV_PATH, 'utf8'), { header: true, skipEmptyLines: true });
  const rows = (parsed.data || []).filter((r) => r.name && r.slug);
  await mkdir(OUT_DIR, { recursive: true });

  let ok = 0;
  for (const row of rows) {
    const svg = buildSvg(row);
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(`${OUT_DIR}/${row.slug}.png`, png);
    ok += 1;
  }
  console.log(`Generated ${ok} OG share cards -> ${OUT_DIR}/<slug>.png`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
