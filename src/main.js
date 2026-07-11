import deferredStyles from './deferred.css?inline';
import { escapeHtml, debounce } from './utils.js';
import {
  state,
  COMPARE_LIMIT,
  CARDS_PER_PAGE,
  MOBILE_CARDS_PER_PAGE,
  normalizeLanguage,
  normalizeTheme,
  readThemeFromStorage,
  readLanguageFromStorage,
  writeThemeToStorage,
  writeLanguageToStorage,
  readFavoritesFromStorage,
  toggleFavorite,
  applyThemeToDocument,
  applyLanguageToDocument,
  setFallbackUsdRate,
  pruneSelectedIdsToKnownRows,
  applyStateFromUrl,
  syncUrlWithState,
} from './state.js';
import { t, formatRateHint, compactValue } from './i18n.js';
import { getRowId } from './data/model.js';
import { assignDevicePaths, COMPARE_SEPARATOR } from './data/paths.js';
import { getFilterOptions, matchesFilters, sortRows, getSelectedRows } from './data/filters.js';
import { parseCsv, fetchUsdToEurRate } from './data/dataset.js';
import { AFFILIATE, setAffiliateOverrides } from './affiliate.js';
import { optionList, brandLockupTemplate, headerControlsTemplate, siteFooterTemplate } from './render/shared.js';
import { cardTemplate } from './render/cards.js';
import { setRenderFn } from './render/registry.js';
import { exportFilteredCsv, copyShareUrl } from './actions.js';
import { updateDocumentSeoSignals, captureQueryFocusState, restoreQueryFocusState } from './seo.js';

const app = document.querySelector('#app');
const deferredStyle = document.querySelector('style[data-deferred-app-css]') || document.createElement('style');
deferredStyle.dataset.deferredAppCss = '';
deferredStyle.textContent = deferredStyles;
if (!deferredStyle.isConnected) document.head.append(deferredStyle);
const isFinderRoute = () => /^\/finder\/?$/.test(window.location.pathname);
const yieldToMainThread = () => new Promise((resolveYield) => setTimeout(resolveYield, 0));

let tableModule;
let tableModulePromise;
let compareModule;
let compareModulePromise;
let finderModulePromise;

const requestTableModule = () => {
  if (tableModule || tableModulePromise) return;
  tableModulePromise = import('./render/table.js').then((module) => {
    tableModule = module;
    if (!isFinderRoute() && state.viewMode === 'table') render();
  });
};

const requestCompareModule = () => {
  if (compareModule || compareModulePromise) return;
  compareModulePromise = import('./render/compare.js').then((module) => {
    compareModule = module;
    if (!isFinderRoute() && state.selectedIds.length) render();
  });
};

const renderFinderRoute = () => {
  finderModulePromise ||= import('./render/finder.js');
  void finderModulePromise.then((module) => {
    if (isFinderRoute()) module.renderFinder();
  });
};

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

const countActiveAdvancedFilters = () => {
  const selectFilters = [
    state.displayType,
    state.optics,
    state.tracking,
    state.eyeTracking,
    state.handTracking,
    state.passthrough,
    state.active,
    state.eol,
    state.software,
    state.computeUnit,
  ];
  const rangeFilters = [state.minFov, state.minRefresh, state.maxPrice, state.maxWeight, state.minResolutionWidth];
  const toggleFilters = [
    state.onlyPrice,
    state.onlyShop,
    state.onlyAvailable,
    state.onlyWithImage,
    state.onlyFavorites,
  ];
  return (
    selectFilters.filter((value) => value && value !== 'all').length +
    rangeFilters.filter((value) => String(value ?? '').trim()).length +
    toggleFilters.filter(Boolean).length
  );
};

const countActiveFilters = () =>
  [state.category, state.manufacturer].filter((value) => value && value !== 'all').length +
  countActiveAdvancedFilters();

const syncAttributes = (target, source) => {
  for (const attribute of [...target.attributes]) {
    if (!source.hasAttribute(attribute.name)) target.removeAttribute(attribute.name);
  }
  for (const attribute of [...source.attributes]) {
    target.setAttribute(attribute.name, attribute.value);
  }
};

// Patch the catalog around the server-rendered hero instead of replacing the
// whole app. The connected H1 remains the same DOM node from first paint on.
const applyCatalogMarkup = async (markup, { cooperative = false } = {}) => {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const nextMain = template.content.querySelector('#main-content');
  const nextHeader = nextMain?.querySelector(':scope > .app-hero');
  const nextTitle = nextHeader?.querySelector(':scope > .hero-title');
  const currentMain = app.querySelector(':scope > #main-content');
  const currentHeader = currentMain?.querySelector(':scope > .app-hero');
  const currentTitle = currentHeader?.querySelector(':scope > .hero-title');

  if (!nextMain || !nextHeader || !nextTitle || !currentMain || !currentHeader || !currentTitle) {
    app.replaceChildren(...template.content.childNodes);
    return;
  }

  if (cooperative) await yieldToMainThread();

  syncAttributes(currentMain, nextMain);
  const preserveInitialHero =
    currentHeader.dataset.initialShell === 'true' &&
    state.language === 'de' &&
    state.theme === 'auto' &&
    currentTitle.textContent === nextTitle.textContent &&
    currentHeader.querySelector('#toggle-language') &&
    currentHeader.querySelector('#theme-toggle');

  if (!preserveInitialHero) {
    syncAttributes(currentHeader, nextHeader);
    if (currentTitle.textContent !== nextTitle.textContent) {
      currentTitle.textContent = nextTitle.textContent;
    }

    // Refresh the hero chrome while never disconnecting its H1.
    for (const node of [...currentHeader.childNodes]) {
      if (node !== currentTitle) node.remove();
    }
    let afterTitle = false;
    for (const node of [...nextHeader.childNodes]) {
      if (node === nextTitle) {
        afterTitle = true;
      } else if (afterTitle) {
        currentHeader.append(node);
      } else {
        currentHeader.insertBefore(node, currentTitle);
      }
    }
  }

  for (const node of [...currentMain.childNodes]) {
    if (node !== currentHeader) node.remove();
  }
  for (const node of [...nextMain.childNodes]) {
    if (node !== nextHeader) {
      currentMain.append(node);
    }
  }

  for (const node of [...app.childNodes]) {
    if (node !== currentMain) node.remove();
  }
  const nextSkipLink = template.content.querySelector(':scope > .skip-link');
  const nextBackToTop = template.content.querySelector(':scope > #back-to-top');
  if (nextSkipLink) app.insertBefore(nextSkipLink, currentMain);
  if (nextBackToTop) app.append(nextBackToTop);
};

const render = async ({ cooperative = false } = {}) => {
  const queryFocusState = captureQueryFocusState();
  const isMobileViewport = window.matchMedia('(max-width: 640px)').matches;
  const showCoreFilters = !isMobileViewport || state.showAdvancedFilters;
  // The mobile first view only contains search. Building and sorting eleven
  // option lists before the user opens filters adds needless startup work.
  const filterOptions = showCoreFilters ? getFilterOptions() : {};
  const filtered = sortRows(state.rows.filter(matchesFilters));
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
  const activeFilterCount = countActiveFilters();
  const hasActiveAdvancedSettings = Boolean(countActiveAdvancedFilters() || state.showEur || state.hideUnknown);
  const hasResettableState = Boolean(
    state.query.trim() ||
      activeFilterCount ||
      state.sort !== 'priority_default' ||
      state.showEur ||
      state.hideUnknown,
  );
  const densityToggleLabel = state.focusMode
    ? state.viewMode === 'cards'
      ? t('Ausführliche Karten anzeigen', 'Show detailed cards')
      : t('Liste mit mehr Abstand anzeigen', 'Show a more spacious list')
    : state.viewMode === 'cards'
      ? t('Kompakte Karten anzeigen', 'Show compact cards')
      : t('Liste kompakter anzeigen', 'Show a more compact list');
  const filterToggleLabel = state.showAdvancedFilters
    ? t(
        `Filter schließen${activeFilterCount ? `, ${activeFilterCount} aktiv` : ''}`,
        `Close filters${activeFilterCount ? `, ${activeFilterCount} active` : ''}`,
      )
    : t(
        `Filter öffnen${activeFilterCount ? `, ${activeFilterCount} aktiv` : ''}`,
        `Open filters${activeFilterCount ? `, ${activeFilterCount} active` : ''}`,
      );

  const catalogMarkup = `
    <a href="#main-content" class="skip-link">${t('Zum Inhalt springen', 'Skip to content')}</a>
    <main id="main-content" tabindex="-1" class="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8">
      <header class="app-hero panel relative overflow-hidden p-4 sm:p-5">
        <div class="theme-hero-surface absolute inset-0 -z-10"></div>
        <div class="flex items-start justify-between gap-3">
          ${brandLockupTemplate()}
          ${headerControlsTemplate()}
        </div>
        <h1 class="hero-title mt-3 text-3xl font-bold leading-tight sm:text-4xl">${t(
          'Vergleich für AR-Brillen und XR-Glasses',
          'Comparison for AR Glasses and XR Glasses',
        )}</h1>
        <div class="hero-summary mt-3">
          <p class="max-w-3xl text-sm leading-relaxed text-[#a8a29e]">
            ${t(
              '348 Modelle mit Specs, Preisen, Lifecycle und Herstellerlinks – inklusive historischer Geräte.',
              '348 models with specs, pricing, lifecycle and manufacturer links – including legacy devices.',
            )}
          </p>
          <div class="flex shrink-0 flex-wrap items-center gap-3">
            <a href="/finder/" data-nav class="finder-cta">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"/><path d="m14.8 9.2-1.6 4-4 1.6 1.6-4 4-1.6Z" fill="currentColor"/></svg>
              ${t('AR-/XR-Brille finden', 'Find AR/XR glasses')}
            </a>
          </div>
        </div>
      </header>
      <p id="results-status" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">${escapeHtml(resultsStatusLabel)}</p>

      ${selectedRows.length && compareModule ? compareModule.compareBarTemplate(selectedRows) : ''}

      <section class="panel catalog-filter-panel mt-3 p-4" data-filters-open="${state.showAdvancedFilters ? 'true' : 'false'}">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-[#f5f5f4]">${t('Modelle finden', 'Find models')}</h2>
            <p class="mt-1 text-xs text-[#a8a29e]">${t('Suchen, eingrenzen und vergleichen', 'Search, refine and compare')}</p>
          </div>
          <div class="filter-toolbar">
            <div class="view-switch" role="group" aria-label="${t('Ergebnisansicht', 'Result view')}">
              <button id="view-cards" type="button" aria-pressed="${state.viewMode === 'cards' ? 'true' : 'false'}" class="view-switch-btn ${
                state.viewMode === 'cards' ? 'is-active' : ''
              }"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg>${t('Karten', 'Cards')}</button>
              <button id="view-table" type="button" aria-pressed="${state.viewMode === 'table' ? 'true' : 'false'}" class="view-switch-btn ${
                state.viewMode === 'table' ? 'is-active' : ''
              }"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4h14M3 10h14M3 16h14"/></svg>${t('Liste', 'List')}</button>
            </div>
            <button id="toggle-focus-mode" type="button" class="icon-btn density-toggle" aria-pressed="${state.focusMode ? 'false' : 'true'}" aria-label="${escapeHtml(densityToggleLabel)}" title="${escapeHtml(densityToggleLabel)}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4h14M3 10h${state.focusMode ? '9' : '14'}M3 16h${state.focusMode ? '6' : '14'}"/></svg></button>
            <button id="clear-filters" type="button" class="icon-btn" ${hasResettableState ? '' : 'disabled'} aria-label="${t('Suche und Filter zurücksetzen', 'Reset search and filters')}" title="${t('Suche und Filter zurücksetzen', 'Reset search and filters')}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 6.5A6 6 0 1 1 4 13M4.5 6.5V2.8M4.5 6.5H8"/></svg></button>
            <button id="toggle-advanced-filters" type="button" aria-pressed="${state.showAdvancedFilters ? 'true' : 'false'}" aria-expanded="${state.showAdvancedFilters ? 'true' : 'false'}" aria-controls="advanced-filters-region" aria-label="${escapeHtml(filterToggleLabel)}" title="${escapeHtml(filterToggleLabel)}" class="filter-toggle ${state.showAdvancedFilters ? 'is-active' : ''}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M5 10h10M8 15h4"/></svg><span class="filter-label">${t('Filter', 'Filters')}</span><span class="filter-count ${activeFilterCount ? '' : 'is-empty'}" aria-hidden="true">${activeFilterCount || 0}</span></button>
          </div>
        </div>

        <div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label class="space-y-1.5 md:col-span-2 xl:col-span-2">
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Suche', 'Search')}</span>
            <input id="query-input" type="search" class="field" placeholder="${t(
              'Modell, Hersteller oder Merkmal',
              'Model, manufacturer or feature',
            )}" value="${escapeHtml(state.query)}" />
          </label>

          ${
            showCoreFilters
              ? `<label class="core-secondary space-y-1.5">
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Kategorie', 'Category')}</span>
            <select id="category-filter" class="field">
              <option value="all"${state.category === 'all' ? ' selected' : ''}>${t('Alle Kategorien', 'All categories')}</option>
              <option value="AR"${state.category === 'AR' ? ' selected' : ''}>AR</option>
              <option value="XR"${state.category === 'XR' ? ' selected' : ''}>XR</option>
            </select>
          </label>

          <label class="core-secondary space-y-1.5">
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Hersteller', 'Manufacturer')}</span>
            <select id="manufacturer-filter" class="field">
              ${optionList(filterOptions.manufacturers, state.manufacturer, t('Alle Hersteller', 'All manufacturers'))}
            </select>
          </label>

          <label class="core-secondary space-y-1.5">
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t('Sortierung', 'Sorting')}</span>
            <select id="sort-filter" class="field">
              <option value="priority_default"${
                state.sort === 'priority_default' ? ' selected' : ''
              }>${t('Empfohlen', 'Recommended')}</option>
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
              `
              : ''
          }
        </div>

        <div
          id="advanced-filters-region"
          role="region"
          aria-label="${t('Erweiterte Filter', 'Advanced filters')}"
          aria-hidden="${state.showAdvancedFilters ? 'false' : 'true'}"
          class="mt-4 space-y-4 border-t border-[#44403c]/70 pt-4 ${state.showAdvancedFilters ? '' : 'hidden'}"
        >
          ${
            state.showAdvancedFilters
              ? `
          <details class="advanced-filter-details"${!isMobileViewport || hasActiveAdvancedSettings ? ' open' : ''}>
            <summary>
              <span>
                <strong>${t('Weitere Filter', 'More filters')}</strong>
                <small>${t('Display, Tracking, Maße und Optionen', 'Display, tracking, dimensions and options')}</small>
              </span>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg>
            </summary>
            <div class="advanced-filter-content space-y-4">
          <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a8a29e]">${t('Technische Merkmale', 'Technical features')}</p>
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

          <p class="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a8a29e]">${t('Optionen', 'Options')}</p>
          <div class="flex flex-wrap items-center gap-2">
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="only-price" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.onlyPrice ? 'checked' : ''} />
              ${t('Mit Preis', 'With price')}
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="only-shop" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.onlyShop ? 'checked' : ''} />
              ${t('Mit Herstellerseite', 'With manufacturer page')}
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="only-available" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.onlyAvailable ? 'checked' : ''} />
              ${t('Aktuell im Vertrieb', 'Currently distributed')}
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="show-eur" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.showEur ? 'checked' : ''} />
              ${t('Preise auch in EUR', 'Also show EUR prices')}
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="hide-unknown" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.hideUnknown ? 'checked' : ''} />
              ${t('Unbekannte Werte ausblenden', 'Hide unknown values')}
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">
              <input id="only-image" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.onlyWithImage ? 'checked' : ''} />
              ${t('Mit Bild', 'With image')}
            </label>
            <label class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524] ${state.favorites.length ? '' : 'opacity-50'}">
              <input id="only-favorites" type="checkbox" class="mr-2 size-4 accent-[#84cc16]" ${state.onlyFavorites ? 'checked' : ''} ${state.favorites.length ? '' : 'disabled'} />
              ${t('Favoriten', 'Favorites')} (${state.favorites.length})
            </label>
          </div>
            </div>
          </details>
              `
              : ''
          }
        </div>
        ${state.showEur ? `<p class="mt-2 text-xs text-[#a8a29e]">${escapeHtml(formatRateHint())}</p>` : ''}
      </section>

      <section class="results-tools mt-3">
        <p class="result-count"><strong>${filtered.length}</strong> <span>${t('Modelle', 'models')}</span>${
          filtered.length !== state.rows.length
            ? ` <small>${t(`von ${state.rows.length}`, `of ${state.rows.length}`)}</small>`
            : ''
        }</p>
        <div class="flex items-center gap-1">
          <a href="/data.html" class="icon-text-btn" title="${t('Datenübersicht und Datenqualität', 'Dataset overview and quality')}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 16V9m5 7V4m5 12v-5m4 5H2"/></svg><span>${t('Daten', 'Data')}</span></a>
          <button id="export-csv" type="button" class="icon-text-btn" ${filtered.length === 0 ? 'disabled' : ''} title="${t('Ergebnisse als CSV exportieren', 'Export results as CSV')}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2v10m0 0 4-4m-4 4L6 8M3 15v2h14v-2"/></svg><span>CSV</span></button>
          <button id="share-url" type="button" class="icon-text-btn" title="${t('Ansicht teilen', 'Share view')}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 12.5l5-5M6 8H5a3 3 0 0 0 0 6h3a3 3 0 0 0 2.1-.9M14 12h1a3 3 0 0 0 0-6h-3a3 3 0 0 0-2.1.9"/></svg><span>${t('Teilen', 'Share')}</span></button>
        </div>
      </section>

      <section id="results" class="mt-2 scroll-mt-4">
        ${
          state.compareMode
            ? compareModule
              ? compareModule.compareModeTemplate(selectedRows)
              : `<section class="panel p-6 text-sm text-[#a8a29e]" role="status">${t('Vergleich wird geladen...', 'Loading comparison...')}</section>`
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
                    <div data-card-grid class="grid gap-4 md:grid-cols-2 ${state.focusMode ? 'xl:grid-cols-4' : 'xl:grid-cols-3 xl:gap-5'}">${visibleCards.map(cardTemplate).join('')}</div>
                    ${paginationTemplate(state.cardsPage, maxPage, visibleCards.length, filtered.length)}
                  `
                : tableModule
                  ? tableModule.tableTemplate(filtered)
                  : `<section class="panel p-6 text-sm text-[#a8a29e]" role="status">${t('Liste wird geladen...', 'Loading list...')}</section>`
        }
      </section>

      ${siteFooterTemplate({ disclosure: AFFILIATE.enabled ? AFFILIATE.disclosureShort : '' })}
    </main>
    <button
      id="back-to-top"
      type="button"
      class="back-to-top chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]"
      aria-label="${t('Nach oben scrollen', 'Scroll to top')}"
      title="${t('Nach oben', 'Back to top')}"
    >&#8593;</button>
  `;
  if (cooperative) await yieldToMainThread();
  if (cooperative) await applyCatalogMarkup(catalogMarkup, { cooperative: true });
  else void applyCatalogMarkup(catalogMarkup);
  if (state.viewMode === 'table') requestTableModule();
  if (selectedRows.length) requestCompareModule();

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
    el.addEventListener('click', () => {
      const rowId = el.getAttribute('data-detail-open');
      void import('./render/modal.js').then((module) => module.openDetailModal(rowId));
    });
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

  window.__AR_DIRECTORY_READY__ = true;
  restoreQueryFocusState(queryFocusState);
};

// Allow decoupled modules (detail modal) to trigger a re-render.
setRenderFn(render);

// Pick the view for the current URL: the guided finder at /finder/, otherwise
// the directory. Used on first paint, on history navigation and on in-app links.
const routeRender = (options) => {
  if (isFinderRoute()) {
    renderFinderRoute();
  } else {
    void render(options);
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
  state.cardsPageSize = window.matchMedia('(max-width: 640px)').matches ? MOBILE_CARDS_PER_PAGE : CARDS_PER_PAGE;
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
  app.querySelector('#main-content')?.setAttribute('aria-busy', 'true');

  // Optional curated affiliate deeplinks; harmless if missing or disabled.
  const affiliatePromise = fetch('/data/affiliate-overrides.json')
    .then((response) => (response.ok ? response.json() : {}))
    .then((data) => {
      setAffiliateOverrides(data);
    })
    .catch(() => {});

  // Editorial descriptions for the detail modal.
  fetch('/data/descriptions.json')
    .then((response) => (response.ok ? response.json() : {}))
    .then((data) => {
      state.descriptions = data && typeof data === 'object' ? data : {};
    })
    .catch(() => {});

  try {
    const [response] = await Promise.all([fetch('/data/ar_glasses.csv'), affiliatePromise]);
    if (!response.ok) {
      throw new Error(`CSV request failed with status ${response.status}`);
    }
    const csv = await response.text();
    const { data, fields } = await parseCsv(csv);
    await yieldToMainThread();
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
    await yieldToMainThread();
    routeRender({ cooperative: true });
    // Currency enrichment is useful but not render-critical. Delaying it keeps
    // the first interaction and LCP free from a second full catalog render.
    window.setTimeout(() => {
      fetchUsdToEurRate().then(() => {
        if (state.rows.length) routeRender();
      });
    }, 4000);
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

export const start = () => {
  void init();
};
