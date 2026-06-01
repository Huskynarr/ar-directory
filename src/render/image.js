import { escapeHtml, normalizeText, toInitials } from '../utils.js';
import { t } from '../i18n.js';

export const createModelImageDataUrl = (row) => {
  const isXr = normalizeText(row.xr_category) === 'xr';
  const gradientA = isXr ? '#0e7490' : '#84cc16';
  const gradientB = isXr ? '#1d4ed8' : '#365314';
  const label = String(row.name ?? 'AR/XR Glasses').trim().slice(0, 30) || 'AR/XR Glasses';
  const manufacturer = String(row.manufacturer ?? t('Unbekannt', 'Unknown')).trim().slice(0, 24) || t('Unbekannt', 'Unknown');
  const initials = toInitials(manufacturer);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-label="${escapeHtml(label)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${gradientA}"/>
      <stop offset="100%" stop-color="${gradientB}"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)"/>
  <rect x="28" y="28" width="584" height="304" rx="26" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.28)"/>
  <text x="320" y="166" fill="#ffffff" text-anchor="middle" font-size="76" font-family="Inter,Segoe UI,sans-serif" font-weight="800">${escapeHtml(
    initials,
  )}</text>
  <text x="320" y="220" fill="#ffffff" text-anchor="middle" font-size="26" font-family="Inter,Segoe UI,sans-serif" font-weight="700">${escapeHtml(
    label,
  )}</text>
  <text x="320" y="254" fill="rgba(255,255,255,0.9)" text-anchor="middle" font-size="18" font-family="Inter,Segoe UI,sans-serif">${escapeHtml(
    manufacturer,
  )}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const getModelImageUrl = (row) => {
  if (row.__localImageUrl) {
    return row.__localImageUrl;
  }
  row.__localImageUrl = createModelImageDataUrl(row);
  return row.__localImageUrl;
};
