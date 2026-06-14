import { escapeHtml, normalizeText, toInitials } from '../utils.js';
import { t } from '../i18n.js';

export const createModelImageDataUrl = (row) => {
  const isXr = normalizeText(row.xr_category) === 'xr';
  // Quiet placeholder: calm dark surface with a minimal glasses pictogram and a
  // muted manufacturer monogram. The category tints only the thin pictogram
  // stroke — no saturated full-bleed fill that would dominate the card grid.
  const accent = isXr ? '#5b9bd6' : '#9bd64a';
  const label = String(row.name ?? 'AR/XR Glasses').trim().slice(0, 30) || 'AR/XR Glasses';
  const manufacturer = String(row.manufacturer ?? t('Unbekannt', 'Unknown')).trim().slice(0, 24) || t('Unbekannt', 'Unknown');
  const initials = toInitials(manufacturer);

  const font = 'Plus Jakarta Sans,Inter,Segoe UI,sans-serif';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-label="${escapeHtml(label)}">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="#1b2433"/><stop offset="100%" stop-color="#0f1620"/>` +
    `</linearGradient></defs>` +
    `<rect width="640" height="360" fill="url(#bg)"/>` +
    // minimal AR-glasses pictogram (two lenses + bridge + temples)
    `<g transform="translate(320,150)" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.55">` +
    `<rect x="-148" y="-40" width="120" height="80" rx="22"/>` +
    `<rect x="28" y="-40" width="120" height="80" rx="22"/>` +
    `<path d="M-28 -10 q28 -18 56 0"/>` +
    `<path d="M-148 -22 l-30 -12"/>` +
    `<path d="M148 -22 l30 -12"/>` +
    `</g>` +
    `<text x="320" y="262" fill="#e7edf7" text-anchor="middle" font-size="40" font-family="${font}" font-weight="700" opacity="0.92">${escapeHtml(initials)}</text>` +
    `<text x="320" y="296" fill="#9aa7bd" text-anchor="middle" font-size="19" font-family="${font}" font-weight="500">${escapeHtml(manufacturer)}</text>` +
    `</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const getModelImageUrl = (row) => {
  if (row.__localImageUrl) {
    return row.__localImageUrl;
  }
  row.__localImageUrl = createModelImageDataUrl(row);
  return row.__localImageUrl;
};
