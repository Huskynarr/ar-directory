const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

const UNKNOWN_EXACT_VALUES = new Set([
  '',
  'k. a.',
  'k.a.',
  'n/a',
  'na',
  'unknown',
  'unbekannt',
  '-',
  'none',
  'null',
  'unklar',
]);

const UNKNOWN_PARTIAL_MARKERS = ['keine eindeutige eol-angabe', 'keine angaben', 'keine daten', 'nicht bekannt'];

export const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export const safeExternalUrl = (url) => {
  if (!url) {
    return '';
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
};

export const toNumber = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  const normalized = raw.replace(',', '.');
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

export const parsePrice = (value) => {
  const numeric = toNumber(value);
  return numeric && numeric > 0 ? numeric : null;
};

export const normalizeText = (value) => String(value ?? '').toLowerCase().trim();

export const parseResolutionWidth = (value) => {
  const text = String(value ?? '').trim();
  const match = text.match(/(\d+)\s*[xX×]\s*(\d+)/);
  if (match) {
    return Math.max(Number(match[1]), Number(match[2]));
  }
  return null;
};

export const parseBooleanParam = (value, fallback = false) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return fallback;
  }
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }
  return fallback;
};

export const isUnknownValue = (value) => {
  const text = normalizeText(value);
  if (!text) {
    return true;
  }
  if (UNKNOWN_EXACT_VALUES.has(text)) {
    return true;
  }
  return UNKNOWN_PARTIAL_MARKERS.some((marker) => text.includes(marker));
};

export const toInitials = (value) => {
  const parts = String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) {
    return 'AR';
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
};

export const debounce = (fn, delay = 200) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

export const uniqueSorted = (values, loc = 'de-DE') =>
  [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, loc, { sensitivity: 'base' }),
  );
