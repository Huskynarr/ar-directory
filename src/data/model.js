import { safeExternalUrl, toNumber, normalizeText } from '../utils.js';
import { t } from '../i18n.js';

const buildShopSearchUrl = (row) => {
  const query = [row.name, row.manufacturer, 'official shop']
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
    .join(' ');
  if (!query) {
    return '';
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
};

export const getShopInfo = (row) => {
  const officialUrl = safeExternalUrl(row.official_url);
  if (officialUrl) {
    return {
      url: officialUrl,
      label: t('Zum Shop', 'Shop'),
      source: t('Offizieller Shop-Link', 'Official shop link'),
      official: true,
    };
  }
  const searchUrl = safeExternalUrl(buildShopSearchUrl(row));
  if (searchUrl) {
    return {
      url: searchUrl,
      label: t('Websuche', 'Web search'),
      source: t('Kein offizieller Shop-Link (Fallback Websuche)', 'No official shop link (web search fallback)'),
      official: false,
    };
  }
  return {
    url: '',
    label: t('Kein Link', 'No link'),
    source: t('Kein Shop-Link', 'No shop link'),
    official: false,
  };
};

export const isEol = (row) => {
  const status = normalizeText(row.eol_status);
  // "Aktiv oder ohne EOL-Angabe" contains the substring "eol" but is NOT end-of-life.
  if (!status || status.includes('aktiv') || status.includes('ohne eol')) {
    return false;
  }
  return (
    status.includes('eol') ||
    status.includes('discontinued') ||
    status.includes('eingestellt') ||
    status.includes('support beendet') ||
    status.includes('support-ende')
  );
};

export const isLikelyActive = (row) => normalizeText(row.active_distribution).includes('ja');

export const getHorizontalFov = (row) => toNumber(row.fov_horizontal_deg);
export const isXrRow = (row) => normalizeText(row.xr_category) === 'xr';
export const isArRow = (row) => !isXrRow(row);

export const getTrackingScore = (row) => {
  const tracking = normalizeText(row.tracking);
  if (!tracking) {
    return 0.5;
  }
  if (tracking.includes('inside-out') || tracking.includes('inside out')) {
    return 1.0;
  }
  if (tracking.includes('outside-in') || tracking.includes('outside in')) {
    return 0.85;
  }
  if (tracking.includes('6dof') || tracking.includes('6 dof')) {
    return 0.75;
  }
  if (
    tracking.includes('3dof') ||
    tracking.includes('3 dof') ||
    tracking.includes('non-positional') ||
    tracking.includes('non positional')
  ) {
    return 0.35;
  }
  return 0.5;
};

export const getRowId = (row, index = 0) => {
  const strongId = String(row.id ?? '').trim() || String(row.short_name ?? '').trim();
  if (strongId) {
    return strongId;
  }

  const weakId = [row.name, row.manufacturer]
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return weakId ? `${weakId}-${index}` : `row-${index}`;
};
