import {
  normalizeText,
  parseBooleanParam,
} from './utils.js';
import { COMPARE_SEPARATOR } from './data/paths.js';

export const COMPARE_LIMIT = 6;
export const CARDS_PER_PAGE = 12;
export const USD_TO_EUR_FALLBACK = 0.92;
export const RATE_SOURCE_URL = 'https://api.frankfurter.dev/v2/rate/USD/EUR';
export const VIEW_MODES = new Set(['cards', 'table']);
export const LANGUAGE_MODES = new Set(['de', 'en']);
export const SORT_MODES = new Set([
  'priority_default',
  'name_asc',
  'manufacturer_asc',
  'release_desc',
  'price_desc',
  'price_asc',
  'fov_desc',
  'weight_asc',
  'refresh_desc',
]);
export const THEME_MODES = new Set(['dark', 'light']);
export const THEME_STORAGE_KEY = 'ar_directory_theme';
export const LANGUAGE_STORAGE_KEY = 'ar_directory_language';
export const FAVORITES_STORAGE_KEY = 'ar_directory_favorites';
export const APP_VERSION = '0.7.0';
export const RADAR_COLORS = ['#84cc16', '#2f6fb5', '#2d8f60', '#9b3db6', '#b1731f', '#a73452'];

export const LIFECYCLE_NOTE_SUPPRESS_MARKERS = ['keine eindeutige eol-angabe', 'no clear eol', 'no explicit eol'];

export const state = {
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
  software: 'all',
  computeUnit: 'all',
  minFov: '',
  minRefresh: '',
  maxPrice: '',
  maxWeight: '',
  minResolutionWidth: '',
  onlyPrice: false,
  onlyShop: false,
  onlyAvailable: false,
  onlyWithImage: false,
  onlyFavorites: false,
  favorites: [],
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

export const normalizeTheme = (value, fallback = 'dark') => {
  const normalized = normalizeText(value);
  return THEME_MODES.has(normalized) ? normalized : fallback;
};

export const normalizeLanguage = (value, fallback = 'de') => {
  const normalized = normalizeText(value);
  return LANGUAGE_MODES.has(normalized) ? normalized : fallback;
};

export const getSystemThemePreference = () => {
  if (typeof window === 'undefined') return 'dark';
  try {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  } catch {}
  return 'dark';
};

export const readThemeFromStorage = () => {
  if (typeof window === 'undefined') {
    return 'dark';
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored) return normalizeTheme(stored, 'dark');
    return getSystemThemePreference();
  } catch {
    return getSystemThemePreference();
  }
};

export const readLanguageFromStorage = () => {
  if (typeof window === 'undefined') {
    return 'de';
  }
  try {
    return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY), 'de');
  } catch {
    return 'de';
  }
};

export const writeThemeToStorage = (theme) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalizeTheme(theme, 'dark'));
  } catch {
    // ignore storage failures (private mode / blocked storage)
  }
};

export const writeLanguageToStorage = (language) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizeLanguage(language, 'de'));
  } catch {
    // ignore storage failures
  }
};

export const readFavoritesFromStorage = () => {
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

export const writeFavoritesToStorage = (favorites) => {
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  } catch {}
};

export const toggleFavorite = (rowId) => {
  if (state.favorites.includes(rowId)) {
    state.favorites = state.favorites.filter((id) => id !== rowId);
  } else {
    state.favorites = [...state.favorites, rowId];
  }
  writeFavoritesToStorage(state.favorites);
};

export const applyThemeToDocument = () => {
  if (typeof document === 'undefined' || !document.body) {
    return;
  }
  const theme = normalizeTheme(state.theme, 'dark');
  state.theme = theme;
  document.body.classList.toggle('theme-dark', theme === 'dark');
  document.body.classList.toggle('theme-light', theme === 'light');
};

export const applyLanguageToDocument = () => {
  if (typeof document === 'undefined') {
    return;
  }
  const language = normalizeLanguage(state.language, 'de');
  state.language = language;
  document.documentElement.lang = language;
};

const parseSelectedIdsParam = (value) =>
  [...new Set(String(value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean))].slice(0, COMPARE_LIMIT);

const parseCardsPage = (value, fallback = 1) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const setFallbackUsdRate = () => {
  state.usdToEurRate = USD_TO_EUR_FALLBACK;
  state.usdToEurFetchedAt = new Date().toISOString();
  state.usdToEurSource = `fallback:${USD_TO_EUR_FALLBACK}`;
};

export const pruneSelectedIdsToKnownRows = () => {
  const known = new Set(state.rows.map((row) => row.__rowId));
  state.selectedIds = [...new Set(state.selectedIds)].filter((id) => known.has(id)).slice(0, COMPARE_LIMIT);
  if (!state.selectedIds.length) {
    state.compareMode = false;
  }
};

export const applyStateFromUrl = () => {
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

  const softwareParam = params.get('software');
  if (softwareParam !== null) {
    state.software = softwareParam.trim() || 'all';
  }

  const computeUnit = params.get('computeUnit');
  if (computeUnit !== null) {
    state.computeUnit = computeUnit.trim() || 'all';
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

  const maxWeight = params.get('maxWeight');
  if (maxWeight !== null) {
    state.maxWeight = maxWeight.trim();
  }

  const minResWidth = params.get('minRes');
  if (minResWidth !== null) {
    state.minResolutionWidth = minResWidth.trim();
  }

  state.onlyPrice = parseBooleanParam(params.get('onlyPrice'), false);
  state.onlyShop = parseBooleanParam(params.get('onlyShop'), false);
  state.onlyAvailable = parseBooleanParam(params.get('onlyAvailable'), false);
  state.onlyWithImage = parseBooleanParam(params.get('onlyImage'), false);
  state.onlyFavorites = parseBooleanParam(params.get('onlyFav'), false);
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

export const syncUrlWithState = () => {
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
  // Compare view gets a pretty path (/compare/<a>-vs-<b>); otherwise selections
  // ride along as query params so they survive on the root view.
  const compareFlats =
    state.compareMode && state.selectedIds.length
      ? state.selectedIds.map((id) => state.rows.find((row) => row.__rowId === id)?.__flat).filter(Boolean)
      : [];
  const comparePath = compareFlats.length ? `/compare/${compareFlats.join(COMPARE_SEPARATOR)}` : '';
  if (!comparePath) {
    setBoolean('compareMode', state.compareMode, false);
    if (state.selectedIds.length) {
      params.set('selectedIds', state.selectedIds.join(','));
    }
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
  setSelect('software', state.software);
  setSelect('computeUnit', state.computeUnit);

  setText('minFov', state.minFov, '');
  setText('minRefresh', state.minRefresh, '');
  setText('maxPrice', state.maxPrice, '');
  setText('maxWeight', state.maxWeight, '');
  setText('minRes', state.minResolutionWidth, '');

  setBoolean('onlyPrice', state.onlyPrice, false);
  setBoolean('onlyShop', state.onlyShop, false);
  setBoolean('onlyAvailable', state.onlyAvailable, false);
  setBoolean('onlyImage', state.onlyWithImage, false);
  setBoolean('onlyFav', state.onlyFavorites, false);
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
  const nextPath = comparePath || '/';
  const nextUrl = `${nextPath}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    history.replaceState(null, '', nextUrl);
  }
};
