import { state } from './state.js';
import { t } from './i18n.js';

export const updateDocumentSeoSignals = (visibleCount) => {
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
        'Vergleichsseite fuer AR- und XR-Brillen mit Spezifikationen, Preisen, Shop-Links, aktivem Vertrieb, Software, Updates und EOL-Status.',
        'Comparison page for AR and XR glasses with specifications, pricing, shop links, active distribution, software, updates and EOL status.',
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

  const keywordsTag = document.querySelector('meta[name="keywords"]');
  if (keywordsTag) {
    const baseKeywords = 'AR Brillen Vergleich, XR Brillen Vergleich, Smart Glasses, FOV, Refresh Rate, Preisvergleich, EOL, Shop Links';
    const queryExtra = queryLabel ? `, ${queryLabel}` : '';
    keywordsTag.setAttribute('content', `${baseKeywords}${queryExtra}`);
  }
};

export const captureQueryFocusState = () => {
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

export const restoreQueryFocusState = (focusState) => {
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
