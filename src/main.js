import Papa from 'papaparse';
import './style.css';

const app = document.querySelector('#app');

const COMPARE_LIMIT = 6;
const CARDS_PER_PAGE = 12;
const USD_TO_EUR_FALLBACK = 0.92;
const RATE_SOURCE_URL = 'https://api.frankfurter.app/latest?from=USD&to=EUR';
const VIEW_MODES = new Set(['cards', 'table']);
const LANGUAGE_MODES = new Set(['de', 'en']);
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
const LANGUAGE_STORAGE_KEY = 'ar_directory_language';
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
  language: 'de',
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

const isEnglish = () => state.language === 'en';
const t = (de, en) => (isEnglish() ? en : de);
const locale = () => (isEnglish() ? 'en-US' : 'de-DE');

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
  new Intl.NumberFormat(locale(), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

const formatPrice = (value) => {
  const price = parsePrice(value);
  if (!price) {
    return t('Preis auf Anfrage', 'Price on request');
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
    return t('k. A.', 'n/a');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return t('k. A.', 'n/a');
  }
  return new Intl.DateTimeFormat(locale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
};

const formatNumber = (value, suffix = '') => {
  const numeric = toNumber(value);
  if (numeric === null) {
    return t('k. A.', 'n/a');
  }
  return `${new Intl.NumberFormat(locale(), {
    maximumFractionDigits: 1,
  }).format(numeric)}${suffix}`;
};

const normalizeText = (value) => String(value ?? '').toLowerCase().trim();

const normalizeTheme = (value, fallback = 'dark') => {
  const normalized = normalizeText(value);
  return THEME_MODES.has(normalized) ? normalized : fallback;
};

const normalizeLanguage = (value, fallback = 'de') => {
  const normalized = normalizeText(value);
  return LANGUAGE_MODES.has(normalized) ? normalized : fallback;
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

const readLanguageFromStorage = () => {
  if (typeof window === 'undefined') {
    return 'de';
  }
  try {
    return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY), 'de');
  } catch {
    return 'de';
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

const writeLanguageToStorage = (language) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizeLanguage(language, 'de'));
  } catch {
    // ignore storage failures
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

const applyLanguageToDocument = () => {
  if (typeof document === 'undefined') {
    return;
  }
  const language = normalizeLanguage(state.language, 'de');
  state.language = language;
  document.documentElement.lang = language;
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
  const countLabel = Number.isFinite(visibleCount) ? `${visibleCount} ${t('Modelle', 'models')}` : t('AR/XR Modelle', 'AR/XR models');
  const queryLabel = String(state.query ?? '').trim();
  document.title = queryLabel
    ? `${queryLabel} | ${t('AR/XR Brillen Vergleich', 'AR/XR Glasses Comparison')} (${countLabel})`
    : t(
        `AR/XR Brillen Vergleich 2026: ${countLabel}, Preise, Shop-Links, EOL`,
        `AR/XR Glasses Comparison 2026: ${countLabel}, pricing, shop links, EOL`,
      );

  const description = queryLabel
    ? t(
        `Filter- und Suchergebnis fuer "${queryLabel}" im AR/XR Brillen Vergleich mit Spezifikationen, Preisen, Lifecycle und Shop-Links.`,
        `Filtered search result for "${queryLabel}" in the AR/XR glasses comparison with specs, pricing, lifecycle and shop links.`,
      )
    : t(
        'Vergleich fuer AR- und XR-Brillen mit Spezifikationen, Preisen, Shop-Links, aktivem Vertrieb, Software, Updates und EOL-Status.',
        'Comparison for AR and XR glasses with specifications, pricing, shop links, active distribution, software, updates and EOL status.',
      );

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
  state.usdToEurSource.startsWith('fallback:') ? `${t('Fallback', 'Fallback')} ${USD_TO_EUR_FALLBACK}` : 'Frankfurter API';

const formatSafeDateLabel = (value) => {
  return formatDate(value);
};

const formatRateHint = () => {
  const rate = new Intl.NumberFormat(locale(), {
    minimumFractionDigits: 3,
    maximumFractionDigits: 4,
  }).format(state.usdToEurRate);
  const fetchedAt = state.usdToEurFetchedAt ? formatSafeDateLabel(state.usdToEurFetchedAt) : t('k. A.', 'n/a');
  return t(
    `Kurs: 1 USD = ${rate} EUR (${formatRateSourceLabel()}, Stand: ${fetchedAt})`,
    `Rate: 1 USD = ${rate} EUR (${formatRateSourceLabel()}, date: ${fetchedAt})`,
  );
};

const compactValue = (value, fallback = t('k. A.', 'n/a')) => {
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

const maybeHiddenText = (value, fallback = t('k. A.', 'n/a')) => {
  if (state.hideUnknown && isUnknownValue(value)) {
    return '';
  }
  return compactValue(value, fallback);
};

const uniqueSorted = (values) =>
  [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, locale(), { sensitivity: 'base' }),
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

const captureQueryFocusState = () => {
  if (typeof document === 'undefined') {
    return null;
  }
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement) || active.id !== 'query-input') {
    return null;
  }
  return {
    start: active.selectionStart,
    end: active.selectionEnd,
    direction: active.selectionDirection,
  };
};

const restoreQueryFocusState = (focusState) => {
  if (!focusState || typeof document === 'undefined') {
    return;
  }
  const input = document.querySelector('#query-input');
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  input.focus({ preventScroll: true });
  const valueLength = input.value.length;
  const start = Number.isFinite(focusState.start) ? Math.max(0, Math.min(valueLength, focusState.start)) : valueLength;
  const end = Number.isFinite(focusState.end) ? Math.max(0, Math.min(valueLength, focusState.end)) : valueLength;
  input.setSelectionRange(start, end, focusState.direction || 'none');
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

  const language = params.get('lang');
  if (language !== null) {
    state.language = normalizeLanguage(language, state.language);
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
  setText('lang', state.language, 'de');
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
  String(left ?? '').localeCompare(String(right ?? ''), locale(), { sensitivity: 'base' });

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

const optionList = (values, selectedValue, allLabel = t('Alle', 'All')) => {
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
    ${t('Vergleich', 'Compare')}
  </label>
`;

const buildCardFacts = (row) => {
  const entries = [
    { label: t('Display', 'Display'), raw: row.display_type, value: compactValue(row.display_type) },
    { label: t('Optik', 'Optics'), raw: row.optics, value: compactValue(row.optics) },
    { label: t('Tracking', 'Tracking'), raw: row.tracking, value: compactValue(row.tracking) },
    { label: t('Eye Tracking', 'Eye Tracking'), raw: row.eye_tracking, value: compactValue(row.eye_tracking) },
    { label: t('Hand Tracking', 'Hand Tracking'), raw: row.hand_tracking, value: compactValue(row.hand_tracking) },
    { label: t('Passthrough', 'Passthrough'), raw: row.passthrough, value: compactValue(row.passthrough) },
    { label: 'FOV H', raw: row.fov_horizontal_deg, value: formatNumber(row.fov_horizontal_deg, ' deg') },
    { label: t('Refresh', 'Refresh'), raw: row.refresh_hz, value: formatNumber(row.refresh_hz, ' Hz') },
    { label: t('Software', 'Software'), raw: row.software, value: compactValue(row.software) },
    { label: t('Aufloesung', 'Resolution'), raw: row.resolution_per_eye, value: compactValue(row.resolution_per_eye) },
    { label: t('Compute', 'Compute'), raw: row.compute_unit, value: compactValue(row.compute_unit) },
  ];

  if (!state.hideUnknown) {
    return entries;
  }
  return entries.filter((entry) => !isUnknownValue(entry.raw));
};

const cardTemplate = (row) => {
  const name = escapeHtml(compactValue(row.name, t('Unbekanntes Modell', 'Unknown model')));
  const manufacturer = escapeHtml(compactValue(row.manufacturer, t('Unbekannt', 'Unknown')));
  const category = escapeHtml(compactValue(row.xr_category, 'AR'));
  const image = safeExternalUrl(row.image_url) || getModelImageUrl(row);
  const shop = getShopInfo(row);
  const shopButtonClasses = shop.official
    ? 'chip-btn border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
    : 'chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]';
  const lifecycleClasses = lifecycleTone(row);
  const eolDate = row.eol_date ? formatDate(row.eol_date) : t('k. A.', 'n/a');
  const releaseDate = formatDate(row.release_date || row.announced_date);
  const infoUrl = safeExternalUrl(row.lifecycle_source || row.source_page);
  const isSelected = state.selectedIds.includes(row.__rowId);
  const facts = buildCardFacts(row);
  const primaryFacts = facts.slice(0, 6);
  const secondaryFacts = facts.slice(6);
  const lifecycleNotes = maybeHiddenText(row.lifecycle_notes, t('Keine Angaben.', 'No details.'));
  const lifecycleSource = maybeHiddenText(row.lifecycle_source, '');

  return `
    <article class="panel overflow-hidden">
      <div class="relative h-48 border-b border-[#44403c] bg-gradient-to-br from-[#1c1917] to-[#1c1917]">
        ${
          image
            ? `<img src="${escapeHtml(image)}" alt="${name}" loading="lazy" class="h-full w-full object-contain p-4" />`
            : `<div class="grid h-full place-items-center text-sm text-[#a8a29e]">${t('Kein Bild verfuegbar', 'No image available')}</div>`
        }
        <div class="absolute left-3 top-3">${selectionLabelTemplate(row.__rowId, isSelected)}</div>
        <span class="absolute right-3 top-3 rounded-full border px-2.5 py-1 text-xs font-bold ${categoryTone(row.xr_category)}">${category}</span>
      </div>
      <div class="space-y-4 p-4">
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#a8a29e]">${manufacturer}</p>
          <h2 class="font-semibold text-2xl leading-tight text-[#f5f5f4]">${name}</h2>
          <p class="text-sm text-[#a8a29e]">${t('Release', 'Release')}: ${escapeHtml(releaseDate)}</p>
        </div>

        <div class="grid grid-cols-2 gap-2 text-sm">
          <div class="soft-panel p-2.5">
            <p class="text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">${t('Preis', 'Price')}</p>
            <p class="mt-1 font-semibold text-[#f5f5f4]">${escapeHtml(formatPrice(row.price_usd))}</p>
          </div>
          <div class="soft-panel p-2.5">
            <p class="text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">${t('Vertrieb', 'Distribution')}</p>
            <p class="mt-1 font-semibold text-[#f5f5f4]">${escapeHtml(compactValue(row.active_distribution, t('k. A.', 'n/a')))}</p>
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
            : `<p class="soft-panel p-3 text-xs text-[#a8a29e]">${t(
                'Keine bekannten Spezifikationen sichtbar (Toggle "Unbekannte Werte ausblenden" aktiv).',
                'No known specifications visible (toggle "Hide unknown values" is active).',
              )}</p>`
        }
        ${
          secondaryFacts.length
            ? `<details class="compact-details rounded-xl border border-[#44403c] bg-[#1c1917] p-2.5 text-sm text-[#a8a29e]">
                <summary class="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em]">${t(
                  'Mehr Spezifikationen',
                  'More specifications',
                )}</summary>
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
          <p class="text-[11px] font-semibold uppercase tracking-[0.12em]">${t('Updates / EOL', 'Updates / EOL')}</p>
          <p class="mt-1 font-semibold">${escapeHtml(compactValue(row.eol_status))}</p>
          <p class="mt-1 text-xs">${t('EOL-Datum', 'EOL date')}: ${escapeHtml(eolDate)}</p>
          ${lifecycleNotes ? `<p class="mt-2 text-xs leading-relaxed">${escapeHtml(lifecycleNotes)}</p>` : ''}
          ${lifecycleSource ? `<p class="mt-2 text-[11px] leading-relaxed">${t('Quelle', 'Source')}: ${escapeHtml(lifecycleSource)}</p>` : ''}
        </div>

        <div class="flex flex-wrap gap-2">
          ${
            shop.url
              ? `<a href="${escapeHtml(shop.url)}" target="_blank" rel="noreferrer" class="${shopButtonClasses}">${escapeHtml(shop.label)}</a>`
              : `<span class="chip-btn cursor-not-allowed border-[#44403c] bg-[#292524] text-[#a8a29e]">${t(
                  'Shop-Link fehlt',
                  'No shop link',
                )}</span>`
          }
          ${
            infoUrl
              ? `<a href="${escapeHtml(infoUrl)}" target="_blank" rel="noreferrer" class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">${t(
                  'Datenquelle',
                  'Data source',
                )}</a>`
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
    return `<p class="panel p-8 text-center text-sm text-[#a8a29e]">${t(
      'Keine Ergebnisse fuer diese Filter.',
      'No results for these filters.',
    )}</p>`;
  }

  return `
    <div class="panel overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-[1650px] border-collapse text-sm">
          <thead class="bg-[#1c1917] text-left text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">
            <tr>
              <th class="px-3 py-3">${t('Vergleich', 'Compare')}</th>
              <th class="px-3 py-3">${t('Brille', 'Glasses')}</th>
              <th class="px-3 py-3">${t('Hersteller', 'Manufacturer')}</th>
              <th class="px-3 py-3">${t('Kat.', 'Cat.')}</th>
              <th class="px-3 py-3">Display</th>
              <th class="px-3 py-3">${t('Optik', 'Optics')}</th>
              <th class="px-3 py-3">${t('Tracking', 'Tracking')}</th>
              <th class="px-3 py-3">Eye</th>
              <th class="px-3 py-3">Hand</th>
              <th class="px-3 py-3">Passthrough</th>
              <th class="px-3 py-3">FOV H</th>
              <th class="px-3 py-3">${t('Refresh', 'Refresh')}</th>
              <th class="px-3 py-3">${t('Preis', 'Price')}</th>
              <th class="px-3 py-3">${t('Vertrieb', 'Distribution')}</th>
              <th class="px-3 py-3">${t('EOL / Updates', 'EOL / Updates')}</th>
              <th class="px-3 py-3">${t('Software', 'Software')}</th>
              <th class="px-3 py-3">${t('Links', 'Links')}</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((row, index) => {
                const shop = getShopInfo(row);
                const infoUrl = safeExternalUrl(row.lifecycle_source || row.source_page);
                const selected = state.selectedIds.includes(row.__rowId);
                const lifecycleNotes = maybeHiddenText(row.lifecycle_notes, t('Keine Angaben.', 'No details.'));

                return `
                  <tr class="${index % 2 === 0 ? 'bg-[#171412]' : 'bg-[#1c1917]'} align-top text-[#f5f5f4]">
                    <td class="px-3 py-3">${selectionLabelTemplate(row.__rowId, selected)}</td>
                    <td class="px-3 py-3">
                      <p class="font-semibold">${escapeHtml(compactValue(row.name, t('Unbekannt', 'Unknown')))}</p>
                      <p class="mt-1 text-xs text-[#a8a29e]">${escapeHtml(
                        maybeHiddenText(row.resolution_per_eye, t('k. A.', 'n/a')) || t('k. A.', 'n/a'),
                      )}</p>
                    </td>
                    <td class="px-3 py-3">${escapeHtml(compactValue(row.manufacturer))}</td>
                    <td class="px-3 py-3">
                      <span class="rounded-full border px-2 py-1 text-xs font-semibold ${categoryTone(row.xr_category)}">${escapeHtml(
                        compactValue(row.xr_category, 'AR'),
                      )}</span>
                    </td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.display_type) || t('k. A.', 'n/a'))}</td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.optics) || t('k. A.', 'n/a'))}</td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.tracking) || t('k. A.', 'n/a'))}</td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.eye_tracking) || t('k. A.', 'n/a'))}</td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.hand_tracking) || t('k. A.', 'n/a'))}</td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.passthrough) || t('k. A.', 'n/a'))}</td>
                    <td class="px-3 py-3">${escapeHtml(formatNumber(row.fov_horizontal_deg, ' deg'))}</td>
                    <td class="px-3 py-3">${escapeHtml(formatNumber(row.refresh_hz, ' Hz'))}</td>
                    <td class="px-3 py-3">${escapeHtml(formatPrice(row.price_usd))}</td>
                    <td class="px-3 py-3">${escapeHtml(compactValue(row.active_distribution, t('k. A.', 'n/a')))}</td>
                    <td class="px-3 py-3">
                      <p class="font-semibold">${escapeHtml(compactValue(row.eol_status))}</p>
                      ${lifecycleNotes ? `<p class="mt-1 text-xs text-[#a8a29e]">${escapeHtml(lifecycleNotes)}</p>` : ''}
                    </td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.software) || t('k. A.', 'n/a'))}</td>
                    <td class="px-3 py-3">
                      <div class="flex flex-col gap-2">
                        ${
                          shop.url
                            ? `<a href="${escapeHtml(shop.url)}" target="_blank" rel="noreferrer" class="text-xs font-semibold text-[#84cc16] hover:underline">${escapeHtml(shop.label)}</a>`
                            : `<span class="text-xs text-[#a8a29e]">${t('Kein Shop-Link', 'No shop link')}</span>`
                        }
                        ${
                          infoUrl
                            ? `<a href="${escapeHtml(infoUrl)}" target="_blank" rel="noreferrer" class="text-xs font-semibold text-[#84cc16] hover:underline">${t(
                                'Quelle',
                                'Source',
                              )}</a>`
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
  compareField(t('Hersteller', 'Manufacturer'), (row) => row.manufacturer),
  compareField(t('Kategorie', 'Category'), (row) => row.xr_category, (row) => compactValue(row.xr_category, 'AR')),
  compareField(t('Release', 'Release'), (row) => row.release_date || row.announced_date, (row) => formatDate(row.release_date || row.announced_date)),
  compareField(t('Preis', 'Price'), (row) => row.price_usd, (row) => formatPrice(row.price_usd), (row) => !parsePrice(row.price_usd)),
  compareField('Display', (row) => row.display_type),
  compareField(t('Optik', 'Optics'), (row) => row.optics),
  compareField(t('Tracking', 'Tracking'), (row) => row.tracking),
  compareField('Eye Tracking', (row) => row.eye_tracking),
  compareField('Hand Tracking', (row) => row.hand_tracking),
  compareField('Passthrough', (row) => row.passthrough),
  compareField(t('FOV horizontal', 'FOV horizontal'), (row) => row.fov_horizontal_deg, (row) => formatNumber(row.fov_horizontal_deg, ' deg'), (row) => toNumber(row.fov_horizontal_deg) === null),
  compareField(t('FOV vertikal', 'FOV vertical'), (row) => row.fov_vertical_deg, (row) => formatNumber(row.fov_vertical_deg, ' deg'), (row) => toNumber(row.fov_vertical_deg) === null),
  compareField(t('Refresh', 'Refresh'), (row) => row.refresh_hz, (row) => formatNumber(row.refresh_hz, ' Hz'), (row) => toNumber(row.refresh_hz) === null),
  compareField(t('Aufloesung', 'Resolution'), (row) => row.resolution_per_eye),
  compareField(t('Gewicht', 'Weight'), (row) => row.weight_g, (row) => formatNumber(row.weight_g, ' g'), (row) => toNumber(row.weight_g) === null),
  compareField('Compute Unit', (row) => row.compute_unit),
  compareField(t('Software', 'Software'), (row) => row.software),
  compareField(t('Vertrieb', 'Distribution'), (row) => row.active_distribution),
  compareField(t('EOL / Lifecycle', 'EOL / Lifecycle'), (row) => row.eol_status),
  compareField(
    t('Lifecycle Notes', 'Lifecycle notes'),
    (row) => row.lifecycle_notes,
    (row) => compactValue(row.lifecycle_notes, t('Keine Angaben.', 'No details.')),
  ),
];

const getRadarAxes = () => [
  { label: 'FOV H', inverted: false, getValue: (row) => getHorizontalFov(row) },
  { label: t('Refresh', 'Refresh'), inverted: false, getValue: (row) => toNumber(row.refresh_hz) },
  { label: t('Gewicht (inv.)', 'Weight (inv.)'), inverted: true, getValue: (row) => toNumber(row.weight_g) },
  { label: t('Preis (inv.)', 'Price (inv.)'), inverted: true, getValue: (row) => parsePrice(row.price_usd) },
  { label: t('Tracking-Score', 'Tracking score'), inverted: false, getValue: (row) => getTrackingScore(row) },
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
      <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[#a8a29e]">${t(
        'Spider Chart (normalisiert auf Auswahl)',
        'Spider chart (normalized to current selection)',
      )}</p>
      <div class="mt-3 overflow-x-auto">
        <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${t(
          'Radarvergleich der ausgewaehlten Modelle',
          'Radar comparison of selected models',
        )}" class="mx-auto block h-[360px] min-w-[320px]">
          ${gridPolygons}
          ${axisLines}
          ${series.map((entry) => entry.polygon).join('')}
          ${series.map((entry) => entry.points).join('')}
        </svg>
      </div>
      <p class="mt-2 text-xs text-[#a8a29e]">${t(
        'Achsen: FOV H, Refresh, Gewicht (invertiert), Preis (invertiert), Tracking-Score.',
        'Axes: FOV H, refresh, weight (inverted), price (inverted), tracking score.',
      )}</p>
      <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        ${series
          .map(
            (entry) => `
              <div class="inline-flex items-center gap-2 rounded-lg border border-[#44403c] bg-[#1c1917] px-2.5 py-1.5 text-xs text-[#a8a29e]">
                <span class="inline-block h-2.5 w-2.5 rounded-full" style="background:${entry.color};"></span>
                <span class="font-semibold">${escapeHtml(compactValue(entry.row.name, t('Unbekannt', 'Unknown')))}</span>
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
    return `<p class="panel p-8 text-sm text-[#a8a29e]">${t(
      `Keine Modelle ausgewaehlt. Waehle bis zu ${COMPARE_LIMIT} Modelle fuer den Direktvergleich.`,
      `No models selected. Choose up to ${COMPARE_LIMIT} models for direct comparison.`,
    )}</p>`;
  }

  const fields = getCompareFields();
  const visibleFields = state.hideUnknown
    ? fields.filter((field) => selectedRows.some((row) => !field.isUnknown(row)))
    : fields;

  return `
    <div class="panel overflow-hidden">
      <div class="border-b border-[#44403c] bg-[#1c1917] px-4 py-3">
        <h2 class="font-semibold text-2xl text-[#f5f5f4]">${t('Direktvergleich', 'Direct comparison')}</h2>
        <p class="mt-1 text-sm text-[#a8a29e]">${t(
          `${selectedRows.length} ausgewaehlte Modelle, max. ${COMPARE_LIMIT} gleichzeitig.`,
          `${selectedRows.length} selected models, max ${COMPARE_LIMIT} at once.`,
        )}</p>
      </div>
      ${compareRadarTemplate(selectedRows)}
      <div class="overflow-x-auto">
        <table class="min-w-[980px] border-collapse text-sm">
          <thead class="bg-[#1c1917] text-left text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">
            <tr>
              <th class="px-3 py-3">${t('Merkmal', 'Feature')}</th>
              ${selectedRows
                .map(
                  (row) => `
                    <th class="px-3 py-3 align-top">
                      <p class="font-semibold text-[#f5f5f4]">${escapeHtml(compactValue(row.name, t('Unbekannt', 'Unknown')))}</p>
                      <p class="mt-1 text-[11px] font-medium normal-case tracking-normal text-[#a8a29e]">${escapeHtml(
                        compactValue(row.manufacturer, t('Unbekannt', 'Unknown')),
                      )}</p>
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
                        return `<td class="px-3 py-3">${escapeHtml(rawText || (state.hideUnknown ? '' : t('k. A.', 'n/a')))}</td>`;
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
          ${t('Vergleich', 'Compare')}: ${count}/${COMPARE_LIMIT}
        </p>
        <button id="toggle-compare-mode" class="${compareToggleClasses}" ${count === 0 ? 'disabled' : ''}>${
          state.compareMode ? t('Liste anzeigen', 'Show list') : t('Compare-Modus', 'Compare mode')
        }</button>
        <button id="clear-compare" class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]" ${
          count === 0 ? 'disabled' : ''
        }>${t('Auswahl leeren', 'Clear selection')}</button>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        ${
          count
            ? selectedRows
                .map(
                  (row) => `
                    <span class="inline-flex items-center gap-2 rounded-full border border-[#44403c] bg-[#1c1917] px-3 py-1.5 text-xs text-[#a8a29e]">
                      <span class="font-semibold">${escapeHtml(compactValue(row.name, t('Unbekannt', 'Unknown')))}</span>
                      <span class="text-[#a8a29e]">${escapeHtml(compactValue(row.manufacturer, ''))}</span>
                      <button data-remove-compare="${escapeHtml(row.__rowId)}" class="rounded-full border border-[#44403c] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#84cc16] hover:bg-[#292524]">x</button>
                    </span>
                  `,
                )
                .join('')
            : `<p class="text-sm text-[#a8a29e]">${t(
                'Noch nichts ausgewaehlt. Nutze "Compare" in Card oder Tabelle.',
                'Nothing selected yet. Use "Compare" in cards or table.',
              )}</p>`
        }
      </div>

      ${state.compareNotice ? `<p class="mt-3 text-xs font-semibold text-[#84cc16]">${escapeHtml(state.compareNotice)}</p>` : ''}
    </section>
  `;
};

const render = () => {
  const queryFocusState = captureQueryFocusState();
  const filterOptions = getFilterOptions();
  const filtered = sortRows(state.rows.filter(matchesFilters));
  const withPrice = filtered.filter((row) => parsePrice(row.price_usd)).length;
  const withShop = filtered.filter((row) => getShopInfo(row).url).length;
  const activeCount = filtered.filter((row) => isLikelyActive(row)).length;
  const eolCount = filtered.filter((row) => isEol(row)).length;
  const retrievedAt = compactValue(filtered[0]?.dataset_retrieved_at || state.rows[0]?.dataset_retrieved_at, '');
  const languageToggleLabel =
    state.language === 'de'
      ? t('Sprache wechseln: Englisch', 'Switch language: English')
      : t('Sprache wechseln: Deutsch', 'Switch language: German');
  const languageToggleIcon =
    state.language === 'de'
      ? `<svg class="flag-icon" viewBox="0 0 24 16" fill="none" aria-hidden="true">
          <rect x="0.75" y="0.75" width="22.5" height="14.5" rx="2.5" fill="#111827" stroke="rgba(255,255,255,0.35)" />
          <rect x="2.2" y="2.2" width="19.6" height="3.9" fill="#1f1f1f" />
          <rect x="2.2" y="6.1" width="19.6" height="3.9" fill="#c81e1e" />
          <rect x="2.2" y="10" width="19.6" height="3.9" fill="#facc15" />
        </svg>`
      : `<svg class="flag-icon" viewBox="0 0 24 16" fill="none" aria-hidden="true">
          <rect x="0.75" y="0.75" width="22.5" height="14.5" rx="2.5" fill="#ffffff" stroke="rgba(255,255,255,0.35)" />
          <rect x="2.2" y="2.2" width="19.6" height="1.45" fill="#be123c" />
          <rect x="2.2" y="4.35" width="19.6" height="1.45" fill="#be123c" />
          <rect x="2.2" y="6.5" width="19.6" height="1.45" fill="#be123c" />
          <rect x="2.2" y="8.65" width="19.6" height="1.45" fill="#be123c" />
          <rect x="2.2" y="10.8" width="19.6" height="1.45" fill="#be123c" />
          <rect x="2.2" y="12.95" width="19.6" height="0.95" fill="#be123c" />
          <rect x="2.2" y="2.2" width="8.8" height="6.85" fill="#1d4ed8" />
        </svg>`;
  const themeToggleLabel =
    state.theme === 'light' ? t('Dunkelmodus aktivieren', 'Enable dark mode') : t('Hellmodus aktivieren', 'Enable light mode');
  const themeToggleIcon =
    state.theme === 'light'
      ? `<svg class="theme-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M21 12.79A9 9 0 1 1 11.21 3c0 .29 0 .57.01.86A7.5 7.5 0 0 0 18.75 11.36c.29 0 .57 0 .86-.01"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>`
      : `<svg class="theme-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4" stroke="currentColor" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>`;
  const selectedRows = getSelectedRows();
  applyLanguageToDocument();
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
  updateDocumentSeoSignals(filtered.length);
  syncUrlWithState();

  app.innerHTML = `
    <main class="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8">
      <header class="panel relative overflow-hidden p-5 sm:p-6">
        <div class="theme-hero-surface absolute inset-0 -z-10"></div>
        <div class="absolute right-4 top-4 flex items-center gap-2 sm:right-5 sm:top-5">
          <button
            id="toggle-language"
            type="button"
            class="theme-icon-btn"
            aria-label="${escapeHtml(languageToggleLabel)}"
            title="${escapeHtml(languageToggleLabel)}"
          >
            ${languageToggleIcon}
          </button>
          <button
            id="theme-toggle"
            type="button"
            class="theme-icon-btn"
            aria-label="${escapeHtml(themeToggleLabel)}"
            title="${escapeHtml(themeToggleLabel)}"
          >
            ${themeToggleIcon}
          </button>
        </div>
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-lime-500">AR / XR DIRECTORY</p>
        <h1 class="mt-2 text-3xl font-bold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-lime-400 to-lime-600 sm:text-4xl">${t(
          'Vergleich fuer AR-Brillen und XR-Glasses',
          'Comparison for AR Glasses and XR Glasses',
        )}</h1>
        <p class="mt-3 max-w-4xl text-sm text-[#a8a29e] sm:text-base">
          ${t(
            'Karten- und Tabellenansicht fuer aktuelle und historische Brillen mit Spezifikationen, Preisen, Lifecycle, EOL und Shop-Links.',
            'Cards and table view for current and historical glasses with specifications, pricing, lifecycle, EOL and shop links.',
          )}
        </p>
      </header>

      ${!state.focusMode || selectedRows.length ? compareBarTemplate(selectedRows) : ''}

      <section class="panel mt-4 p-4 sm:p-5">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 class="text-lg font-semibold text-[#f5f5f4]">${t('Filter', 'Filters')}</h2>
            <p class="mt-1 text-xs text-[#a8a29e]">${state.focusMode
              ? t('Fokusansicht: nur Kernfilter sichtbar.', 'Focus view: only core filters visible.')
              : t('Schnellfilter fuer Suche, Kategorie und Sortierung.', 'Quick filters for search, category and sorting.')}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2 xl:justify-end">
            <button id="view-cards" class="chip-btn ${
              state.viewMode === 'cards'
                ? 'border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
                : 'border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]'
            }">${t('Karten', 'Cards')}</button>
            <button id="view-table" class="chip-btn ${
              state.viewMode === 'table'
                ? 'border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
                : 'border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]'
            }">${t('Tabelle', 'Table')}</button>
            <button id="toggle-focus-mode" class="chip-btn ${
              state.focusMode
                ? 'border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
                : 'border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]'
            }">${state.focusMode ? t('Standardansicht', 'Standard view') : t('Fokusansicht', 'Focus view')}</button>
            <button id="clear-filters" class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">${t(
              'Filter zuruecksetzen',
              'Reset filters',
            )}</button>
            ${
              state.focusMode
                ? ''
                : `<button id="toggle-advanced-filters" class="chip-btn ${
                    state.showAdvancedFilters
                      ? 'border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
                      : 'border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]'
                  }">${state.showAdvancedFilters ? t('Weniger Filter', 'Fewer filters') : t('Mehr Filter', 'More filters')}</button>`
            }
          </div>
        </div>

        <div class="mt-4 grid gap-3 md:grid-cols-2 ${state.focusMode ? 'xl:grid-cols-4' : 'xl:grid-cols-5'}">
          <label class="space-y-1 xl:col-span-2">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Suche', 'Search')}</span>
            <input id="query-input" type="search" class="field" placeholder="${t(
              'Modell, Hersteller, Software, Tracking, Lifecycle',
              'Model, manufacturer, software, tracking, lifecycle',
            )}" value="${escapeHtml(state.query)}" />
          </label>

          <label class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Kategorie', 'Category')}</span>
            <select id="category-filter" class="field">
              <option value="all"${state.category === 'all' ? ' selected' : ''}>${t('Alle Kategorien', 'All categories')}</option>
              <option value="AR"${state.category === 'AR' ? ' selected' : ''}>AR</option>
              <option value="XR"${state.category === 'XR' ? ' selected' : ''}>XR</option>
            </select>
          </label>

          ${
            state.focusMode
              ? ''
              : `<label class="space-y-1">
                  <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Hersteller', 'Manufacturer')}</span>
                  <select id="manufacturer-filter" class="field">
                    ${optionList(filterOptions.manufacturers, state.manufacturer, t('Alle Hersteller', 'All manufacturers'))}
                  </select>
                </label>`
          }

          <label class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Sortierung', 'Sorting')}</span>
            <select id="sort-filter" class="field">
              <option value="priority_default"${
                state.sort === 'priority_default' ? ' selected' : ''
              }>${t('Priorität (Neueste, EOL unten)', 'Priority (newest first, EOL last)')}</option>
              <option value="name_asc"${state.sort === 'name_asc' ? ' selected' : ''}>${t('Name A-Z', 'Name A-Z')}</option>
              <option value="manufacturer_asc"${state.sort === 'manufacturer_asc' ? ' selected' : ''}>${t(
                'Hersteller A-Z',
                'Manufacturer A-Z',
              )}</option>
              <option value="release_desc"${state.sort === 'release_desc' ? ' selected' : ''}>${t('Neueste zuerst', 'Newest first')}</option>
              <option value="price_desc"${state.sort === 'price_desc' ? ' selected' : ''}>${t('Preis absteigend', 'Price descending')}</option>
              <option value="price_asc"${state.sort === 'price_asc' ? ' selected' : ''}>${t('Preis aufsteigend', 'Price ascending')}</option>
              <option value="fov_desc"${state.sort === 'fov_desc' ? ' selected' : ''}>${t(
                'FOV horizontal absteigend',
                'FOV horizontal descending',
              )}</option>
            </select>
          </label>
        </div>

        <div id="advanced-filters-region" class="mt-4 space-y-3 ${state.showAdvancedFilters && !state.focusMode ? '' : 'hidden'}">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Erweiterte Filter', 'Advanced filters')}</p>
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Display-Typ', 'Display type')}</span>
              <select id="display-filter" class="field">
                ${optionList(filterOptions.displayTypes, state.displayType, t('Alle Display-Arten', 'All display types'))}
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Optik', 'Optics')}</span>
              <select id="optics-filter" class="field">
                ${optionList(filterOptions.optics, state.optics, t('Alle Optik-Typen', 'All optics types'))}
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Tracking', 'Tracking')}</span>
              <select id="tracking-filter" class="field">
                ${optionList(filterOptions.tracking, state.tracking, t('Alle Tracking-Typen', 'All tracking types'))}
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Eye Tracking</span>
              <select id="eye-tracking-filter" class="field">
                ${optionList(filterOptions.eyeTracking, state.eyeTracking, t('Alle Eye-Tracking-Werte', 'All eye-tracking values'))}
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Hand Tracking</span>
              <select id="hand-tracking-filter" class="field">
                ${optionList(filterOptions.handTracking, state.handTracking, t('Alle Hand-Tracking-Werte', 'All hand-tracking values'))}
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Passthrough</span>
              <select id="passthrough-filter" class="field">
                ${optionList(filterOptions.passthrough, state.passthrough, t('Alle Passthrough-Werte', 'All passthrough values'))}
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Aktiver Vertrieb', 'Active distribution')}</span>
              <select id="active-filter" class="field">
                ${optionList(filterOptions.activeStatuses, state.active, t('Alle Vertrieb-Status', 'All distribution statuses'))}
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('EOL / Update-Status', 'EOL / update status')}</span>
              <select id="eol-filter" class="field">
                ${optionList(filterOptions.eolStatuses, state.eol, t('Alle Lifecycle-Status', 'All lifecycle statuses'))}
              </select>
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Min. FOV horizontal (deg)', 'Min. horizontal FOV (deg)')}</span>
              <input id="fov-filter" type="number" min="0" step="1" class="field" value="${escapeHtml(state.minFov)}" placeholder="${t('z. B. 40', 'e.g. 40')}" />
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Min. Refresh (Hz)', 'Min. refresh (Hz)')}</span>
              <input id="refresh-filter" type="number" min="0" step="1" class="field" value="${escapeHtml(state.minRefresh)}" placeholder="${t('z. B. 60', 'e.g. 60')}" />
            </label>

            <label class="space-y-1">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Max. Preis (USD)', 'Max. price (USD)')}</span>
              <input id="price-filter" type="number" min="0" step="1" class="field" value="${escapeHtml(state.maxPrice)}" placeholder="${t('z. B. 1500', 'e.g. 1500')}" />
            </label>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="only-price" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.onlyPrice ? 'checked' : ''} />
              ${t('Nur mit Preis', 'Only with price')}
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="only-shop" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.onlyShop ? 'checked' : ''} />
              ${t('Nur mit Shop-Link', 'Only with shop link')}
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="only-available" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.onlyAvailable ? 'checked' : ''} />
              ${t('Nur aktiv im Vertrieb', 'Only actively distributed')}
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
              ${t('EUR-Zusatz', 'EUR addition')}
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="hide-unknown" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.hideUnknown ? 'checked' : ''} />
              ${t('Unbekannte Werte ausblenden', 'Hide unknown values')}
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
              ? `<p class="panel p-10 text-center text-sm text-[#a8a29e]">${t(
                  'Keine Treffer fuer die gewaehlten Filter.',
                  'No matches for the selected filters.',
                )}</p>`
              : state.viewMode === 'cards'
                ? `
                    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">${visibleCards.map(cardTemplate).join('')}</div>
                    <div class="mt-4 flex flex-wrap items-center gap-2">
                      <p class="text-sm text-[#a8a29e]">${t(
                        `${visibleCards.length} von ${filtered.length} Modellen angezeigt`,
                        `${visibleCards.length} of ${filtered.length} models shown`,
                      )}</p>
                      ${
                        hasMoreCards
                          ? `<button id="load-more-cards" class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">${t(
                              'Mehr laden',
                              'Load more',
                            )}</button>`
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
              <h2 class="text-lg font-semibold text-[#f5f5f4] sm:text-xl">${t(
                'AR/XR Brillen FAQ und Suchkontext',
                'AR/XR Glasses FAQ and search context',
              )}</h2>
              <p class="mt-2 text-sm text-[#a8a29e]">
                ${t(
                  'Diese Vergleichsseite deckt aktuelle und historische AR- und XR-Brillen inklusive Shop-Links, Preisstatus, FOV, Refresh, Tracking, Software sowie Updates/EOL ab.',
                  'This comparison page covers current and historical AR and XR glasses including shop links, pricing status, FOV, refresh, tracking, software and updates/EOL.',
                )}
              </p>
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <article class="soft-panel p-3">
                  <h3 class="text-sm font-semibold text-[#f5f5f4]">${t('Welche Modelle sind enthalten?', 'Which models are included?')}</h3>
                  <p class="mt-1 text-sm text-[#a8a29e]">
                    ${t(
                      'Moderne AR/XR-Modelle plus Legacy-Geraete wie HoloLens 1, Epson Moverio, Sony SmartEyeglass und weitere.',
                      'Modern AR/XR models plus legacy devices such as HoloLens 1, Epson Moverio, Sony SmartEyeglass and others.',
                    )}
                  </p>
                </article>
                <article class="soft-panel p-3">
                  <h3 class="text-sm font-semibold text-[#f5f5f4]">${t('Welche Daten kann ich filtern?', 'Which data can I filter?')}</h3>
                  <p class="mt-1 text-sm text-[#a8a29e]">
                    ${t(
                      'Kategorie (AR/XR), Hersteller, Display, Optik, Tracking, Eye/Hand, Passthrough, FOV, Refresh, Preis, Vertriebsstatus und EOL.',
                      'Category (AR/XR), manufacturer, display, optics, tracking, eye/hand, passthrough, FOV, refresh, price, distribution status and EOL.',
                    )}
                  </p>
                </article>
                <article class="soft-panel p-3">
                  <h3 class="text-sm font-semibold text-[#f5f5f4]">${t('Gibt es exportierbare Daten?', 'Is data export available?')}</h3>
                  <p class="mt-1 text-sm text-[#a8a29e]">
                    ${t(
                      'Ja, die gefilterten Ergebnisse lassen sich direkt als CSV exportieren. Der komplette Datensatz ist auch unter',
                      'Yes, filtered results can be exported directly as CSV. The full dataset is also available at',
                    )} <code>/data/ar_glasses.csv</code>.
                  </p>
                </article>
                <article class="soft-panel p-3">
                  <h3 class="text-sm font-semibold text-[#f5f5f4]">${t('Wie aktuell sind die Infos?', 'How current is the information?')}</h3>
                  <p class="mt-1 text-sm text-[#a8a29e]">
                    ${t(
                      'Quelle sind kuratierte Datensaetze plus manuelle Legacy-Ergaenzungen. Zu jedem Modell gibt es Lifecycle-/EOL-Kontext und Datenquellen-Links.',
                      'Sources are curated datasets plus manual legacy additions. Each model includes lifecycle/EOL context and source links.',
                    )}
                  </p>
                </article>
              </div>
            </section>`
      }

      <section class="mt-4">
        <div class="panel p-4 sm:p-5">
          <h2 class="text-sm font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Statistik', 'Statistics')}</h2>
          <div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <p class="soft-panel p-3 text-sm text-[#a8a29e]">
              ${t('Datenbestand', 'Dataset size')}: <strong class="text-[#f5f5f4]">${state.rows.length}</strong>
            </p>
            <p class="soft-panel p-3 text-sm text-[#a8a29e]">
              ${t('Sichtbare Modelle', 'Visible models')}: <strong class="text-[#f5f5f4]">${filtered.length}</strong>
            </p>
            <p class="soft-panel p-3 text-sm text-[#a8a29e]">
              ${t('Shop-Links', 'Shop links')}: <strong class="text-[#f5f5f4]">${withShop}</strong> /
              <strong class="text-[#f5f5f4]">${withPrice}</strong> ${t('mit Preis', 'with price')}
            </p>
            <p class="soft-panel p-3 text-sm text-[#a8a29e]">
              ${t('Aktiv', 'Active')}: <strong class="text-[#f5f5f4]">${activeCount}</strong> /
              EOL: <strong class="text-[#f5f5f4]">${eolCount}</strong>
            </p>
            <p class="soft-panel p-3 text-sm text-[#a8a29e]">
              ${t('Datenstand', 'Data updated')}: <strong class="text-[#f5f5f4]">${escapeHtml(
                retrievedAt ? formatDate(retrievedAt) : t('k. A.', 'n/a'),
              )}</strong>
            </p>
          </div>
        </div>
      </section>

      <footer class="mt-4">
        <div class="panel p-4 text-sm text-[#a8a29e]">
          <a href="https://huskynarr.de/impressum" class="font-semibold text-[#84cc16] hover:underline">${t(
            'Impressum / Legal Notice',
            'Legal Notice / Impressum',
          )}</a>
        </div>
      </footer>
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
  document.querySelector('#toggle-language')?.addEventListener('click', () => {
    state.language = state.language === 'de' ? 'en' : 'de';
    writeLanguageToStorage(state.language);
    render();
  });
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
            state.compareNotice = t(
              `Maximal ${COMPARE_LIMIT} Modelle gleichzeitig im Vergleich.`,
              `Maximum ${COMPARE_LIMIT} models in compare at the same time.`,
            );
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

  restoreQueryFocusState(queryFocusState);
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
  state.language = readLanguageFromStorage();
  state.theme = readThemeFromStorage();
  applyStateFromUrl();
  state.language = normalizeLanguage(state.language, 'de');
  state.theme = normalizeTheme(state.theme, 'dark');
  writeLanguageToStorage(state.language);
  writeThemeToStorage(state.theme);
  applyLanguageToDocument();
  applyThemeToDocument();
  setFallbackUsdRate();
  app.innerHTML = `<main class="mx-auto max-w-[1320px] px-4 py-8"><p class="panel p-6 text-sm text-[#a8a29e]">${t(
    'Lade Brillendaten...',
    'Loading glasses data...',
  )}</p></main>`;

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
    const message = error instanceof Error ? error.message : t('Unbekannter Fehler', 'Unknown error');
    app.innerHTML = `
      <main class="mx-auto max-w-[1320px] px-4 py-8">
        <p class="panel border-red-700/60 bg-red-950/40 p-6 text-sm font-semibold text-red-200">${t(
          'Daten konnten nicht geladen werden.',
          'Data could not be loaded.',
        )}</p>
        <p class="mt-3 text-sm text-[#a8a29e]">${escapeHtml(message)}</p>
      </main>
    `;
  }
};

init();
