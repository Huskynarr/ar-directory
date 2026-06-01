import { toNumber, parsePrice, normalizeText, isUnknownValue } from './utils.js';
import { state, USD_TO_EUR_FALLBACK, LIFECYCLE_NOTE_SUPPRESS_MARKERS } from './state.js';

const isEnglish = () => state.language === 'en';
export const t = (de, en) => (isEnglish() ? en : de);
export const locale = () => (isEnglish() ? 'en-US' : 'de-DE');

export const formatCurrency = (amount, currency) =>
  new Intl.NumberFormat(locale(), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

export const formatPrice = (value) => {
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

export const formatDate = (value) => {
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

export const formatNumber = (value, suffix = '') => {
  const numeric = toNumber(value);
  if (numeric === null) {
    return t('k. A.', 'n/a');
  }
  return `${new Intl.NumberFormat(locale(), {
    maximumFractionDigits: 1,
  }).format(numeric)}${suffix}`;
};

const formatRateSourceLabel = () =>
  state.usdToEurSource.startsWith('fallback:') ? `${t('Fallback', 'Fallback')} ${USD_TO_EUR_FALLBACK}` : 'Frankfurter API';

const formatSafeDateLabel = (value) => {
  return formatDate(value);
};

export const formatRateHint = () => {
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

export const compactValue = (value, fallback = t('k. A.', 'n/a')) => {
  const text = String(value ?? '').trim();
  return text ? text : fallback;
};

export const maybeHiddenText = (value, fallback = t('k. A.', 'n/a')) => {
  if (state.hideUnknown && isUnknownValue(value)) {
    return '';
  }
  return compactValue(value, fallback);
};

const shouldSuppressLifecycleNote = (value) => {
  const text = normalizeText(value);
  if (!text) {
    return false;
  }
  return LIFECYCLE_NOTE_SUPPRESS_MARKERS.some((marker) => text.includes(marker));
};

export const formatLifecycleNotes = (value, fallback = t('Keine Angaben.', 'No details.')) => {
  if (shouldSuppressLifecycleNote(value)) {
    return '';
  }
  return maybeHiddenText(value, fallback);
};
