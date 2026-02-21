import Papa from 'papaparse';
import './style.css';

const app = document.querySelector('#app');

const COMPARE_LIMIT = 6;
const CARDS_PER_PAGE = 12;
const USD_TO_EUR_FALLBACK = 0.92;
const RATE_SOURCE_URL = 'https://api.frankfurter.app/latest?from=USD&to=EUR';
const VIEW_MODES = new Set(['cards', 'table']);
const SORT_MODES = new Set([
  'priority_default',
  'name_asc',
  'manufacturer_asc',
  'release_desc',
  'price_desc',
  'price_asc',
  'fov_desc',
]);
const THEME_MODES = new Set(['dark', 'light']);
const THEME_STORAGE_KEY = 'ar_directory_theme';
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);
const RADAR_COLORS = ['#84cc16', '#2f6fb5', '#2d8f60', '#9b3db6', '#b1731f', '#a73452'];

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

const state = {
  rows: [],
  csvFields: [],
  theme: 'dark',
  query: '',
  viewMode: 'cards',
  compareMode: false,
  selectedIds: [],
  compareNotice: '',
  category: 'all',
  manufacturer: 'all',
  displayType: 'all',
  optics: 'all',
  tracking: 'all',
  eyeTracking: 'all',
  handTracking: 'all',
  passthrough: 'all',
  active: 'all',
  eol: 'all',
  minFov: '',
  minRefresh: '',
  maxPrice: '',
  onlyPrice: false,
  onlyShop: false,
  onlyAvailable: false,
  flagAr: false,
  flagXr: false,
  showEur: false,
  hideUnknown: false,
  showAdvancedFilters: false,
  focusMode: false,
  sort: 'priority_default',
  cardsPage: 1,
  cardsPageSize: CARDS_PER_PAGE,
  usdToEurRate: USD_TO_EUR_FALLBACK,
  usdToEurFetchedAt: '',
  usdToEurSource: `fallback:${USD_TO_EUR_FALLBACK}`,
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const safeExternalUrl = (url) => {
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

const toNumber = (value) => {
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

const parsePrice = (value) => {
  const numeric = toNumber(value);
  return numeric && numeric > 0 ? numeric : null;
};

const formatCurrency = (amount, currency) =>
  new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

const formatPrice = (value) => {
  const price = parsePrice(value);
  if (!price) {
    return 'Preis auf Anfrage';
  }
  const usd = formatCurrency(price, 'USD');
  if (!state.showEur) {
    return usd;
  }
  const eur = formatCurrency(price * state.usdToEurRate, 'EUR');
  return `${usd} (~${eur})`;
};

const formatDate = (value) => {
  if (!value) {
    return 'k. A.';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'k. A.';
  }
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
};

const formatNumber = (value, suffix = '') => {
  const numeric = toNumber(value);
  if (numeric === null) {
    return 'k. A.';
  }
  return `${new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: 1,
  }).format(numeric)}${suffix}`;
};

const normalizeText = (value) => String(value ?? '').toLowerCase().trim();

const normalizeTheme = (value, fallback = 'dark') => {
  const normalized = normalizeText(value);
  return THEME_MODES.has(normalized) ? normalized : fallback;
};

const readThemeFromStorage = () => {
  if (typeof window === 'undefined') {
    return 'dark';
  }
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY), 'dark');
  } catch {
    return 'dark';
  }
};

const writeThemeToStorage = (theme) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalizeTheme(theme, 'dark'));
  } catch {
    // ignore storage failures (private mode / blocked storage)
  }
};

const applyThemeToDocument = () => {
  if (typeof document === 'undefined' || !document.body) {
    return;
  }
  const theme = normalizeTheme(state.theme, 'dark');
  state.theme = theme;
  document.body.classList.toggle('theme-dark', theme === 'dark');
  document.body.classList.toggle('theme-light', theme === 'light');
};

const parseBooleanParam = (value, fallback = false) => {
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

const parseSelectedIdsParam = (value) =>
  [...new Set(String(value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean))].slice(0, COMPARE_LIMIT);

const parseCardsPage = (value, fallback = 1) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const updateDocumentSeoSignals = (visibleCount) => {
  if (typeof document === 'undefined') {
    return;
  }
  const countLabel = Number.isFinite(visibleCount) ? `${visibleCount} Modelle` : 'AR/XR Modelle';
  const queryLabel = String(state.query ?? '').trim();
  document.title = queryLabel
    ? `${queryLabel} | AR/XR Brillen Vergleich (${countLabel})`
    : `AR/XR Brillen Vergleich 2026: ${countLabel}, Preise, Shop-Links, EOL`;

  const description = queryLabel
    ? `Filter- und Suchergebnis fuer "${queryLabel}" im AR/XR Brillen Vergleich mit Spezifikationen, Preisen, Lifecycle und Shop-Links.`
    : 'Vergleich fuer AR- und XR-Brillen mit Spezifikationen, Preisen, Shop-Links, aktivem Vertrieb, Software, Updates und EOL-Status.';

  const descriptionTag = document.querySelector('meta[name="description"]');
  if (descriptionTag) {
    descriptionTag.setAttribute('content', description);
  }

  const canonicalTag = document.querySelector('link[rel="canonical"]');
  if (canonicalTag && typeof window !== 'undefined') {
    canonicalTag.setAttribute('href', `${window.location.origin}${window.location.pathname}`);
  }

  const ogUrlTag = document.querySelector('meta[property="og:url"]');
  if (ogUrlTag && typeof window !== 'undefined') {
    ogUrlTag.setAttribute('content', `${window.location.origin}${window.location.pathname}`);
  }
};

const setFallbackUsdRate = () => {
  state.usdToEurRate = USD_TO_EUR_FALLBACK;
  state.usdToEurFetchedAt = new Date().toISOString();
  state.usdToEurSource = `fallback:${USD_TO_EUR_FALLBACK}`;
};

const fetchUsdToEurRate = async () => {
  try {
    const response = await fetch(RATE_SOURCE_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`FX request failed with status ${response.status}`);
    }
    const payload = await response.json();
    const rate = toNumber(payload?.rates?.EUR);
    if (!rate || rate <= 0) {
      throw new Error('FX payload missing EUR rate');
    }
    state.usdToEurRate = rate;
    state.usdToEurFetchedAt = String(payload?.date ?? new Date().toISOString());
    state.usdToEurSource = RATE_SOURCE_URL;
  } catch {
    setFallbackUsdRate();
  }
};

const formatRateSourceLabel = () =>
  state.usdToEurSource.startsWith('fallback:') ? `Fallback ${USD_TO_EUR_FALLBACK}` : 'Frankfurter API';

const formatSafeDateLabel = (value) => {
  const isoMatch = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
  }
  return formatDate(value);
};

const formatRateHint = () => {
  const rate = new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 4,
  }).format(state.usdToEurRate);
  const fetchedAt = state.usdToEurFetchedAt ? formatSafeDateLabel(state.usdToEurFetchedAt) : 'k. A.';
  return `Kurs: 1 USD = ${rate} EUR (${formatRateSourceLabel()}, Stand: ${fetchedAt})`;
};

const compactValue = (value, fallback = 'k. A.') => {
  const text = String(value ?? '').trim();
  return text ? text : fallback;
};

const isUnknownValue = (value) => {
  const text = normalizeText(value);
  if (!text) {
    return true;
  }
  if (UNKNOWN_EXACT_VALUES.has(text)) {
    return true;
  }
  return UNKNOWN_PARTIAL_MARKERS.some((marker) => text.includes(marker));
};

const maybeHiddenText = (value, fallback = 'k. A.') => {
  if (state.hideUnknown && isUnknownValue(value)) {
    return '';
  }
  return compactValue(value, fallback);
};

const uniqueSorted = (values) =>
  [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, 'de', { sensitivity: 'base' }),
  );

const toInitials = (value) => {
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

const createModelImageDataUrl = (row) => {
  const isXr = normalizeText(row.xr_category) === 'xr';
  const gradientA = isXr ? '#0e7490' : '#84cc16';
  const gradientB = isXr ? '#1d4ed8' : '#365314';
  const label = String(row.name ?? 'AR/XR Glasses').trim().slice(0, 30) || 'AR/XR Glasses';
  const manufacturer = String(row.manufacturer ?? 'Unbekannt').trim().slice(0, 24) || 'Unbekannt';
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

const getModelImageUrl = (row) => {
  if (row.__localImageUrl) {
    return row.__localImageUrl;
  }
  row.__localImageUrl = createModelImageDataUrl(row);
  return row.__localImageUrl;
};

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

const getShopInfo = (row) => {
  const officialUrl = safeExternalUrl(row.official_url);
  if (officialUrl) {
    return {
      url: officialUrl,
      label: 'Zum Shop',
      source: 'Offizieller Shop-Link',
      official: true,
    };
  }
  const searchUrl = safeExternalUrl(buildShopSearchUrl(row));
  if (searchUrl) {
    return {
      url: searchUrl,
      label: 'Websuche',
      source: 'Kein offizieller Shop-Link (Fallback Websuche)',
      official: false,
    };
  }
  return {
    url: '',
    label: 'Kein Link',
    source: 'Kein Shop-Link',
    official: false,
  };
};

const isEol = (row) => {
  const status = normalizeText(row.eol_status);
  return status.includes('eol') || status.includes('discontinued') || status.includes('support beendet');
};

const isLikelyActive = (row) => normalizeText(row.active_distribution).includes('ja');

const getHorizontalFov = (row) => toNumber(row.fov_horizontal_deg);
const isXrRow = (row) => normalizeText(row.xr_category) === 'xr';
const isArRow = (row) => !isXrRow(row);

const getTrackingScore = (row) => {
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

const getRowId = (row, index = 0) => {
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

const applyStateFromUrl = () => {
  const params = new URLSearchParams(window.location.search);

  const query = params.get('query');
  if (query !== null) {
    state.query = query;
  }

  const viewMode = params.get('viewMode');
  if (viewMode && VIEW_MODES.has(viewMode)) {
    state.viewMode = viewMode;
  }

  const theme = params.get('theme');
  if (theme !== null) {
    state.theme = normalizeTheme(theme, state.theme);
  }

  state.compareMode = parseBooleanParam(params.get('compareMode'), false);
  state.selectedIds = parseSelectedIdsParam(params.get('selectedIds'));

  const category = params.get('category');
  if (category !== null) {
    state.category = category.trim() || 'all';
  }

  const manufacturer = params.get('manufacturer');
  if (manufacturer !== null) {
    state.manufacturer = manufacturer.trim() || 'all';
  }

  const displayType = params.get('displayType');
  if (displayType !== null) {
    state.displayType = displayType.trim() || 'all';
  }

  const optics = params.get('optics');
  if (optics !== null) {
    state.optics = optics.trim() || 'all';
  }

  const tracking = params.get('tracking');
  if (tracking !== null) {
    state.tracking = tracking.trim() || 'all';
  }

  const eye = params.get('eye');
  if (eye !== null) {
    state.eyeTracking = eye.trim() || 'all';
  }

  const hand = params.get('hand');
  if (hand !== null) {
    state.handTracking = hand.trim() || 'all';
  }

  const passthrough = params.get('passthrough');
  if (passthrough !== null) {
    state.passthrough = passthrough.trim() || 'all';
  }

  const active = params.get('active');
  if (active !== null) {
    state.active = active.trim() || 'all';
  }

  const eol = params.get('eol');
  if (eol !== null) {
    state.eol = eol.trim() || 'all';
  }

  const minFov = params.get('minFov');
  if (minFov !== null) {
    state.minFov = minFov.trim();
  }

  const minRefresh = params.get('minRefresh');
  if (minRefresh !== null) {
    state.minRefresh = minRefresh.trim();
  }

  const maxPrice = params.get('maxPrice');
  if (maxPrice !== null) {
    state.maxPrice = maxPrice.trim();
  }

  state.onlyPrice = parseBooleanParam(params.get('onlyPrice'), false);
  state.onlyShop = parseBooleanParam(params.get('onlyShop'), false);
  state.onlyAvailable = parseBooleanParam(params.get('onlyAvailable'), false);
  state.flagAr = parseBooleanParam(params.get('flagAr'), false);
  state.flagXr = parseBooleanParam(params.get('flagXr'), false);
  state.showEur = parseBooleanParam(params.get('showEur'), false);
  state.hideUnknown = parseBooleanParam(params.get('hideUnknown'), false);
  state.showAdvancedFilters = parseBooleanParam(params.get('advanced'), false);
  state.focusMode = parseBooleanParam(params.get('focus'), false);

  const sort = params.get('sort');
  if (sort && SORT_MODES.has(sort)) {
    state.sort = sort;
  }

  state.cardsPage = parseCardsPage(params.get('cardsPage'), 1);
};

const syncUrlWithState = () => {
  const params = new URLSearchParams();
  const setText = (key, value, defaultValue = '') => {
    const text = String(value ?? '').trim();
    const fallback = String(defaultValue ?? '').trim();
    if (text && text !== fallback) {
      params.set(key, text);
    }
  };
  const setBoolean = (key, value, defaultValue = false) => {
    if (Boolean(value) !== Boolean(defaultValue)) {
      params.set(key, value ? '1' : '0');
    }
  };
  const setSelect = (key, value) => {
    const text = String(value ?? '').trim();
    if (text && text !== 'all') {
      params.set(key, text);
    }
  };

  setText('query', state.query, '');
  setText('viewMode', state.viewMode, 'cards');
  setText('theme', state.theme, 'dark');
  setBoolean('compareMode', state.compareMode, false);
  if (state.selectedIds.length) {
    params.set('selectedIds', state.selectedIds.join(','));
  }

  setSelect('category', state.category);
  setSelect('manufacturer', state.manufacturer);
  setSelect('displayType', state.displayType);
  setSelect('optics', state.optics);
  setSelect('tracking', state.tracking);
  setSelect('eye', state.eyeTracking);
  setSelect('hand', state.handTracking);
  setSelect('passthrough', state.passthrough);
  setSelect('active', state.active);
  setSelect('eol', state.eol);

  setText('minFov', state.minFov, '');
  setText('minRefresh', state.minRefresh, '');
  setText('maxPrice', state.maxPrice, '');

  setBoolean('onlyPrice', state.onlyPrice, false);
  setBoolean('onlyShop', state.onlyShop, false);
  setBoolean('onlyAvailable', state.onlyAvailable, false);
  setBoolean('flagAr', state.flagAr, false);
  setBoolean('flagXr', state.flagXr, false);
  setBoolean('showEur', state.showEur, false);
  setBoolean('hideUnknown', state.hideUnknown, false);
  setBoolean('advanced', state.showAdvancedFilters, false);
  setBoolean('focus', state.focusMode, false);
  setText('sort', state.sort, 'priority_default');
  if (state.cardsPage > 1) {
    params.set('cardsPage', String(state.cardsPage));
  }

  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    history.replaceState(null, '', nextUrl);
  }
};

const pruneSelectedIdsToKnownRows = () => {
  const known = new Set(state.rows.map((row) => row.__rowId));
  state.selectedIds = [...new Set(state.selectedIds)].filter((id) => known.has(id)).slice(0, COMPARE_LIMIT);
  if (!state.selectedIds.length) {
    state.compareMode = false;
  }
};

const getFilterOptions = () => ({
  manufacturers: uniqueSorted(state.rows.map((row) => row.manufacturer)),
  displayTypes: uniqueSorted(state.rows.map((row) => row.display_type)),
  optics: uniqueSorted(state.rows.map((row) => row.optics)),
  tracking: uniqueSorted(state.rows.map((row) => row.tracking)),
  eyeTracking: uniqueSorted(state.rows.map((row) => row.eye_tracking)),
  handTracking: uniqueSorted(state.rows.map((row) => row.hand_tracking)),
  passthrough: uniqueSorted(state.rows.map((row) => row.passthrough)),
  activeStatuses: uniqueSorted(state.rows.map((row) => row.active_distribution)),
  eolStatuses: uniqueSorted(state.rows.map((row) => row.eol_status)),
});

const compareText = (left, right) =>
  String(left ?? '').localeCompare(String(right ?? ''), 'de', { sensitivity: 'base' });

const compareNumbers = (left, right) => {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left - right;
};

const compareDates = (left, right) => {
  const leftTime = left ? new Date(left).getTime() : Number.NaN;
  const rightTime = right ? new Date(right).getTime() : Number.NaN;
  const safeLeft = Number.isFinite(leftTime) ? leftTime : -1;
  const safeRight = Number.isFinite(rightTime) ? rightTime : -1;
  return safeLeft - safeRight;
};

const compareDefaultPriority = (left, right) => {
  const leftEol = isEol(left);
  const rightEol = isEol(right);
  if (leftEol !== rightEol) {
    return leftEol ? 1 : -1;
  }

  const releaseOrder = compareDates(right.release_date || right.announced_date, left.release_date || left.announced_date);
  if (releaseOrder !== 0) {
    return releaseOrder;
  }

  const activeOrder = compareNumbers(isLikelyActive(right) ? 1 : 0, isLikelyActive(left) ? 1 : 0);
  if (activeOrder !== 0) {
    return activeOrder;
  }

  return compareText(left.name, right.name);
};

const sortRows = (rows) => {
  const sorted = [...rows];
  switch (state.sort) {
    case 'priority_default':
      sorted.sort((left, right) => compareDefaultPriority(left, right));
      return sorted;
    case 'price_desc':
      sorted.sort((left, right) => compareNumbers(parsePrice(right.price_usd), parsePrice(left.price_usd)));
      return sorted;
    case 'price_asc':
      sorted.sort((left, right) => compareNumbers(parsePrice(left.price_usd), parsePrice(right.price_usd)));
      return sorted;
    case 'release_desc':
      sorted.sort((left, right) =>
        compareDates(right.release_date || right.announced_date, left.release_date || left.announced_date),
      );
      return sorted;
    case 'fov_desc':
      sorted.sort((left, right) => compareNumbers(getHorizontalFov(right), getHorizontalFov(left)));
      return sorted;
    case 'manufacturer_asc':
      sorted.sort((left, right) => compareText(left.manufacturer, right.manufacturer));
      return sorted;
    case 'name_asc':
    default:
      sorted.sort((left, right) => compareText(left.name, right.name));
      return sorted;
  }
};

const matchesSelectFilter = (value, selected) => {
  if (selected === 'all') {
    return true;
  }
  return normalizeText(value) === normalizeText(selected);
};

const matchesFilters = (row) => {
  const query = normalizeText(state.query);
  if (query) {
    const haystack = normalizeText(
      [
        row.name,
        row.manufacturer,
        row.display_type,
        row.software,
        row.optics,
        row.compute_unit,
        row.tracking,
        row.eye_tracking,
        row.hand_tracking,
        row.passthrough,
        row.xr_category,
        row.lifecycle_notes,
        row.lifecycle_source,
      ].join(' '),
    );
    const tokens = query.split(/\s+/).filter(Boolean);
    if (!tokens.every((token) => haystack.includes(token))) {
      return false;
    }
  }

  if (!matchesSelectFilter(row.xr_category, state.category)) {
    return false;
  }
  if (!matchesSelectFilter(row.manufacturer, state.manufacturer)) {
    return false;
  }
  if (!matchesSelectFilter(row.display_type, state.displayType)) {
    return false;
  }
  if (!matchesSelectFilter(row.optics, state.optics)) {
    return false;
  }
  if (!matchesSelectFilter(row.tracking, state.tracking)) {
    return false;
  }
  if (!matchesSelectFilter(row.eye_tracking, state.eyeTracking)) {
    return false;
  }
  if (!matchesSelectFilter(row.hand_tracking, state.handTracking)) {
    return false;
  }
  if (!matchesSelectFilter(row.passthrough, state.passthrough)) {
    return false;
  }
  if (!matchesSelectFilter(row.active_distribution, state.active)) {
    return false;
  }
  if (!matchesSelectFilter(row.eol_status, state.eol)) {
    return false;
  }
  if (state.onlyPrice && !parsePrice(row.price_usd)) {
    return false;
  }
  if (state.onlyShop && !getShopInfo(row).url) {
    return false;
  }
  if (state.onlyAvailable && !isLikelyActive(row)) {
    return false;
  }
  if (state.flagAr && state.flagXr) {
    // both selected means no additional category restriction
  } else if (state.flagAr && !isArRow(row)) {
    return false;
  } else if (state.flagXr && !isXrRow(row)) {
    return false;
  }

  const minFov = toNumber(state.minFov);
  if (minFov !== null) {
    const fov = getHorizontalFov(row);
    if (fov === null || fov < minFov) {
      return false;
    }
  }

  const minRefresh = toNumber(state.minRefresh);
  if (minRefresh !== null) {
    const refresh = toNumber(row.refresh_hz);
    if (refresh === null || refresh < minRefresh) {
      return false;
    }
  }

  const maxPrice = toNumber(state.maxPrice);
  if (maxPrice !== null) {
    const price = parsePrice(row.price_usd);
    if (!price || price > maxPrice) {
      return false;
    }
  }

  return true;
};

const optionList = (values, selectedValue, allLabel = 'Alle') => {
  const head = `<option value="all"${selectedValue === 'all' ? ' selected' : ''}>${escapeHtml(allLabel)}</option>`;
  const options = values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}"${value === selectedValue ? ' selected' : ''}>${escapeHtml(value)}</option>`,
    )
    .join('');
  return `${head}${options}`;
};

const categoryTone = (value) =>
  normalizeText(value) === 'xr'
    ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
    : 'border-lime-500/40 bg-lime-500/15 text-lime-200';

const lifecycleTone = (row) => {
  if (isEol(row)) {
    return 'border-red-500/40 bg-red-500/10 text-red-200';
  }
  if (normalizeText(row.eol_status).includes('angekuendigt')) {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  }
  return 'border-lime-500/40 bg-lime-500/10 text-lime-200';
};

const selectionLabelTemplate = (rowId, selected) => `
  <label class="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#44403c] bg-[#1c1917] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#a8a29e]">
    <input data-compare-toggle data-model-id="${escapeHtml(rowId)}" type="checkbox" class="size-4 accent-[#84cc16]" ${selected ? 'checked' : ''} />
    Compare
  </label>
`;

const buildCardFacts = (row) => {
  const entries = [
    { label: 'Display', raw: row.display_type, value: compactValue(row.display_type) },
    { label: 'Optik', raw: row.optics, value: compactValue(row.optics) },
    { label: 'Tracking', raw: row.tracking, value: compactValue(row.tracking) },
    { label: 'Eye Tracking', raw: row.eye_tracking, value: compactValue(row.eye_tracking) },
    { label: 'Hand Tracking', raw: row.hand_tracking, value: compactValue(row.hand_tracking) },
    { label: 'Passthrough', raw: row.passthrough, value: compactValue(row.passthrough) },
    { label: 'FOV H', raw: row.fov_horizontal_deg, value: formatNumber(row.fov_horizontal_deg, ' deg') },
    { label: 'Refresh', raw: row.refresh_hz, value: formatNumber(row.refresh_hz, ' Hz') },
    { label: 'Software', raw: row.software, value: compactValue(row.software) },
    { label: 'Aufloesung', raw: row.resolution_per_eye, value: compactValue(row.resolution_per_eye) },
    { label: 'Compute', raw: row.compute_unit, value: compactValue(row.compute_unit) },
  ];

  if (!state.hideUnknown) {
    return entries;
  }
  return entries.filter((entry) => !isUnknownValue(entry.raw));
};

const cardTemplate = (row) => {
  const name = escapeHtml(compactValue(row.name, 'Unbekanntes Modell'));
  const manufacturer = escapeHtml(compactValue(row.manufacturer, 'Unbekannt'));
  const category = escapeHtml(compactValue(row.xr_category, 'AR'));
  const image = safeExternalUrl(row.image_url) || getModelImageUrl(row);
  const shop = getShopInfo(row);
  const shopButtonClasses = shop.official
    ? 'chip-btn border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
    : 'chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]';
  const lifecycleClasses = lifecycleTone(row);
  const eolDate = row.eol_date ? formatDate(row.eol_date) : 'k. A.';
  const releaseDate = formatDate(row.release_date || row.announced_date);
  const infoUrl = safeExternalUrl(row.lifecycle_source || row.source_page);
  const isSelected = state.selectedIds.includes(row.__rowId);
  const facts = buildCardFacts(row);
  const primaryFacts = facts.slice(0, 6);
  const secondaryFacts = facts.slice(6);
  const lifecycleNotes = maybeHiddenText(row.lifecycle_notes, 'Keine Angaben.');
  const lifecycleSource = maybeHiddenText(row.lifecycle_source, '');

  return `
    <article class="panel overflow-hidden">
      <div class="relative h-48 border-b border-[#44403c] bg-gradient-to-br from-[#1c1917] to-[#1c1917]">
        ${
          image
            ? `<img src="${escapeHtml(image)}" alt="${name}" loading="lazy" class="h-full w-full object-contain p-4" />`
            : '<div class="grid h-full place-items-center text-sm text-[#a8a29e]">Kein Bild verfuegbar</div>'
        }
        <div class="absolute left-3 top-3">${selectionLabelTemplate(row.__rowId, isSelected)}</div>
        <span class="absolute right-3 top-3 rounded-full border px-2.5 py-1 text-xs font-bold ${categoryTone(row.xr_category)}">${category}</span>
      </div>
      <div class="space-y-4 p-4">
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#a8a29e]">${manufacturer}</p>
          <h2 class="font-semibold text-2xl leading-tight text-[#f5f5f4]">${name}</h2>
          <p class="text-sm text-[#a8a29e]">Release: ${escapeHtml(releaseDate)}</p>
        </div>

        <div class="grid grid-cols-2 gap-2 text-sm">
          <div class="soft-panel p-2.5">
            <p class="text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">Preis</p>
            <p class="mt-1 font-semibold text-[#f5f5f4]">${escapeHtml(formatPrice(row.price_usd))}</p>
          </div>
          <div class="soft-panel p-2.5">
            <p class="text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">Vertrieb</p>
            <p class="mt-1 font-semibold text-[#f5f5f4]">${escapeHtml(compactValue(row.active_distribution, 'k. A.'))}</p>
          </div>
        </div>

        ${
          primaryFacts.length
            ? `<dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-[#f5f5f4]">
                ${primaryFacts
                  .map(
                    (fact) => `
                      <div>
                        <dt class="text-xs text-[#a8a29e]">${escapeHtml(fact.label)}</dt>
                        <dd class="font-medium">${escapeHtml(fact.value)}</dd>
                      </div>
                    `,
                  )
                  .join('')}
              </dl>`
            : '<p class="soft-panel p-3 text-xs text-[#a8a29e]">Keine bekannten Spezifikationen sichtbar (Toggle "Unbekannte Werte ausblenden" aktiv).</p>'
        }
        ${
          secondaryFacts.length
            ? `<details class="compact-details rounded-xl border border-[#44403c] bg-[#1c1917] p-2.5 text-sm text-[#a8a29e]">
                <summary class="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em]">Mehr Spezifikationen</summary>
                <dl class="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-[#f5f5f4]">
                  ${secondaryFacts
                    .map(
                      (fact) => `
                        <div>
                          <dt class="text-xs text-[#a8a29e]">${escapeHtml(fact.label)}</dt>
                          <dd class="font-medium">${escapeHtml(fact.value)}</dd>
                        </div>
                      `,
                    )
                    .join('')}
                </dl>
              </details>`
            : ''
        }

        <div class="rounded-2xl border p-3 text-sm ${lifecycleClasses}">
          <p class="text-[11px] font-semibold uppercase tracking-[0.12em]">Updates / EOL</p>
          <p class="mt-1 font-semibold">${escapeHtml(compactValue(row.eol_status))}</p>
          <p class="mt-1 text-xs">EOL-Datum: ${escapeHtml(eolDate)}</p>
          ${lifecycleNotes ? `<p class="mt-2 text-xs leading-relaxed">${escapeHtml(lifecycleNotes)}</p>` : ''}
          ${lifecycleSource ? `<p class="mt-2 text-[11px] leading-relaxed">Quelle: ${escapeHtml(lifecycleSource)}</p>` : ''}
        </div>

        <div class="flex flex-wrap gap-2">
          ${
            shop.url
              ? `<a href="${escapeHtml(shop.url)}" target="_blank" rel="noreferrer" class="${shopButtonClasses}">${escapeHtml(shop.label)}</a>`
              : '<span class="chip-btn cursor-not-allowed border-[#44403c] bg-[#292524] text-[#a8a29e]">Shop-Link fehlt</span>'
          }
          ${
            infoUrl
              ? `<a href="${escapeHtml(infoUrl)}" target="_blank" rel="noreferrer" class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">Datenquelle</a>`
              : ''
          }
        </div>
        <p class="text-xs text-[#a8a29e]">${escapeHtml(shop.source)}</p>
      </div>
    </article>
  `;
};

const tableTemplate = (rows) => {
  if (!rows.length) {
    return '<p class="panel p-8 text-center text-sm text-[#a8a29e]">Keine Ergebnisse fuer diese Filter.</p>';
  }

  return `
    <div class="panel overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-[1650px] border-collapse text-sm">
          <thead class="bg-[#1c1917] text-left text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">
            <tr>
              <th class="px-3 py-3">Compare</th>
              <th class="px-3 py-3">Brille</th>
              <th class="px-3 py-3">Hersteller</th>
              <th class="px-3 py-3">Kat.</th>
              <th class="px-3 py-3">Display</th>
              <th class="px-3 py-3">Optik</th>
              <th class="px-3 py-3">Tracking</th>
              <th class="px-3 py-3">Eye</th>
              <th class="px-3 py-3">Hand</th>
              <th class="px-3 py-3">Passthrough</th>
              <th class="px-3 py-3">FOV H</th>
              <th class="px-3 py-3">Refresh</th>
              <th class="px-3 py-3">Preis</th>
              <th class="px-3 py-3">Vertrieb</th>
              <th class="px-3 py-3">EOL / Updates</th>
              <th class="px-3 py-3">Software</th>
              <th class="px-3 py-3">Links</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((row, index) => {
                const shop = getShopInfo(row);
                const infoUrl = safeExternalUrl(row.lifecycle_source || row.source_page);
                const selected = state.selectedIds.includes(row.__rowId);
                const lifecycleNotes = maybeHiddenText(row.lifecycle_notes, 'Keine Angaben.');

                return `
                  <tr class="${index % 2 === 0 ? 'bg-[#171412]' : 'bg-[#1c1917]'} align-top text-[#f5f5f4]">
                    <td class="px-3 py-3">${selectionLabelTemplate(row.__rowId, selected)}</td>
                    <td class="px-3 py-3">
                      <p class="font-semibold">${escapeHtml(compactValue(row.name, 'Unbekannt'))}</p>
                      <p class="mt-1 text-xs text-[#a8a29e]">${escapeHtml(maybeHiddenText(row.resolution_per_eye, 'k. A.') || 'k. A.')}</p>
                    </td>
                    <td class="px-3 py-3">${escapeHtml(compactValue(row.manufacturer))}</td>
                    <td class="px-3 py-3">
                      <span class="rounded-full border px-2 py-1 text-xs font-semibold ${categoryTone(row.xr_category)}">${escapeHtml(
                        compactValue(row.xr_category, 'AR'),
                      )}</span>
                    </td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.display_type) || 'k. A.')}</td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.optics) || 'k. A.')}</td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.tracking) || 'k. A.')}</td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.eye_tracking) || 'k. A.')}</td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.hand_tracking) || 'k. A.')}</td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.passthrough) || 'k. A.')}</td>
                    <td class="px-3 py-3">${escapeHtml(formatNumber(row.fov_horizontal_deg, ' deg'))}</td>
                    <td class="px-3 py-3">${escapeHtml(formatNumber(row.refresh_hz, ' Hz'))}</td>
                    <td class="px-3 py-3">${escapeHtml(formatPrice(row.price_usd))}</td>
                    <td class="px-3 py-3">${escapeHtml(compactValue(row.active_distribution, 'k. A.'))}</td>
                    <td class="px-3 py-3">
                      <p class="font-semibold">${escapeHtml(compactValue(row.eol_status))}</p>
                      ${lifecycleNotes ? `<p class="mt-1 text-xs text-[#a8a29e]">${escapeHtml(lifecycleNotes)}</p>` : ''}
                    </td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.software) || 'k. A.')}</td>
                    <td class="px-3 py-3">
                      <div class="flex flex-col gap-2">
                        ${
                          shop.url
                            ? `<a href="${escapeHtml(shop.url)}" target="_blank" rel="noreferrer" class="text-xs font-semibold text-[#84cc16] hover:underline">${escapeHtml(shop.label)}</a>`
                            : '<span class="text-xs text-[#a8a29e]">Kein Shop-Link</span>'
                        }
                        ${
                          infoUrl
                            ? `<a href="${escapeHtml(infoUrl)}" target="_blank" rel="noreferrer" class="text-xs font-semibold text-[#84cc16] hover:underline">Quelle</a>`
                            : ''
                        }
                      </div>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
};

const getSelectedRows = () => {
  const byId = new Map(state.rows.map((row) => [row.__rowId, row]));
  return state.selectedIds.map((id) => byId.get(id)).filter(Boolean);
};

const compareField = (label, getRaw, formatValue = (row) => compactValue(getRaw(row)), isUnknown = (row) => isUnknownValue(getRaw(row))) => ({
  label,
  formatValue,
  isUnknown,
});

const getCompareFields = () => [
  compareField('Hersteller', (row) => row.manufacturer),
  compareField('Kategorie', (row) => row.xr_category, (row) => compactValue(row.xr_category, 'AR')),
  compareField('Release', (row) => row.release_date || row.announced_date, (row) => formatDate(row.release_date || row.announced_date)),
  compareField('Preis', (row) => row.price_usd, (row) => formatPrice(row.price_usd), (row) => !parsePrice(row.price_usd)),
  compareField('Display', (row) => row.display_type),
  compareField('Optik', (row) => row.optics),
  compareField('Tracking', (row) => row.tracking),
  compareField('Eye Tracking', (row) => row.eye_tracking),
  compareField('Hand Tracking', (row) => row.hand_tracking),
  compareField('Passthrough', (row) => row.passthrough),
  compareField('FOV horizontal', (row) => row.fov_horizontal_deg, (row) => formatNumber(row.fov_horizontal_deg, ' deg'), (row) => toNumber(row.fov_horizontal_deg) === null),
  compareField('FOV vertikal', (row) => row.fov_vertical_deg, (row) => formatNumber(row.fov_vertical_deg, ' deg'), (row) => toNumber(row.fov_vertical_deg) === null),
  compareField('Refresh', (row) => row.refresh_hz, (row) => formatNumber(row.refresh_hz, ' Hz'), (row) => toNumber(row.refresh_hz) === null),
  compareField('Aufloesung', (row) => row.resolution_per_eye),
  compareField('Gewicht', (row) => row.weight_g, (row) => formatNumber(row.weight_g, ' g'), (row) => toNumber(row.weight_g) === null),
  compareField('Compute Unit', (row) => row.compute_unit),
  compareField('Software', (row) => row.software),
  compareField('Vertrieb', (row) => row.active_distribution),
  compareField('EOL / Lifecycle', (row) => row.eol_status),
  compareField('Lifecycle Notes', (row) => row.lifecycle_notes, (row) => compactValue(row.lifecycle_notes, 'Keine Angaben.')),
];

const getRadarAxes = () => [
  { label: 'FOV H', inverted: false, getValue: (row) => getHorizontalFov(row) },
  { label: 'Refresh', inverted: false, getValue: (row) => toNumber(row.refresh_hz) },
  { label: 'Gewicht (inv.)', inverted: true, getValue: (row) => toNumber(row.weight_g) },
  { label: 'Preis (inv.)', inverted: true, getValue: (row) => parsePrice(row.price_usd) },
  { label: 'Tracking-Score', inverted: false, getValue: (row) => getTrackingScore(row) },
];

const normalizeRadarValue = (value, min, max, inverted = false) => {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  const range = max - min;
  if (!Number.isFinite(range) || Math.abs(range) < 1e-9) {
    return 0.5;
  }
  const normalized = Math.max(0, Math.min(1, (value - min) / range));
  return inverted ? 1 - normalized : normalized;
};

const compareRadarTemplate = (selectedRows) => {
  if (!selectedRows.length) {
    return '';
  }

  const axes = getRadarAxes();
  const ranges = axes.map((axis) => {
    const values = selectedRows.map((row) => axis.getValue(row)).filter((value) => Number.isFinite(value));
    if (!values.length) {
      return { min: 0, max: 0 };
    }
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  });

  const size = 360;
  const center = size / 2;
  const maxRadius = 130;
  const ringCount = 5;
  const axisCount = axes.length;
  const startAngle = -Math.PI / 2;
  const angleStep = (Math.PI * 2) / axisCount;
  const pointFor = (axisIndex, value) => {
    const angle = startAngle + axisIndex * angleStep;
    const radius = maxRadius * value;
    return {
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    };
  };

  const gridPolygons = Array.from({ length: ringCount }, (_, index) => {
    const level = (index + 1) / ringCount;
    const points = axes
      .map((_, axisIndex) => {
        const point = pointFor(axisIndex, level);
        return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      })
      .join(' ');
    return `<polygon points="${points}" fill="none" stroke="#44403c" stroke-width="1" />`;
  }).join('');

  const axisLines = axes
    .map((axis, axisIndex) => {
      const outer = pointFor(axisIndex, 1);
      const labelPoint = pointFor(axisIndex, 1.12);
      const anchor = labelPoint.x > center + 6 ? 'start' : labelPoint.x < center - 6 ? 'end' : 'middle';
      const labelY = labelPoint.y > center ? labelPoint.y + 11 : labelPoint.y - 7;
      return `
        <line x1="${center}" y1="${center}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}" stroke="#44403c" stroke-width="1" />
        <text x="${labelPoint.x.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="${anchor}" font-size="11" fill="#a8a29e">${escapeHtml(axis.label)}</text>
      `;
    })
    .join('');

  const series = selectedRows.map((row, rowIndex) => {
    const color = RADAR_COLORS[rowIndex % RADAR_COLORS.length];
    const normalizedValues = axes.map((axis, axisIndex) =>
      normalizeRadarValue(axis.getValue(row), ranges[axisIndex].min, ranges[axisIndex].max, axis.inverted),
    );
    const polygonPoints = normalizedValues
      .map((value, axisIndex) => {
        const point = pointFor(axisIndex, value);
        return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      })
      .join(' ');
    const points = normalizedValues
      .map((value, axisIndex) => {
        const point = pointFor(axisIndex, value);
        return `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3" fill="${color}" />`;
      })
      .join('');
    return {
      row,
      color,
      polygon: `<polygon points="${polygonPoints}" fill="${color}29" stroke="${color}" stroke-width="2" />`,
      points,
    };
  });

  return `
    <div class="border-b border-[#44403c] bg-[#1c1917] px-4 py-4">
      <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[#a8a29e]">Spider Chart (normalisiert auf Auswahl)</p>
      <div class="mt-3 overflow-x-auto">
        <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Radarvergleich der ausgewaehlten Modelle" class="mx-auto block h-[360px] min-w-[320px]">
          ${gridPolygons}
          ${axisLines}
          ${series.map((entry) => entry.polygon).join('')}
          ${series.map((entry) => entry.points).join('')}
        </svg>
      </div>
      <p class="mt-2 text-xs text-[#a8a29e]">Achsen: FOV H, Refresh, Gewicht (invertiert), Preis (invertiert), Tracking-Score.</p>
      <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        ${series
          .map(
            (entry) => `
              <div class="inline-flex items-center gap-2 rounded-lg border border-[#44403c] bg-[#1c1917] px-2.5 py-1.5 text-xs text-[#a8a29e]">
                <span class="inline-block h-2.5 w-2.5 rounded-full" style="background:${entry.color};"></span>
                <span class="font-semibold">${escapeHtml(compactValue(entry.row.name, 'Unbekannt'))}</span>
                <span class="text-[#a8a29e]">${escapeHtml(compactValue(entry.row.manufacturer, ''))}</span>
              </div>
            `,
          )
          .join('')}
      </div>
    </div>
  `;
};

const compareModeTemplate = (selectedRows) => {
  if (!selectedRows.length) {
    return `<p class="panel p-8 text-sm text-[#a8a29e]">Keine Modelle ausgewaehlt. Waehle bis zu ${COMPARE_LIMIT} Modelle fuer den Direktvergleich.</p>`;
  }

  const fields = getCompareFields();
  const visibleFields = state.hideUnknown
    ? fields.filter((field) => selectedRows.some((row) => !field.isUnknown(row)))
    : fields;

  return `
    <div class="panel overflow-hidden">
      <div class="border-b border-[#44403c] bg-[#1c1917] px-4 py-3">
        <h2 class="font-semibold text-2xl text-[#f5f5f4]">Direktvergleich</h2>
        <p class="mt-1 text-sm text-[#a8a29e]">${selectedRows.length} ausgewaehlte Modelle, max. ${COMPARE_LIMIT} gleichzeitig.</p>
      </div>
      ${compareRadarTemplate(selectedRows)}
      <div class="overflow-x-auto">
        <table class="min-w-[980px] border-collapse text-sm">
          <thead class="bg-[#1c1917] text-left text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">
            <tr>
              <th class="px-3 py-3">Merkmal</th>
              ${selectedRows
                .map(
                  (row) => `
                    <th class="px-3 py-3 align-top">
                      <p class="font-semibold text-[#f5f5f4]">${escapeHtml(compactValue(row.name, 'Unbekannt'))}</p>
                      <p class="mt-1 text-[11px] font-medium normal-case tracking-normal text-[#a8a29e]">${escapeHtml(compactValue(row.manufacturer, 'Unbekannt'))}</p>
                    </th>
                  `,
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${visibleFields
              .map((field, rowIndex) => {
                const rowClass = rowIndex % 2 === 0 ? 'bg-[#171412]' : 'bg-[#1c1917]';
                return `
                  <tr class="${rowClass} align-top text-[#f5f5f4]">
                    <td class="px-3 py-3 font-semibold text-[#a8a29e]">${escapeHtml(field.label)}</td>
                    ${selectedRows
                      .map((row) => {
                        const hidden = state.hideUnknown && field.isUnknown(row);
                        const rawText = hidden ? '' : field.formatValue(row);
                        return `<td class="px-3 py-3">${escapeHtml(rawText || (state.hideUnknown ? '' : 'k. A.'))}</td>`;
                      })
                      .join('')}
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
};

const compareBarTemplate = (selectedRows) => {
  const count = selectedRows.length;
  const compareToggleClasses = state.compareMode
    ? 'chip-btn border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
    : 'chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]';

  return `
    <section class="panel mt-4 p-4 sm:p-5">
      <div class="flex flex-wrap items-center gap-2">
        <p class="rounded-full border border-[#44403c] bg-[#1c1917] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">
          Vergleich: ${count}/${COMPARE_LIMIT}
        </p>
        <button id="toggle-compare-mode" class="${compareToggleClasses}" ${count === 0 ? 'disabled' : ''}>${state.compareMode ? 'Liste anzeigen' : 'Compare-Modus'}</button>
        <button id="clear-compare" class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]" ${count === 0 ? 'disabled' : ''}>Auswahl leeren</button>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        ${
          count
            ? selectedRows
                .map(
                  (row) => `
                    <span class="inline-flex items-center gap-2 rounded-full border border-[#44403c] bg-[#1c1917] px-3 py-1.5 text-xs text-[#a8a29e]">
                      <span class="font-semibold">${escapeHtml(compactValue(row.name, 'Unbekannt'))}</span>
                      <span class="text-[#a8a29e]">${escapeHtml(compactValue(row.manufacturer, ''))}</span>
                      <button data-remove-compare="${escapeHtml(row.__rowId)}" class="rounded-full border border-[#44403c] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#84cc16] hover:bg-[#292524]">x</button>
                    </span>
                  `,
                )
                .join('')
            : '<p class="text-sm text-[#a8a29e]">Noch nichts ausgewaehlt. Nutze "Compare" in Card oder Tabelle.</p>'
        }
      </div>

      ${state.compareNotice ? `<p class="mt-3 text-xs font-semibold text-[#84cc16]">${escapeHtml(state.compareNotice)}</p>` : ''}
    </section>
  `;
};

const exportRowsAsCsv = (rows) => {
  if (!rows.length) {
    return;
  }

  const fields = state.csvFields.length
    ? state.csvFields
    : Object.keys(rows[0] ?? {}).filter((key) => !key.startsWith('__'));

  const normalizedRows = rows.map((row) => {
    const output = {};
    for (const field of fields) {
      output[field] = row[field] ?? '';
    }
    return output;
  });

  const csv = Papa.unparse(normalizedRows, { columns: fields });
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  anchor.download = `ar_glasses_filtered_${stamp}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const render = () => {
  const filterOptions = getFilterOptions();
  const filtered = sortRows(state.rows.filter(matchesFilters));
  const withPrice = filtered.filter((row) => parsePrice(row.price_usd)).length;
  const withShop = filtered.filter((row) => getShopInfo(row).url).length;
  const activeCount = filtered.filter((row) => isLikelyActive(row)).length;
  const eolCount = filtered.filter((row) => isEol(row)).length;
  const retrievedAt = compactValue(filtered[0]?.dataset_retrieved_at || state.rows[0]?.dataset_retrieved_at, '');
  const selectedRows = getSelectedRows();
  applyThemeToDocument();

  if (state.compareMode && !selectedRows.length) {
    state.compareMode = false;
  }

  const maxPage = Math.max(1, Math.ceil((filtered.length || 1) / state.cardsPageSize));
  if (state.cardsPage > maxPage) {
    state.cardsPage = maxPage;
  }
  const visibleCards = filtered.slice(0, state.cardsPage * state.cardsPageSize);
  const hasMoreCards = visibleCards.length < filtered.length;
  const exportDisabled = filtered.length === 0;
  updateDocumentSeoSignals(filtered.length);
  syncUrlWithState();

  app.innerHTML = `
    <main class="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8">
      <header class="panel relative overflow-hidden p-5 sm:p-6">
        <div class="theme-hero-surface absolute inset-0 -z-10"></div>
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-lime-500">AR / XR DIRECTORY</p>
        <h1 class="mt-2 text-3xl font-bold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-lime-400 to-lime-600 sm:text-4xl">Vergleich fuer AR-Brillen und XR-Glasses</h1>
        <p class="mt-3 max-w-4xl text-sm text-[#a8a29e] sm:text-base">
          Karten- und Tabellenansicht fuer aktuelle und historische Brillen mit Spezifikationen, Preisen, Lifecycle, EOL und Shop-Links.
        </p>
        <p class="mt-2 text-xs text-[#a8a29e]">Datenstand: ${escapeHtml(retrievedAt ? formatDate(retrievedAt) : 'k. A.')}</p>
      </header>

      ${
        state.focusMode
          ? `<section class="mt-4">
              <p class="soft-panel p-3 text-sm text-[#a8a29e]">
                <strong class="text-[#f5f5f4]">${filtered.length}</strong> sichtbare Modelle,
                <strong class="text-[#f5f5f4]"> ${withPrice}</strong> mit Preis,
                <strong class="text-[#f5f5f4]"> ${withShop}</strong> mit Shop-Link
              </p>
            </section>`
          : `<section class="mt-4 grid gap-3 sm:grid-cols-3">
              <p class="soft-panel p-3 text-sm text-[#a8a29e]"><strong class="text-[#f5f5f4]">${filtered.length}</strong> sichtbare Modelle</p>
              <p class="soft-panel p-3 text-sm text-[#a8a29e]"><strong class="text-[#f5f5f4]">${withPrice}</strong> mit Preis / <strong class="text-[#f5f5f4]">${withShop}</strong> mit Shop-Link</p>
              <p class="soft-panel p-3 text-sm text-[#a8a29e]"><strong class="text-[#f5f5f4]">${activeCount}</strong> aktiv / <strong class="text-[#f5f5f4]">${eolCount}</strong> EOL</p>
            </section>`
      }

      ${!state.focusMode || selectedRows.length ? compareBarTemplate(selectedRows) : ''}

      <section class="panel mt-4 p-4 sm:p-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-lg font-semibold text-[#f5f5f4]">Filter</h2>
            <p class="mt-1 text-xs text-[#a8a29e]">${state.focusMode ? 'Fokusansicht: nur Kernfilter sichtbar.' : 'Schnellfilter fuer Suche, Kategorie und Sortierung.'}</p>
          </div>
          ${
            state.focusMode
              ? ''
              : `<button id="toggle-advanced-filters" class="chip-btn ${
                  state.showAdvancedFilters
                    ? 'border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
                    : 'border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]'
                }">${state.showAdvancedFilters ? 'Weniger Filter' : 'Mehr Filter'}</button>`
          }
        </div>

        <div class="mt-3 grid gap-3 md:grid-cols-2 ${state.focusMode ? 'xl:grid-cols-4' : 'xl:grid-cols-5'}">
          <label class="space-y-1 xl:col-span-2">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Suche</span>
            <input id="query-input" type="search" class="field" placeholder="Modell, Hersteller, Software, Tracking, Lifecycle" value="${escapeHtml(state.query)}" />
          </label>

          <label class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Kategorie</span>
            <select id="category-filter" class="field">
              <option value="all"${state.category === 'all' ? ' selected' : ''}>Alle Kategorien</option>
              <option value="AR"${state.category === 'AR' ? ' selected' : ''}>AR</option>
              <option value="XR"${state.category === 'XR' ? ' selected' : ''}>XR</option>
            </select>
          </label>

          ${
            state.focusMode
              ? ''
              : `<label class="space-y-1">
                  <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Hersteller</span>
                  <select id="manufacturer-filter" class="field">
                    ${optionList(filterOptions.manufacturers, state.manufacturer, 'Alle Hersteller')}
                  </select>
                </label>`
          }

          <label class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Sortierung</span>
            <select id="sort-filter" class="field">
              <option value="priority_default"${
                state.sort === 'priority_default' ? ' selected' : ''
              }>Priorität (Neueste, EOL unten)</option>
              <option value="name_asc"${state.sort === 'name_asc' ? ' selected' : ''}>Name A-Z</option>
              <option value="manufacturer_asc"${state.sort === 'manufacturer_asc' ? ' selected' : ''}>Hersteller A-Z</option>
              <option value="release_desc"${state.sort === 'release_desc' ? ' selected' : ''}>Neueste zuerst</option>
              <option value="price_desc"${state.sort === 'price_desc' ? ' selected' : ''}>Preis absteigend</option>
              <option value="price_asc"${state.sort === 'price_asc' ? ' selected' : ''}>Preis aufsteigend</option>
              <option value="fov_desc"${state.sort === 'fov_desc' ? ' selected' : ''}>FOV horizontal absteigend</option>
            </select>
          </label>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button id="view-cards" class="chip-btn ${
            state.viewMode === 'cards'
              ? 'border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
              : 'border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]'
          }">Cards</button>
          <button id="view-table" class="chip-btn ${
            state.viewMode === 'table'
              ? 'border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
              : 'border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]'
          }">Tabelle</button>
          <button id="theme-toggle" class="chip-btn ${
            state.theme === 'light'
              ? 'border-[#2f6fb5] bg-[#2f6fb5] text-white hover:bg-[#25588f]'
              : 'border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]'
          }">${state.theme === 'light' ? 'Dunkelmodus' : 'Hellmodus'}</button>
          <button id="toggle-focus-mode" class="chip-btn ${
            state.focusMode
              ? 'border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
              : 'border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]'
          }">${state.focusMode ? 'Standard View' : 'Focus View'}</button>

          <button id="export-csv" class="chip-btn ${
            exportDisabled
              ? 'cursor-not-allowed border-[#44403c] bg-[#292524] text-[#a8a29e]'
              : 'border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
          }" ${exportDisabled ? 'disabled' : ''}>CSV Export</button>

          <button id="clear-filters" class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">Filter zuruecksetzen</button>
        </div>

        <div id="advanced-filters-region" class="mt-4 space-y-3 ${state.showAdvancedFilters && !state.focusMode ? '' : 'hidden'}">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Erweiterte Filter</p>
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Display-Typ</span>
              <select id="display-filter" class="field">
                ${optionList(filterOptions.displayTypes, state.displayType, 'Alle Display-Arten')}
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Optik</span>
              <select id="optics-filter" class="field">
                ${optionList(filterOptions.optics, state.optics, 'Alle Optik-Typen')}
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Tracking</span>
              <select id="tracking-filter" class="field">
                ${optionList(filterOptions.tracking, state.tracking, 'Alle Tracking-Typen')}
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Eye Tracking</span>
              <select id="eye-tracking-filter" class="field">
                ${optionList(filterOptions.eyeTracking, state.eyeTracking, 'Alle Eye-Tracking-Werte')}
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Hand Tracking</span>
              <select id="hand-tracking-filter" class="field">
                ${optionList(filterOptions.handTracking, state.handTracking, 'Alle Hand-Tracking-Werte')}
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Passthrough</span>
              <select id="passthrough-filter" class="field">
                ${optionList(filterOptions.passthrough, state.passthrough, 'Alle Passthrough-Werte')}
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Aktiver Vertrieb</span>
              <select id="active-filter" class="field">
                ${optionList(filterOptions.activeStatuses, state.active, 'Alle Vertrieb-Status')}
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">EOL / Update-Status</span>
              <select id="eol-filter" class="field">
                ${optionList(filterOptions.eolStatuses, state.eol, 'Alle Lifecycle-Status')}
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Min. FOV horizontal (deg)</span>
              <input id="fov-filter" type="number" min="0" step="1" class="field" value="${escapeHtml(state.minFov)}" placeholder="z. B. 40" />
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Min. Refresh (Hz)</span>
              <input id="refresh-filter" type="number" min="0" step="1" class="field" value="${escapeHtml(state.minRefresh)}" placeholder="z. B. 60" />
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Max. Preis (USD)</span>
              <input id="price-filter" type="number" min="0" step="1" class="field" value="${escapeHtml(state.maxPrice)}" placeholder="z. B. 1500" />
            </label>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="only-price" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.onlyPrice ? 'checked' : ''} />
              Nur mit Preis
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="only-shop" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.onlyShop ? 'checked' : ''} />
              Nur mit Shop-Link
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="only-available" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.onlyAvailable ? 'checked' : ''} />
              Nur aktiv im Vertrieb
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="flag-ar" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.flagAr ? 'checked' : ''} />
              AR-Flag
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="flag-xr" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.flagXr ? 'checked' : ''} />
              XR-Flag
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="show-eur" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.showEur ? 'checked' : ''} />
              EUR-Zusatz
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="hide-unknown" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.hideUnknown ? 'checked' : ''} />
              Unbekannte Werte ausblenden
            </label>
          </div>
        </div>
        ${state.showEur ? `<p class="mt-2 text-xs text-[#a8a29e]">${escapeHtml(formatRateHint())}</p>` : ''}
      </section>

      <section class="mt-4">
        ${
          state.compareMode
            ? compareModeTemplate(selectedRows)
            : filtered.length === 0
              ? '<p class="panel p-10 text-center text-sm text-[#a8a29e]">Keine Treffer fuer die gewaehlten Filter.</p>'
              : state.viewMode === 'cards'
                ? `
                    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">${visibleCards.map(cardTemplate).join('')}</div>
                    <div class="mt-4 flex flex-wrap items-center gap-2">
                      <p class="text-sm text-[#a8a29e]">${visibleCards.length} von ${filtered.length} Modellen angezeigt</p>
                      ${
                        hasMoreCards
                          ? '<button id="load-more-cards" class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">Mehr laden</button>'
                          : ''
                      }
                    </div>
                  `
                : tableTemplate(filtered)
        }
      </section>

      ${
        state.focusMode
          ? ''
          : `<section class="panel mt-4 p-4 sm:p-5">
              <h2 class="text-lg font-semibold text-[#f5f5f4] sm:text-xl">AR/XR Brillen FAQ und Suchkontext</h2>
              <p class="mt-2 text-sm text-[#a8a29e]">
                Diese Vergleichsseite deckt aktuelle und historische AR- und XR-Brillen inklusive Shop-Links, Preisstatus,
                FOV, Refresh, Tracking, Software sowie Updates/EOL ab.
              </p>
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <article class="soft-panel p-3">
                  <h3 class="text-sm font-semibold text-[#f5f5f4]">Welche Modelle sind enthalten?</h3>
                  <p class="mt-1 text-sm text-[#a8a29e]">
                    Moderne AR/XR-Modelle plus Legacy-Geraete wie HoloLens 1, Epson Moverio, Sony SmartEyeglass und weitere.
                  </p>
                </article>
                <article class="soft-panel p-3">
                  <h3 class="text-sm font-semibold text-[#f5f5f4]">Welche Daten kann ich filtern?</h3>
                  <p class="mt-1 text-sm text-[#a8a29e]">
                    Kategorie (AR/XR), Hersteller, Display, Optik, Tracking, Eye/Hand, Passthrough, FOV, Refresh, Preis,
                    Vertriebsstatus und EOL.
                  </p>
                </article>
                <article class="soft-panel p-3">
                  <h3 class="text-sm font-semibold text-[#f5f5f4]">Gibt es exportierbare Daten?</h3>
                  <p class="mt-1 text-sm text-[#a8a29e]">
                    Ja, die gefilterten Ergebnisse lassen sich direkt als CSV exportieren. Der komplette Datensatz ist auch
                    unter <code>/data/ar_glasses.csv</code> abrufbar.
                  </p>
                </article>
                <article class="soft-panel p-3">
                  <h3 class="text-sm font-semibold text-[#f5f5f4]">Wie aktuell sind die Infos?</h3>
                  <p class="mt-1 text-sm text-[#a8a29e]">
                    Quelle sind kuratierte Datensaetze plus manuelle Legacy-Ergaenzungen. Zu jedem Modell gibt es Lifecycle-/EOL-Kontext
                    und Datenquellen-Links.
                  </p>
                </article>
              </div>
            </section>`
      }
    </main>
  `;

  const setAndRender = (key, value, options = {}) => {
    const { resetCardsPage = true } = options;
    state[key] = value;
    if (resetCardsPage) {
      state.cardsPage = 1;
    }
    render();
  };

  document.querySelector('#query-input')?.addEventListener('input', (event) => setAndRender('query', event.target.value));
  document.querySelector('#category-filter')?.addEventListener('change', (event) => setAndRender('category', event.target.value));
  document
    .querySelector('#manufacturer-filter')
    ?.addEventListener('change', (event) => setAndRender('manufacturer', event.target.value));
  document.querySelector('#display-filter')?.addEventListener('change', (event) => setAndRender('displayType', event.target.value));
  document.querySelector('#optics-filter')?.addEventListener('change', (event) => setAndRender('optics', event.target.value));
  document.querySelector('#tracking-filter')?.addEventListener('change', (event) => setAndRender('tracking', event.target.value));
  document
    .querySelector('#eye-tracking-filter')
    ?.addEventListener('change', (event) => setAndRender('eyeTracking', event.target.value));
  document
    .querySelector('#hand-tracking-filter')
    ?.addEventListener('change', (event) => setAndRender('handTracking', event.target.value));
  document
    .querySelector('#passthrough-filter')
    ?.addEventListener('change', (event) => setAndRender('passthrough', event.target.value));

  document.querySelector('#active-filter')?.addEventListener('change', (event) => setAndRender('active', event.target.value));
  document.querySelector('#eol-filter')?.addEventListener('change', (event) => setAndRender('eol', event.target.value));
  document.querySelector('#fov-filter')?.addEventListener('input', (event) => setAndRender('minFov', event.target.value));
  document.querySelector('#refresh-filter')?.addEventListener('input', (event) => setAndRender('minRefresh', event.target.value));
  document.querySelector('#price-filter')?.addEventListener('input', (event) => setAndRender('maxPrice', event.target.value));
  document.querySelector('#sort-filter')?.addEventListener('change', (event) => setAndRender('sort', event.target.value));

  document.querySelector('#only-price')?.addEventListener('change', (event) => setAndRender('onlyPrice', event.target.checked));
  document.querySelector('#only-shop')?.addEventListener('change', (event) => setAndRender('onlyShop', event.target.checked));
  document
    .querySelector('#only-available')
    ?.addEventListener('change', (event) => setAndRender('onlyAvailable', event.target.checked));
  document.querySelector('#flag-ar')?.addEventListener('change', (event) => setAndRender('flagAr', event.target.checked));
  document.querySelector('#flag-xr')?.addEventListener('change', (event) => setAndRender('flagXr', event.target.checked));
  document
    .querySelector('#show-eur')
    ?.addEventListener('change', (event) => setAndRender('showEur', event.target.checked, { resetCardsPage: false }));
  document
    .querySelector('#hide-unknown')
    ?.addEventListener('change', (event) => setAndRender('hideUnknown', event.target.checked, { resetCardsPage: false }));

  document.querySelector('#view-cards')?.addEventListener('click', () => setAndRender('viewMode', 'cards', { resetCardsPage: false }));
  document.querySelector('#view-table')?.addEventListener('click', () => setAndRender('viewMode', 'table', { resetCardsPage: false }));
  document.querySelector('#theme-toggle')?.addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    writeThemeToStorage(state.theme);
    render();
  });
  document.querySelector('#toggle-focus-mode')?.addEventListener('click', () => {
    state.focusMode = !state.focusMode;
    if (state.focusMode) {
      state.showAdvancedFilters = false;
    }
    render();
  });
  document
    .querySelector('#toggle-advanced-filters')
    ?.addEventListener('click', () =>
      setAndRender('showAdvancedFilters', !state.showAdvancedFilters, { resetCardsPage: false }),
    );

  document.querySelector('#export-csv')?.addEventListener('click', () => exportRowsAsCsv(filtered));

  document.querySelector('#load-more-cards')?.addEventListener('click', () => {
    state.cardsPage += 1;
    render();
  });

  document.querySelector('#toggle-compare-mode')?.addEventListener('click', () => {
    if (!state.selectedIds.length) {
      return;
    }
    state.compareMode = !state.compareMode;
    render();
  });

  document.querySelector('#clear-compare')?.addEventListener('click', () => {
    state.selectedIds = [];
    state.compareMode = false;
    state.compareNotice = '';
    render();
  });

  document.querySelectorAll('[data-remove-compare]').forEach((button) => {
    button.addEventListener('click', () => {
      const modelId = button.getAttribute('data-remove-compare');
      if (!modelId) {
        return;
      }
      state.selectedIds = state.selectedIds.filter((id) => id !== modelId);
      state.compareNotice = '';
      if (!state.selectedIds.length) {
        state.compareMode = false;
      }
      render();
    });
  });

  document.querySelectorAll('[data-compare-toggle]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const modelId = event.target.getAttribute('data-model-id');
      if (!modelId) {
        return;
      }

      const isChecked = Boolean(event.target.checked);
      if (isChecked) {
        if (!state.selectedIds.includes(modelId)) {
          if (state.selectedIds.length >= COMPARE_LIMIT) {
            state.compareNotice = `Maximal ${COMPARE_LIMIT} Modelle gleichzeitig im Vergleich.`;
          } else {
            state.selectedIds = [...state.selectedIds, modelId];
            state.compareNotice = '';
          }
        }
      } else {
        state.selectedIds = state.selectedIds.filter((id) => id !== modelId);
        state.compareNotice = '';
        if (!state.selectedIds.length) {
          state.compareMode = false;
        }
      }

      render();
    });
  });

  document.querySelector('#clear-filters')?.addEventListener('click', () => {
    state.query = '';
    state.category = 'all';
    state.manufacturer = 'all';
    state.displayType = 'all';
    state.optics = 'all';
    state.tracking = 'all';
    state.eyeTracking = 'all';
    state.handTracking = 'all';
    state.passthrough = 'all';
    state.active = 'all';
    state.eol = 'all';
    state.minFov = '';
    state.minRefresh = '';
    state.maxPrice = '';
    state.onlyPrice = false;
    state.onlyShop = false;
    state.onlyAvailable = false;
    state.flagAr = false;
    state.flagXr = false;
    state.showEur = false;
    state.hideUnknown = false;
    state.showAdvancedFilters = false;
    state.sort = 'priority_default';
    state.cardsPage = 1;
    state.compareMode = false;
    state.compareNotice = '';
    render();
  });
};

const parseCsv = (text) =>
  new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta }) => {
        const fields = Array.isArray(meta?.fields) ? meta.fields : [];
        resolve({ data, fields });
      },
      error: reject,
    });
  });

const init = async () => {
  state.theme = readThemeFromStorage();
  applyStateFromUrl();
  state.theme = normalizeTheme(state.theme, 'dark');
  writeThemeToStorage(state.theme);
  applyThemeToDocument();
  setFallbackUsdRate();
  app.innerHTML = '<main class="mx-auto max-w-[1320px] px-4 py-8"><p class="panel p-6 text-sm text-[#a8a29e]">Lade Brillendaten...</p></main>';

  const ratePromise = fetchUsdToEurRate();

  try {
    const response = await fetch('/data/ar_glasses.csv', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`CSV request failed with status ${response.status}`);
    }
    const csv = await response.text();
    const { data, fields } = await parseCsv(csv);
    state.rows = data.map((row, index) => ({ ...row, __rowId: getRowId(row, index) }));
    state.csvFields = fields.filter((field) => !field.startsWith('__'));
    pruneSelectedIdsToKnownRows();
    state.compareNotice = '';
    render();
    ratePromise.then(() => {
      if (state.rows.length) {
        render();
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    app.innerHTML = `
      <main class="mx-auto max-w-[1320px] px-4 py-8">
        <p class="panel border-red-700/60 bg-red-950/40 p-6 text-sm font-semibold text-red-200">Daten konnten nicht geladen werden.</p>
        <p class="mt-3 text-sm text-[#a8a29e]">${escapeHtml(message)}</p>
      </main>
    `;
  }
};

init();
