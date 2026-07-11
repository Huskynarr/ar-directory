import './style.css';
import { escapeHtml, normalizeText, parsePrice, debounce } from './utils.js';
import {
  state,
  COMPARE_LIMIT,
  APP_VERSION,
  normalizeLanguage,
  normalizeTheme,
  readThemeFromStorage,
  readLanguageFromStorage,
  writeThemeToStorage,
  writeLanguageToStorage,
  readFavoritesFromStorage,
  toggleFavorite,
  applyThemeToDocument,
  getSystemThemePreference,
  applyLanguageToDocument,
  setFallbackUsdRate,
  pruneSelectedIdsToKnownRows,
  applyStateFromUrl,
  syncUrlWithState,
} from './state.js';
import { t, formatCurrency, formatDate, formatRateHint, compactValue } from './i18n.js';
import { getRowId, getShopInfo, isEol, isLikelyActive, isArRow, isXrRow } from './data/model.js';
import { assignDevicePaths, COMPARE_SEPARATOR } from './data/paths.js';
import { getFilterOptions, matchesFilters, sortRows, getSelectedRows } from './data/filters.js';
import { parseCsv, fetchUsdToEurRate } from './data/dataset.js';
import { AFFILIATE, setAffiliateOverrides } from './affiliate.js';
import { optionList } from './render/shared.js';
import { cardTemplate } from './render/cards.js';
import { tableTemplate } from './render/table.js';
import { compareModeTemplate, compareBarTemplate } from './render/compare.js';
import { openDetailModal } from './render/modal.js';
import { isFinderRoute, renderFinder } from './render/finder.js';
import { setRenderFn } from './render/registry.js';
import { buildStatsChartSvg } from './render/stats.js';
import { exportFilteredCsv, copyShareUrl } from './actions.js';
import { updateDocumentSeoSignals, captureQueryFocusState, restoreQueryFocusState } from './seo.js';

const app = document.querySelector('#app');
// Injected by Vite at build time (Europe/Berlin). Empty in non-built contexts.
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

// Windowed page list with ellipsis, e.g. [1, '…', 4, 5, 6, '…', 18].
const buildPageList = (current, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const wanted = [1, total, current, current - 1, current + 1].filter((p) => p >= 1 && p <= total);
  const sorted = [...new Set(wanted)].sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
};

const paginationTemplate = (current, total, shownCount, totalCount) => {
  const countLabel = `<p class="text-sm text-[#a8a29e]">${t(
    `Seite ${current} von ${total} · ${shownCount} von ${totalCount} Modellen`,
    `Page ${current} of ${total} · ${shownCount} of ${totalCount} models`,
  )}</p>`;
  if (total <= 1) {
    return `<div class="mt-6 flex justify-center">${countLabel}</div>`;
  }
  const baseBtn =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition';
  const idle = 'border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]';
  const activeCls = 'border-[#84cc16] bg-[#84cc16] text-[#0c0a09]';
  const disabledCls = 'border-[#44403c] bg-[#1c1917]/50 text-[#57534e] cursor-not-allowed';
  const numbers = buildPageList(current, total)
    .map((p) =>
      p === '…'
        ? '<span class="inline-flex h-9 min-w-9 items-center justify-center px-1 text-sm text-[#a8a29e]" aria-hidden="true">…</span>'
        : `<button type="button" data-page="${p}" aria-label="${t(`Seite ${p}`, `Page ${p}`)}"${
            p === current ? ' aria-current="page"' : ''
          } class="${baseBtn} ${p === current ? activeCls : idle}">${p}</button>`,
    )
    .join('');
  return `
    <nav class="mt-6 flex flex-col items-center gap-3" aria-label="${t('Seitennavigation', 'Pagination')}">
      <div class="flex flex-wrap items-center justify-center gap-1.5">
        <button type="button" data-page-prev${current <= 1 ? ' disabled' : ''} class="${baseBtn} ${
          current <= 1 ? disabledCls : idle
        }">${t('Zurück', 'Prev')}</button>
        ${numbers}
        <button type="button" data-page-next${current >= total ? ' disabled' : ''} class="${baseBtn} ${
          current >= total ? disabledCls : idle
        }">${t('Weiter', 'Next')}</button>
      </div>
      ${countLabel}
    </nav>`;
};

const render = () => {
  const queryFocusState = captureQueryFocusState();
  const filterOptions = getFilterOptions();
  const filtered = sortRows(state.rows.filter(matchesFilters));
  const withPrice = filtered.filter((row) => parsePrice(row.price_usd)).length;
  const withShop = filtered.filter((row) => getShopInfo(row).url).length;
  const activeCount = filtered.filter((row) => isLikelyActive(row)).length;
  const eolCount = filtered.filter((row) => isEol(row)).length;
  const arCount = filtered.filter((row) => isArRow(row)).length;
  const xrCount = filtered.filter((row) => isXrRow(row)).length;
  const avgPrice = withPrice > 0 ? Math.round(filtered.reduce((sum, row) => sum + (parsePrice(row.price_usd) || 0), 0) / withPrice) : 0;
  const manufacturerCount = new Set(filtered.map((row) => normalizeText(row.manufacturer)).filter(Boolean)).size;
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
  const effectiveTheme = state.theme === 'auto' ? getSystemThemePreference() : state.theme;
  const themeToggleLabel = state.theme === 'auto'
    ? t(`Darstellung: Automatisch (${effectiveTheme === 'light' ? 'Hell' : 'Dunkel'}). Zu Hell wechseln`, `Theme: Auto (${effectiveTheme}). Switch to light`)
    : state.theme === 'light'
      ? t('Darstellung: Hell. Zu Dunkel wechseln', 'Theme: Light. Switch to dark')
      : t('Darstellung: Dunkel. Zu Automatisch wechseln', 'Theme: Dark. Switch to auto');
  const themeToggleIcon =
    state.theme === 'auto'
      ? `<svg class="theme-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor"/><path d="M8 21h8M12 17v4" stroke="currentColor" stroke-linecap="round"/></svg>`
      : state.theme === 'light'
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
  const visibleCards = filtered.slice(
    (state.cardsPage - 1) * state.cardsPageSize,
    state.cardsPage * state.cardsPageSize,
  );
  updateDocumentSeoSignals(filtered.length);
  syncUrlWithState();
  const resultsStatusLabel = t(
    `${filtered.length} Modelle nach den aktuellen Filtern sichtbar. Ansicht: ${state.compareMode ? 'Direktvergleich' : state.viewMode === 'cards' ? 'Karten' : 'Tabelle'}.`,
    `${filtered.length} models visible with current filters. View: ${state.compareMode ? 'direct comparison' : state.viewMode === 'cards' ? 'cards' : 'table'}.`,
  );

  app.innerHTML = `
    <a href="#main-content" class="skip-link">${t('Zum Inhalt springen', 'Skip to content')}</a>
    <main id="main-content" tabindex="-1" class="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8">
      <header class="panel relative overflow-hidden p-5 sm:p-6">
        <div class="theme-hero-surface absolute inset-0 -z-10"></div>
        <div class="flex items-start justify-between gap-3">
          <div class="brand-lockup">
            <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 28 28" fill="none"><path d="M3.5 14h5.2m10.6 0h5.2M8.7 10.5h4.2c1.1 0 2 .9 2 2v3c0 1.1-.9 2-2 2H8.7a2 2 0 0 1-2-2v-3c0-1.1.9-2 2-2Zm10.6 0h-4.2c-1.1 0-2 .9-2 2v3c0 1.1.9 2 2 2h4.2a2 2 0 0 0 2-2v-3c0-1.1-.9-2-2-2Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>
            <span><strong>AR DIRECTORY</strong><small>by Huskynarr</small></span>
          </div>
          <div class="flex shrink-0 items-center gap-2">
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
              data-theme-mode="${state.theme}"
              aria-label="${escapeHtml(themeToggleLabel)}"
              title="${escapeHtml(themeToggleLabel)}"
            >
              ${themeToggleIcon}
            </button>
          </div>
        </div>
        <h1 class="hero-title mt-5 text-3xl font-bold leading-tight sm:text-5xl">${t(
          'Vergleich für AR-Brillen und XR-Glasses',
          'Comparison for AR Glasses and XR Glasses',
        )}</h1>
        <p class="mt-2.5 max-w-3xl text-sm leading-relaxed text-[#a8a29e] sm:mt-3 sm:text-base">
          ${t(
            'Vergleichsseite für AR- und XR-Brillen mit Spezifikationen, Preisen, Lifecycle, EOL und Herstellerlinks. Legacy-Modelle sind für einen vollständigeren Datenbestand enthalten.',
            'Comparison page for AR and XR glasses with specifications, pricing, lifecycle, EOL and manufacturer links. Legacy models are included for a fuller dataset.',
          )}
        </p>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <a href="/finder/" data-nav class="finder-cta">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"/><path d="m14.8 9.2-1.6 4-4 1.6 1.6-4 4-1.6Z" fill="currentColor"/></svg>
            ${t('Finde meine Brille', 'Find my glasses')}
          </a>
          <span class="text-sm text-[#a8a29e]">${t(
            'Unsicher? Lass dich in 6 Fragen zum passenden Modell führen.',
            'Unsure? Let 6 questions guide you to the right model.',
          )}</span>
        </div>
      </header>
      <p id="results-status" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">${escapeHtml(resultsStatusLabel)}</p>

      ${!state.focusMode || selectedRows.length ? compareBarTemplate(selectedRows) : ''}

      <section class="panel mt-4 p-4 sm:p-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-[#f5f5f4]">${t('Filter', 'Filters')}</h2>
            <p class="mt-1 text-xs text-[#a8a29e]">${state.focusMode
              ? t('Fokusansicht: nur Kernfilter sichtbar.', 'Focus view: only core filters visible.')
              : t('Schnellfilter für Suche, Kategorie und Sortierung.', 'Quick filters for search, category and sorting.')}</p>
          </div>
          <div class="-mx-1 flex flex-wrap items-center gap-2 px-1 lg:justify-end">
            <button id="view-cards" type="button" aria-pressed="${state.viewMode === 'cards' ? 'true' : 'false'}" class="chip-btn ${
              state.viewMode === 'cards'
                ? 'border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
                : 'border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]'
            }">${t('Karten', 'Cards')}</button>
            <button id="view-table" type="button" aria-pressed="${state.viewMode === 'table' ? 'true' : 'false'}" class="chip-btn ${
              state.viewMode === 'table'
                ? 'border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
                : 'border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]'
            }">${t('Tabelle', 'Table')}</button>
            <button id="toggle-focus-mode" type="button" aria-pressed="${state.focusMode ? 'true' : 'false'}" class="chip-btn ${
              state.focusMode
                ? 'border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
                : 'border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]'
            }">${state.focusMode ? t('Standardansicht', 'Standard view') : t('Fokusansicht', 'Focus view')}</button>
            <button id="toggle-favorites-view" type="button" aria-pressed="${state.onlyFavorites ? 'true' : 'false'}" ${
              state.favorites.length ? '' : 'disabled'
            } aria-label="${escapeHtml(t('Nur Favoriten anzeigen', 'Show only favorites'))}" class="chip-btn ${
              state.onlyFavorites
                ? 'border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-ink)]'
                : `border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524] ${state.favorites.length ? '' : 'cursor-not-allowed opacity-50'}`
            }">${state.onlyFavorites ? '&#9733;' : '&#9734;'} ${t('Favoriten', 'Favorites')} (${state.favorites.length})</button>
            <button id="clear-filters" type="button" class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">${t(
              'Filter zurücksetzen',
              'Reset filters',
            )}</button>
            ${
              state.focusMode
                ? ''
                : `<button
                    id="toggle-advanced-filters"
                    type="button"
                    aria-pressed="${state.showAdvancedFilters ? 'true' : 'false'}"
                    aria-expanded="${state.showAdvancedFilters ? 'true' : 'false'}"
                    aria-controls="advanced-filters-region"
                    class="chip-btn ${
                    state.showAdvancedFilters
                      ? 'border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
                      : 'border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]'
                  }"
                  >${state.showAdvancedFilters ? t('Weniger Filter', 'Fewer filters') : t('Mehr Filter', 'More filters')}</button>`
            }
          </div>
        </div>

        <div class="mt-4 grid gap-3 sm:gap-3 md:grid-cols-2 ${state.focusMode ? 'xl:grid-cols-4' : 'xl:grid-cols-5'}">
          <label class="space-y-1.5 md:col-span-2 xl:col-span-2">
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Suche', 'Search')}</span>
            <input id="query-input" type="search" class="field" placeholder="${t(
              'Modell, Hersteller, Software, Tracking, Lifecycle',
              'Model, manufacturer, software, tracking, lifecycle',
            )}" value="${escapeHtml(state.query)}" />
          </label>

          <label class="space-y-1.5">
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Kategorie', 'Category')}</span>
            <select id="category-filter" class="field">
              <option value="all"${state.category === 'all' ? ' selected' : ''}>${t('Alle Kategorien', 'All categories')}</option>
              <option value="AR"${state.category === 'AR' ? ' selected' : ''}>AR</option>
              <option value="XR"${state.category === 'XR' ? ' selected' : ''}>XR</option>
            </select>
          </label>

          ${
            state.focusMode
              ? ''
              : `<label class="space-y-1.5">
                  <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Hersteller', 'Manufacturer')}</span>
                  <select id="manufacturer-filter" class="field">
                    ${optionList(filterOptions.manufacturers, state.manufacturer, t('Alle Hersteller', 'All manufacturers'))}
                  </select>
                </label>`
          }

          <label class="space-y-1.5">
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Sortierung', 'Sorting')}</span>
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
              <option value="weight_asc"${state.sort === 'weight_asc' ? ' selected' : ''}>${t(
                'Gewicht aufsteigend',
                'Weight ascending',
              )}</option>
              <option value="refresh_desc"${state.sort === 'refresh_desc' ? ' selected' : ''}>${t(
                'Refresh absteigend',
                'Refresh descending',
              )}</option>
            </select>
          </label>
        </div>

        <div
          id="advanced-filters-region"
          role="region"
          aria-label="${t('Erweiterte Filter', 'Advanced filters')}"
          aria-hidden="${state.showAdvancedFilters && !state.focusMode ? 'false' : 'true'}"
          class="mt-4 space-y-4 border-t border-[#44403c]/70 pt-4 ${state.showAdvancedFilters && !state.focusMode ? '' : 'hidden'}"
        >
          <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a8a29e]">${t('Erweiterte Filter', 'Advanced filters')}</p>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Display-Typ', 'Display type')}</span>
              <select id="display-filter" class="field">
                ${optionList(filterOptions.displayTypes, state.displayType, t('Alle Display-Arten', 'All display types'))}
              </select>
            </label>

            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Optik', 'Optics')}</span>
              <select id="optics-filter" class="field">
                ${optionList(filterOptions.optics, state.optics, t('Alle Optik-Typen', 'All optics types'))}
              </select>
            </label>

            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Tracking', 'Tracking')}</span>
              <select id="tracking-filter" class="field">
                ${optionList(filterOptions.tracking, state.tracking, t('Alle Tracking-Typen', 'All tracking types'))}
              </select>
            </label>

            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Eye Tracking</span>
              <select id="eye-tracking-filter" class="field">
                ${optionList(filterOptions.eyeTracking, state.eyeTracking, t('Alle Eye-Tracking-Werte', 'All eye-tracking values'))}
              </select>
            </label>

            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Hand Tracking</span>
              <select id="hand-tracking-filter" class="field">
                ${optionList(filterOptions.handTracking, state.handTracking, t('Alle Hand-Tracking-Werte', 'All hand-tracking values'))}
              </select>
            </label>

            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">Passthrough</span>
              <select id="passthrough-filter" class="field">
                ${optionList(filterOptions.passthrough, state.passthrough, t('Alle Passthrough-Werte', 'All passthrough values'))}
              </select>
            </label>

            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Aktiver Vertrieb', 'Active distribution')}</span>
              <select id="active-filter" class="field">
                ${optionList(filterOptions.activeStatuses, state.active, t('Alle Vertrieb-Status', 'All distribution statuses'))}
              </select>
            </label>

            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('EOL / Update-Status', 'EOL / update status')}</span>
              <select id="eol-filter" class="field">
                ${optionList(filterOptions.eolStatuses, state.eol, t('Alle Lifecycle-Status', 'All lifecycle statuses'))}
              </select>
            </label>

            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Software', 'Software')}</span>
              <select id="software-filter" class="field">
                ${optionList(filterOptions.software, state.software, t('Alle Software', 'All software'))}
              </select>
            </label>

            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Compute Unit', 'Compute unit')}</span>
              <select id="compute-filter" class="field">
                ${optionList(filterOptions.computeUnits, state.computeUnit, t('Alle Compute-Typen', 'All compute types'))}
              </select>
            </label>

            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Min. FOV horizontal (deg)', 'Min. horizontal FOV (deg)')}</span>
              <input id="fov-filter" type="number" min="0" step="1" class="field" value="${escapeHtml(state.minFov)}" placeholder="${t('z. B. 40', 'e.g. 40')}" />
            </label>

            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Min. Refresh (Hz)', 'Min. refresh (Hz)')}</span>
              <input id="refresh-filter" type="number" min="0" step="1" class="field" value="${escapeHtml(state.minRefresh)}" placeholder="${t('z. B. 60', 'e.g. 60')}" />
            </label>

            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Max. Preis (USD)', 'Max. price (USD)')}</span>
              <input id="price-filter" type="number" min="0" step="1" class="field" value="${escapeHtml(state.maxPrice)}" placeholder="${t('z. B. 1500', 'e.g. 1500')}" />
            </label>

            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Max. Gewicht (g)', 'Max. weight (g)')}</span>
              <input id="weight-filter" type="number" min="0" step="1" class="field" value="${escapeHtml(state.maxWeight)}" placeholder="${t('z. B. 500', 'e.g. 500')}" />
            </label>

            <label class="space-y-1.5">
              <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Min. Auflösung (px Breite)', 'Min. resolution (px width)')}</span>
              <input id="resolution-filter" type="number" min="0" step="1" class="field" value="${escapeHtml(state.minResolutionWidth)}" placeholder="${t('z. B. 1440', 'e.g. 1440')}" />
            </label>
          </div>

          <p class="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a8a29e]">${t('Schnellumschalter', 'Quick toggles')}</p>
          <div class="flex flex-wrap items-center gap-2">
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="only-price" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.onlyPrice ? 'checked' : ''} />
              ${t('Nur mit Preis', 'Only with price')}
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="only-shop" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.onlyShop ? 'checked' : ''} />
              ${t('Nur mit Herstellerlink', 'Only with manufacturer link')}
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
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="only-image" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.onlyWithImage ? 'checked' : ''} />
              ${t('Nur mit Bild', 'Only with image')}
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524] ${state.favorites.length ? '' : 'opacity-50'}">
              <input id="only-favorites" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.onlyFavorites ? 'checked' : ''} ${state.favorites.length ? '' : 'disabled'} />
              ${t('Nur Favoriten', 'Only favorites')} (${state.favorites.length})
            </label>
          </div>
        </div>
        ${state.showEur ? `<p class="mt-2 text-xs text-[#a8a29e]">${escapeHtml(formatRateHint())}</p>` : ''}
      </section>

      <section class="mt-3 flex flex-wrap items-center gap-2">
        <span class="mr-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a8a29e]">${t('Aktionen', 'Actions')}</span>
        <button id="export-csv" type="button" class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]" ${filtered.length === 0 ? 'disabled' : ''}>${t(
          'CSV exportieren',
          'Export CSV',
        )} (${filtered.length})</button>
        <button id="share-url" type="button" class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">${t(
          'Link kopieren',
          'Copy link',
        )}</button>
      </section>

      <section id="results" class="mt-4 scroll-mt-4">
        ${
          state.compareMode
            ? compareModeTemplate(selectedRows)
            : filtered.length === 0
              ? `<div class="panel flex flex-col items-center gap-4 p-10 text-center sm:p-14">
                  <div class="grid h-16 w-16 place-items-center rounded-2xl border border-[#44403c] bg-[#1c1917] text-3xl text-[var(--brand)]">${
                    state.onlyFavorites ? '&#9734;' : '&#128269;'
                  }</div>
                  <div class="space-y-1">
                    <h3 class="text-lg font-semibold text-[#f5f5f4]">${
                      state.onlyFavorites ? t('Noch keine Favoriten', 'No favorites yet') : t('Keine Treffer', 'No matches')
                    }</h3>
                    <p class="mx-auto max-w-md text-sm text-[#a8a29e]">${
                      state.onlyFavorites
                        ? t(
                            'Markiere Modelle mit dem Stern, um sie hier zu sammeln.',
                            'Mark models with the star to collect them here.',
                          )
                        : t(
                            'Für die gewählten Filter gibt es keine Modelle. Passe die Filter an oder setze sie zurück.',
                            'No models match the selected filters. Adjust them or reset.',
                          )
                    }</p>
                  </div>
                  ${
                    state.onlyFavorites
                      ? `<button id="empty-favorites-off" type="button" class="chip-btn border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]">${t('Alle Modelle anzeigen', 'Show all models')}</button>`
                      : `<button id="empty-reset" type="button" class="chip-btn border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]">${t('Filter zurücksetzen', 'Reset filters')}</button>`
                  }
                </div>`
              : state.viewMode === 'cards'
                ? `
                    <div class="grid gap-5 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">${visibleCards.map(cardTemplate).join('')}</div>
                    ${paginationTemplate(state.cardsPage, maxPage, visibleCards.length, filtered.length)}
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
                  'Diese Vergleichsseite fokussiert AR- und XR-Brillen mit Herstellerlinks, Preisstatus, FOV, Refresh, Tracking, Software sowie Updates/EOL. Legacy-Modelle sind zur Vervollständigung des Datenbestands enthalten.',
                  'This comparison page focuses on AR and XR glasses with manufacturer links, pricing status, FOV, refresh, tracking, software and updates/EOL. Legacy models are included to complete the dataset.',
                )}
              </p>
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <article class="soft-panel p-3">
                  <h3 class="text-sm font-semibold text-[#f5f5f4]">${t('Welche Modelle sind enthalten?', 'Which models are included?')}</h3>
                  <p class="mt-1 text-sm text-[#a8a29e]">
                    ${t(
                      'Moderne AR/XR-Modelle plus Legacy-Geräte wie HoloLens 1, Epson Moverio, Sony SmartEyeglass und weitere.',
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
                      'Quelle sind kuratierte Datensätze plus manuelle Legacy-Ergänzungen. Zu jedem Modell gibt es Lifecycle-/EOL-Kontext und Datenquellen-Links.',
                      'Sources are curated datasets plus manual legacy additions. Each model includes lifecycle/EOL context and source links.',
                    )}
                  </p>
                </article>
              </div>
            </section>`
      }

      <section class="mt-4">
        <div class="panel p-4 sm:p-5">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Statistik', 'Statistics')}</h2>
            <div class="flex items-center gap-2">${buildStatsChartSvg(arCount, xrCount)}</div>
          </div>
          <div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <p class="soft-panel p-3 text-sm text-[#a8a29e]">
              ${t('Datenbestand', 'Dataset size')}: <strong class="text-[#f5f5f4]">${state.rows.length}</strong>
              &middot; ${t('Sichtbar', 'Visible')}: <strong class="text-[#f5f5f4]">${filtered.length}</strong>
            </p>
            <p class="soft-panel p-3 text-sm text-[#a8a29e]">
              AR: <strong class="text-[#f5f5f4]">${arCount}</strong> &middot;
              XR: <strong class="text-[#f5f5f4]">${xrCount}</strong> &middot;
              ${t('Hersteller', 'Manufacturers')}: <strong class="text-[#f5f5f4]">${manufacturerCount}</strong>
            </p>
            <p class="soft-panel p-3 text-sm text-[#a8a29e]">
              ${t('Aktiv', 'Active')}: <strong class="text-[#f5f5f4]">${activeCount}</strong> &middot;
              EOL: <strong class="text-[#f5f5f4]">${eolCount}</strong> &middot;
              ${t('Herstellerlinks', 'Manufacturer links')}: <strong class="text-[#f5f5f4]">${withShop}</strong>
            </p>
            <p class="soft-panel p-3 text-sm text-[#a8a29e]">
              ${withPrice > 0 ? `${t('Durchschnittspreis', 'Avg. price')}: <strong class="text-[#f5f5f4]">${formatCurrency(avgPrice, 'USD')}</strong> &middot; ` : ''}
              ${t('Datenstand', 'Data updated')}: <strong class="text-[#f5f5f4]">${escapeHtml(
                retrievedAt ? formatDate(retrievedAt) : t('k. A.', 'n/a'),
              )}</strong>
            </p>
          </div>
        </div>
      </section>

      <footer class="mt-4">
        <div class="panel flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-[#a8a29e]">
          <div class="flex flex-wrap items-center gap-3">
            <a href="/finder/" data-nav class="font-semibold text-[#84cc16] hover:underline">${t('Brillen-Finder', 'Glasses finder')}</a>
            <a href="/modelle/" class="hover:underline">${t('Alle Modelle', 'All models')}</a>
            <a href="/glossar.html" class="hover:underline">${t('Glossar & FAQ', 'Glossary & FAQ')}</a>
            <a href="/impressum.html" class="hover:underline">${t('Impressum', 'Legal Notice')}</a>
            <a href="/datenschutz.html" class="hover:underline">${t('Datenschutz', 'Privacy')}</a>
            <a href="/asset-notices.html" class="hover:underline">${t('Bildnachweise', 'Image credits')}</a>
            ${BUILD_TIME ? `<span class="text-xs text-[#78716c]">${t('Build', 'Build')}: ${escapeHtml(BUILD_TIME)}</span>` : ''}
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs">${t('Tastenkürzel', 'Shortcuts')}: <kbd class="rounded border border-[#44403c] px-1.5 py-0.5 text-[10px]">/</kbd> ${t('Suche', 'Search')} &middot; <kbd class="rounded border border-[#44403c] px-1.5 py-0.5 text-[10px]">Esc</kbd> ${t('Leeren', 'Clear')}</span>
            <span class="rounded-full border border-[#44403c] bg-[#1c1917] px-2 py-0.5 text-[10px] font-semibold">v${APP_VERSION}</span>
          </div>
        </div>
        ${
          AFFILIATE.enabled
            ? `<p class="mt-2 px-1 text-[11px] text-[#78716c]">* ${escapeHtml(AFFILIATE.disclosureShort)}</p>`
            : ''
        }
      </footer>
    </main>
    <button
      id="back-to-top"
      type="button"
      class="back-to-top chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]"
      aria-label="${t('Nach oben scrollen', 'Scroll to top')}"
      title="${t('Nach oben', 'Back to top')}"
    >&#8593;</button>
  `;

  const setAndRender = (key, value, options = {}) => {
    const { resetCardsPage = true } = options;
    state[key] = value;
    if (resetCardsPage) {
      state.cardsPage = 1;
    }
    render();
  };

  const debouncedQuery = debounce((val) => setAndRender('query', val), 150);
  document.querySelector('#query-input')?.addEventListener('input', (event) => {
    state.query = event.target.value;
    debouncedQuery(event.target.value);
  });
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
  document.querySelector('#software-filter')?.addEventListener('change', (event) => setAndRender('software', event.target.value));
  document.querySelector('#compute-filter')?.addEventListener('change', (event) => setAndRender('computeUnit', event.target.value));

  const debouncedFov = debounce((val) => setAndRender('minFov', val));
  const debouncedRefresh = debounce((val) => setAndRender('minRefresh', val));
  const debouncedPrice = debounce((val) => setAndRender('maxPrice', val));
  const debouncedWeight = debounce((val) => setAndRender('maxWeight', val));
  const debouncedResolution = debounce((val) => setAndRender('minResolutionWidth', val));

  document.querySelector('#fov-filter')?.addEventListener('input', (event) => debouncedFov(event.target.value));
  document.querySelector('#refresh-filter')?.addEventListener('input', (event) => debouncedRefresh(event.target.value));
  document.querySelector('#price-filter')?.addEventListener('input', (event) => debouncedPrice(event.target.value));
  document.querySelector('#weight-filter')?.addEventListener('input', (event) => debouncedWeight(event.target.value));
  document.querySelector('#resolution-filter')?.addEventListener('input', (event) => debouncedResolution(event.target.value));
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
  document
    .querySelector('#only-image')
    ?.addEventListener('change', (event) => setAndRender('onlyWithImage', event.target.checked));
  document
    .querySelector('#only-favorites')
    ?.addEventListener('change', (event) => setAndRender('onlyFavorites', event.target.checked));

  // Favorite toggle buttons
  document.querySelectorAll('[data-favorite-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(btn.getAttribute('data-favorite-toggle'));
      render();
    });
  });

  // Detail modal on card image click
  document.querySelectorAll('[data-detail-open]').forEach((el) => {
    el.addEventListener('click', () => openDetailModal(el.getAttribute('data-detail-open')));
  });

  document.querySelector('#export-csv')?.addEventListener('click', () => exportFilteredCsv(filtered));
  document.querySelector('#share-url')?.addEventListener('click', (event) => {
    copyShareUrl();
    const btn = event.currentTarget;
    const originalText = btn.textContent;
    btn.textContent = t('Kopiert!', 'Copied!');
    setTimeout(() => { btn.textContent = originalText; }, 1500);
  });
  document.querySelector('#back-to-top')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.querySelector('#view-cards')?.addEventListener('click', () => setAndRender('viewMode', 'cards', { resetCardsPage: false }));
  document.querySelector('#view-table')?.addEventListener('click', () => setAndRender('viewMode', 'table', { resetCardsPage: false }));
  document.querySelector('#toggle-favorites-view')?.addEventListener('click', () => setAndRender('onlyFavorites', !state.onlyFavorites));
  document.querySelector('#toggle-language')?.addEventListener('click', () => {
    state.language = state.language === 'de' ? 'en' : 'de';
    writeLanguageToStorage(state.language);
    render();
  });
  document.querySelector('#theme-toggle')?.addEventListener('click', () => {
    state.theme = state.theme === 'auto' ? 'light' : state.theme === 'light' ? 'dark' : 'auto';
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

  const goToPage = (page) => {
    const target = Math.min(Math.max(1, page), maxPage);
    if (target === state.cardsPage) return;
    state.cardsPage = target;
    render();
    document.querySelector('#results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  document.querySelectorAll('[data-page]').forEach((el) => {
    el.addEventListener('click', () => goToPage(Number.parseInt(el.getAttribute('data-page'), 10)));
  });
  document.querySelector('[data-page-prev]')?.addEventListener('click', () => goToPage(state.cardsPage - 1));
  document.querySelector('[data-page-next]')?.addEventListener('click', () => goToPage(state.cardsPage + 1));

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

  const resetAllFilters = () => {
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
    state.software = 'all';
    state.computeUnit = 'all';
    state.minFov = '';
    state.minRefresh = '';
    state.maxPrice = '';
    state.maxWeight = '';
    state.minResolutionWidth = '';
    state.onlyPrice = false;
    state.onlyShop = false;
    state.onlyAvailable = false;
    state.onlyWithImage = false;
    state.onlyFavorites = false;
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
  };
  document.querySelector('#clear-filters')?.addEventListener('click', resetAllFilters);
  document.querySelector('#empty-reset')?.addEventListener('click', resetAllFilters);
  document.querySelector('#empty-favorites-off')?.addEventListener('click', () => {
    state.onlyFavorites = false;
    state.cardsPage = 1;
    render();
  });

  restoreQueryFocusState(queryFocusState);
};

// Allow decoupled modules (detail modal) to trigger a re-render.
setRenderFn(render);

// Pick the view for the current URL: the guided finder at /finder/, otherwise
// the directory. Used on first paint, on history navigation and on in-app links.
const routeRender = () => {
  if (isFinderRoute()) {
    renderFinder();
  } else {
    render();
  }
};

// Lightweight SPA navigation for internal links flagged with data-nav (finder
// <-> directory). Device pages and external links stay normal full-page loads.
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-nav]');
  if (!link) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const href = link.getAttribute('href');
  if (!href) return;
  event.preventDefault();
  if (href !== `${window.location.pathname}${window.location.search}`) {
    history.pushState(null, '', href);
  }
  routeRender();
  window.scrollTo({ top: 0 });
});

// The finder applies coarse filters then asks to hand off to the directory.
window.addEventListener('ar-navigate', (event) => {
  const path = event.detail?.path || '/';
  history.pushState(null, '', path);
  routeRender();
  window.scrollTo({ top: 0 });
});

window.addEventListener('popstate', () => {
  routeRender();
});

// Resolve a /compare/<a>-vs-<b> deep link (served via 404.html on GitHub Pages)
// into compare state. Must run after state.rows + __flat are populated.
const applyComparePathFromUrl = () => {
  const match = window.location.pathname.match(/^\/compare\/(.+?)\/?$/);
  if (!match) return;
  const flats = decodeURIComponent(match[1]).split(COMPARE_SEPARATOR).map((s) => s.trim()).filter(Boolean);
  const byFlat = new Map(state.rows.map((row) => [row.__flat, row.__rowId]));
  const ids = flats.map((flat) => byFlat.get(flat)).filter(Boolean).slice(0, COMPARE_LIMIT);
  if (ids.length) {
    state.selectedIds = ids;
    state.compareMode = true;
  }
};

const init = async () => {
  state.language = readLanguageFromStorage();
  state.theme = readThemeFromStorage();
  state.favorites = readFavoritesFromStorage();
  applyStateFromUrl();
  state.language = normalizeLanguage(state.language, 'de');
  state.theme = normalizeTheme(state.theme, 'auto');
  writeLanguageToStorage(state.language);
  writeThemeToStorage(state.theme);
  applyLanguageToDocument();
  applyThemeToDocument();
  setFallbackUsdRate();

  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (state.theme === 'auto') applyThemeToDocument();
    });
  } catch {}

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('#detail-modal')) return;
    const active = document.activeElement;
    const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
    if (e.key === '/' && !isInput) {
      e.preventDefault();
      document.querySelector('#query-input')?.focus();
    }
    if (e.key === 'Escape' && isInput) {
      if (state.query) {
        state.query = '';
        state.cardsPage = 1;
        render();
      } else {
        active.blur();
      }
    }
  });
  const skeletonCard = `<div class="panel overflow-hidden"><div class="h-48 animate-pulse bg-[#1c1917]"></div><div class="space-y-3 p-4"><div class="h-5 w-2/3 animate-pulse rounded bg-[#1c1917]"></div><div class="h-4 w-1/2 animate-pulse rounded bg-[#1c1917]"></div><div class="grid grid-cols-2 gap-2"><div class="h-12 animate-pulse rounded-lg bg-[#1c1917]"></div><div class="h-12 animate-pulse rounded-lg bg-[#1c1917]"></div></div><div class="h-16 animate-pulse rounded-xl bg-[#1c1917]"></div></div></div>`;
  app.innerHTML = `<a href="#main-content" class="skip-link">${t(
    'Zum Inhalt springen',
    'Skip to content',
  )}</a><main id="main-content" tabindex="-1" class="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8"><div class="flex items-center gap-3 text-sm text-[#a8a29e]"><span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#44403c] border-t-[#84cc16]" aria-hidden="true"></span>${t(
    'Lade Brillendaten...',
    'Loading glasses data...',
  )}</div><div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">${skeletonCard.repeat(6)}</div></main>`;

  const ratePromise = fetchUsdToEurRate();

  // Optional curated affiliate deeplinks; harmless if missing or disabled.
  fetch('/data/affiliate-overrides.json', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : {}))
    .then((data) => {
      setAffiliateOverrides(data);
      if (state.rows.length) {
        routeRender();
      }
    })
    .catch(() => {});

  // Editorial descriptions for the detail modal.
  fetch('/data/descriptions.json', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : {}))
    .then((data) => {
      state.descriptions = data && typeof data === 'object' ? data : {};
    })
    .catch(() => {});

  try {
    const response = await fetch('/data/ar_glasses.csv', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`CSV request failed with status ${response.status}`);
    }
    const csv = await response.text();
    const { data, fields } = await parseCsv(csv);
    state.rows = data.map((row, index) => ({ ...row, __rowId: getRowId(row, index) }));
    const devicePaths = assignDevicePaths(state.rows);
    state.rows.forEach((row) => {
      const derived = devicePaths.get(row.id);
      row.__path = derived ? derived.path : '';
      row.__flat = derived ? derived.flat : '';
    });
    state.csvFields = fields.filter((field) => !field.startsWith('__'));
    applyComparePathFromUrl();
    pruneSelectedIdsToKnownRows();
    state.compareNotice = '';
    routeRender();
    ratePromise.then(() => {
      if (state.rows.length) {
        routeRender();
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : t('Unbekannter Fehler', 'Unknown error');
    app.innerHTML = `
      <a href="#main-content" class="skip-link">${t('Zum Inhalt springen', 'Skip to content')}</a>
      <main id="main-content" tabindex="-1" class="mx-auto max-w-[1320px] px-4 py-8">
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
