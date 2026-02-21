import Papa from 'papaparse';
import './style.css';

const app = document.querySelector('#app');

const state = {
  rows: [],
  query: '',
  viewMode: 'cards',
  category: 'all',
  manufacturer: 'all',
  displayType: 'all',
  active: 'all',
  eol: 'all',
  minFov: '',
  minRefresh: '',
  maxPrice: '',
  onlyPrice: false,
  onlyShop: false,
  sort: 'name_asc',
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
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : '';
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
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
};

const parsePrice = (value) => {
  const numeric = toNumber(value);
  return numeric && numeric > 0 ? numeric : null;
};

const formatPrice = (value) => {
  const price = parsePrice(value);
  if (!price) {
    return 'Preis auf Anfrage';
  }
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
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

const compactValue = (value, fallback = 'k. A.') => {
  const text = String(value ?? '').trim();
  return text ? text : fallback;
};

const uniqueSorted = (values) =>
  [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, 'de', { sensitivity: 'base' }),
  );

const getShopInfo = (row) => {
  const officialUrl = safeExternalUrl(row.official_url);
  const fallbackUrl = safeExternalUrl(row.vrcompare_url);
  if (officialUrl) {
    return {
      url: officialUrl,
      label: 'Zum Shop',
      source: 'Offizieller Shop-Link',
      official: true,
    };
  }
  if (fallbackUrl) {
    return {
      url: fallbackUrl,
      label: 'Info / Haendler',
      source: 'Fallback ueber VR-Compare',
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

const getFilterOptions = () => ({
  manufacturers: uniqueSorted(state.rows.map((row) => row.manufacturer)),
  displayTypes: uniqueSorted(state.rows.map((row) => row.display_type)),
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

const sortRows = (rows) => {
  const sorted = [...rows];
  switch (state.sort) {
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
        row.xr_category,
      ].join(' '),
    );
    const tokens = query.split(/\s+/).filter(Boolean);
    if (!tokens.every((token) => haystack.includes(token))) {
      return false;
    }
  }

  if (state.category !== 'all' && normalizeText(row.xr_category) !== normalizeText(state.category)) {
    return false;
  }
  if (state.manufacturer !== 'all' && row.manufacturer !== state.manufacturer) {
    return false;
  }
  if (state.displayType !== 'all' && row.display_type !== state.displayType) {
    return false;
  }
  if (state.active !== 'all' && row.active_distribution !== state.active) {
    return false;
  }
  if (state.eol !== 'all' && row.eol_status !== state.eol) {
    return false;
  }
  if (state.onlyPrice && !parsePrice(row.price_usd)) {
    return false;
  }
  if (state.onlyShop && !getShopInfo(row).url) {
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
    ? 'border-[#c58f48] bg-[#fff2de] text-[#7c4e15]'
    : 'border-[#8fa977] bg-[#eef6e5] text-[#36521f]';

const lifecycleTone = (row) => {
  if (isEol(row)) {
    return 'border-[#d39e87] bg-[#fdeee6] text-[#7f2f0f]';
  }
  if (normalizeText(row.eol_status).includes('angekuendigt')) {
    return 'border-[#d3b37d] bg-[#fff6e3] text-[#6f4a0d]';
  }
  return 'border-[#9fbc8c] bg-[#eef8e9] text-[#2e5824]';
};

const cardTemplate = (row) => {
  const name = escapeHtml(compactValue(row.name, 'Unbekanntes Modell'));
  const manufacturer = escapeHtml(compactValue(row.manufacturer, 'Unbekannt'));
  const category = escapeHtml(compactValue(row.xr_category, 'AR'));
  const image = safeExternalUrl(row.image_url);
  const shop = getShopInfo(row);
  const shopButtonClasses = shop.official
    ? 'chip-btn border-[#a24d20] bg-[#a24d20] text-[#fff8f0] hover:bg-[#8f4118]'
    : 'chip-btn border-[#ceb99f] bg-white text-[#2b2118] hover:bg-[#f5ece0]';
  const lifecycleClasses = lifecycleTone(row);
  const eolDate = row.eol_date ? formatDate(row.eol_date) : 'k. A.';
  const releaseDate = formatDate(row.release_date || row.announced_date);
  const infoUrl = safeExternalUrl(row.source_page || row.vrcompare_url);

  return `
    <article class="panel overflow-hidden">
      <div class="relative h-48 border-b border-[#e0d1c1] bg-gradient-to-br from-[#f7ecdf] to-[#efe1d1]">
        ${
          image
            ? `<img src="${escapeHtml(image)}" alt="${name}" loading="lazy" class="h-full w-full object-contain p-4" />`
            : '<div class="grid h-full place-items-center text-sm text-[#6b5a4a]">Kein Bild verfuegbar</div>'
        }
        <span class="absolute right-3 top-3 rounded-full border px-2.5 py-1 text-xs font-bold ${categoryTone(row.xr_category)}">${category}</span>
      </div>
      <div class="space-y-4 p-4">
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#6c5b49]">${manufacturer}</p>
          <h2 class="font-['Spectral'] text-2xl leading-tight text-[#231c15]">${name}</h2>
          <p class="text-sm text-[#6d5c49]">Release: ${escapeHtml(releaseDate)}</p>
        </div>

        <div class="grid grid-cols-2 gap-2 text-sm">
          <div class="soft-panel p-2.5">
            <p class="text-[11px] uppercase tracking-[0.12em] text-[#6d5c49]">Preis</p>
            <p class="mt-1 font-semibold text-[#281f16]">${escapeHtml(formatPrice(row.price_usd))}</p>
          </div>
          <div class="soft-panel p-2.5">
            <p class="text-[11px] uppercase tracking-[0.12em] text-[#6d5c49]">Vertrieb</p>
            <p class="mt-1 font-semibold text-[#281f16]">${escapeHtml(compactValue(row.active_distribution, 'k. A.'))}</p>
          </div>
        </div>

        <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-[#2f2419]">
          <div>
            <dt class="text-xs text-[#6d5c49]">Display</dt>
            <dd class="font-medium">${escapeHtml(compactValue(row.display_type))}</dd>
          </div>
          <div>
            <dt class="text-xs text-[#6d5c49]">Optik</dt>
            <dd class="font-medium">${escapeHtml(compactValue(row.optics))}</dd>
          </div>
          <div>
            <dt class="text-xs text-[#6d5c49]">FOV H</dt>
            <dd class="font-medium">${escapeHtml(formatNumber(row.fov_horizontal_deg, ' deg'))}</dd>
          </div>
          <div>
            <dt class="text-xs text-[#6d5c49]">Refresh</dt>
            <dd class="font-medium">${escapeHtml(formatNumber(row.refresh_hz, ' Hz'))}</dd>
          </div>
          <div>
            <dt class="text-xs text-[#6d5c49]">Software</dt>
            <dd class="font-medium">${escapeHtml(compactValue(row.software))}</dd>
          </div>
          <div>
            <dt class="text-xs text-[#6d5c49]">Tracking</dt>
            <dd class="font-medium">${escapeHtml(compactValue(row.tracking))}</dd>
          </div>
          <div>
            <dt class="text-xs text-[#6d5c49]">Aufloesung</dt>
            <dd class="font-medium">${escapeHtml(compactValue(row.resolution_per_eye))}</dd>
          </div>
          <div>
            <dt class="text-xs text-[#6d5c49]">Compute</dt>
            <dd class="font-medium">${escapeHtml(compactValue(row.compute_unit))}</dd>
          </div>
        </dl>

        <div class="rounded-2xl border p-3 text-sm ${lifecycleClasses}">
          <p class="text-[11px] font-semibold uppercase tracking-[0.12em]">Updates / EOL</p>
          <p class="mt-1 font-semibold">${escapeHtml(compactValue(row.eol_status))}</p>
          <p class="mt-1 text-xs">EOL-Datum: ${escapeHtml(eolDate)}</p>
          <p class="mt-2 text-xs leading-relaxed">${escapeHtml(compactValue(row.lifecycle_notes, 'Keine Angaben.'))}</p>
        </div>

        <div class="flex flex-wrap gap-2">
          ${
            shop.url
              ? `<a href="${escapeHtml(shop.url)}" target="_blank" rel="noreferrer" class="${shopButtonClasses}">${escapeHtml(shop.label)}</a>`
              : '<span class="chip-btn cursor-not-allowed border-[#d4c3af] bg-[#f2e8db] text-[#8a7764]">Shop-Link fehlt</span>'
          }
          ${
            infoUrl
              ? `<a href="${escapeHtml(infoUrl)}" target="_blank" rel="noreferrer" class="chip-btn border-[#ceb99f] bg-white text-[#2b2118] hover:bg-[#f5ece0]">Datenquelle</a>`
              : ''
          }
        </div>
        <p class="text-xs text-[#6f5f4c]">${escapeHtml(shop.source)}</p>
      </div>
    </article>
  `;
};

const tableTemplate = (rows) => {
  if (!rows.length) {
    return '<p class="panel p-8 text-center text-sm text-[#6f5f4c]">Keine Ergebnisse fuer diese Filter.</p>';
  }

  return `
    <div class="panel overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-[1200px] border-collapse text-sm">
          <thead class="bg-[#f4e9dc] text-left text-[11px] uppercase tracking-[0.12em] text-[#6b5a48]">
            <tr>
              <th class="px-3 py-3">Brille</th>
              <th class="px-3 py-3">Hersteller</th>
              <th class="px-3 py-3">Kat.</th>
              <th class="px-3 py-3">Display</th>
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
                const infoUrl = safeExternalUrl(row.source_page || row.vrcompare_url);
                return `
                  <tr class="${index % 2 === 0 ? 'bg-white' : 'bg-[#fffbf4]'} align-top text-[#2a2017]">
                    <td class="px-3 py-3">
                      <p class="font-semibold">${escapeHtml(compactValue(row.name, 'Unbekannt'))}</p>
                      <p class="mt-1 text-xs text-[#6d5c49]">${escapeHtml(compactValue(row.resolution_per_eye))}</p>
                    </td>
                    <td class="px-3 py-3">${escapeHtml(compactValue(row.manufacturer))}</td>
                    <td class="px-3 py-3">
                      <span class="rounded-full border px-2 py-1 text-xs font-semibold ${categoryTone(row.xr_category)}">${escapeHtml(
                        compactValue(row.xr_category, 'AR'),
                      )}</span>
                    </td>
                    <td class="px-3 py-3">${escapeHtml(compactValue(row.display_type))}</td>
                    <td class="px-3 py-3">${escapeHtml(formatNumber(row.fov_horizontal_deg, ' deg'))}</td>
                    <td class="px-3 py-3">${escapeHtml(formatNumber(row.refresh_hz, ' Hz'))}</td>
                    <td class="px-3 py-3">${escapeHtml(formatPrice(row.price_usd))}</td>
                    <td class="px-3 py-3">${escapeHtml(compactValue(row.active_distribution, 'k. A.'))}</td>
                    <td class="px-3 py-3">
                      <p class="font-semibold">${escapeHtml(compactValue(row.eol_status))}</p>
                      <p class="mt-1 text-xs text-[#6d5c49]">${escapeHtml(compactValue(row.lifecycle_notes, 'Keine Angaben.'))}</p>
                    </td>
                    <td class="px-3 py-3">${escapeHtml(compactValue(row.software))}</td>
                    <td class="px-3 py-3">
                      <div class="flex flex-col gap-2">
                        ${
                          shop.url
                            ? `<a href="${escapeHtml(shop.url)}" target="_blank" rel="noreferrer" class="text-xs font-semibold text-[#8c3f14] hover:underline">${escapeHtml(shop.label)}</a>`
                            : '<span class="text-xs text-[#8e7a66]">Kein Shop-Link</span>'
                        }
                        ${
                          infoUrl
                            ? `<a href="${escapeHtml(infoUrl)}" target="_blank" rel="noreferrer" class="text-xs font-semibold text-[#8c3f14] hover:underline">Quelle</a>`
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

const render = () => {
  const filterOptions = getFilterOptions();
  const filtered = sortRows(state.rows.filter(matchesFilters));
  const withPrice = filtered.filter((row) => parsePrice(row.price_usd)).length;
  const withShop = filtered.filter((row) => getShopInfo(row).url).length;
  const activeCount = filtered.filter((row) => isLikelyActive(row)).length;
  const eolCount = filtered.filter((row) => isEol(row)).length;
  const retrievedAt = compactValue(filtered[0]?.dataset_retrieved_at || state.rows[0]?.dataset_retrieved_at, '');

  app.innerHTML = `
    <main class="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8">
      <header class="panel relative overflow-hidden p-5 sm:p-6">
        <div class="absolute inset-0 -z-10 bg-gradient-to-br from-[#fbf5ed] via-[#f5e8d7] to-[#efdfcc]"></div>
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-[#6a5946]">AR / XR DIRECTORY</p>
        <h1 class="mt-2 font-['Spectral'] text-3xl leading-tight text-[#231c15] sm:text-4xl">Vergleich fuer AR-Brillen und XR-Glasses</h1>
        <p class="mt-3 max-w-4xl text-sm text-[#655543] sm:text-base">
          Karten- und Tabellenansicht fuer aktuelle und historische Brillen mit Spezifikationen, Preisen, Lifecycle, EOL und Shop-Links.
        </p>
        <p class="mt-2 text-xs text-[#72614f]">Datenstand: ${escapeHtml(retrievedAt ? formatDate(retrievedAt) : 'k. A.')}</p>
      </header>

      <section class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <p class="soft-panel p-3 text-sm text-[#6a5947]"><strong class="text-[#231c15]">${filtered.length}</strong> sichtbare Modelle</p>
        <p class="soft-panel p-3 text-sm text-[#6a5947]"><strong class="text-[#231c15]">${withPrice}</strong> mit Preis</p>
        <p class="soft-panel p-3 text-sm text-[#6a5947]"><strong class="text-[#231c15]">${withShop}</strong> mit Shop-Link</p>
        <p class="soft-panel p-3 text-sm text-[#6a5947]"><strong class="text-[#231c15]">${activeCount}</strong> aktiv / unklar aktiv</p>
        <p class="soft-panel p-3 text-sm text-[#6a5947]"><strong class="text-[#231c15]">${eolCount}</strong> EOL / discontinued</p>
      </section>

      <section class="panel mt-4 p-4 sm:p-5">
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#6a5946]">Suche</span>
            <input id="query-input" type="search" class="field" placeholder="Modell, Hersteller, Software, Tracking" value="${escapeHtml(state.query)}" />
          </label>

          <label class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#6a5946]">Kategorie</span>
            <select id="category-filter" class="field">
              <option value="all"${state.category === 'all' ? ' selected' : ''}>Alle Kategorien</option>
              <option value="AR"${state.category === 'AR' ? ' selected' : ''}>AR</option>
              <option value="XR"${state.category === 'XR' ? ' selected' : ''}>XR</option>
            </select>
          </label>

          <label class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#6a5946]">Hersteller</span>
            <select id="manufacturer-filter" class="field">
              ${optionList(filterOptions.manufacturers, state.manufacturer, 'Alle Hersteller')}
            </select>
          </label>

          <label class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#6a5946]">Display-Typ</span>
            <select id="display-filter" class="field">
              ${optionList(filterOptions.displayTypes, state.displayType, 'Alle Display-Arten')}
            </select>
          </label>

          <label class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#6a5946]">Aktiver Vertrieb</span>
            <select id="active-filter" class="field">
              ${optionList(filterOptions.activeStatuses, state.active, 'Alle Vertrieb-Status')}
            </select>
          </label>

          <label class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#6a5946]">EOL / Update-Status</span>
            <select id="eol-filter" class="field">
              ${optionList(filterOptions.eolStatuses, state.eol, 'Alle Lifecycle-Status')}
            </select>
          </label>

          <label class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#6a5946]">Min. FOV horizontal (deg)</span>
            <input id="fov-filter" type="number" min="0" step="1" class="field" value="${escapeHtml(state.minFov)}" placeholder="z. B. 40" />
          </label>

          <label class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#6a5946]">Min. Refresh (Hz)</span>
            <input id="refresh-filter" type="number" min="0" step="1" class="field" value="${escapeHtml(state.minRefresh)}" placeholder="z. B. 60" />
          </label>

          <label class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#6a5946]">Max. Preis (USD)</span>
            <input id="price-filter" type="number" min="0" step="1" class="field" value="${escapeHtml(state.maxPrice)}" placeholder="z. B. 1500" />
          </label>

          <label class="space-y-1">
            <span class="text-xs font-semibold uppercase tracking-[0.14em] text-[#6a5946]">Sortierung</span>
            <select id="sort-filter" class="field">
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
              ? 'border-[#9d491c] bg-[#9d491c] text-[#fff8f0] hover:bg-[#8d4017]'
              : 'border-[#ceb99f] bg-white text-[#2b2118] hover:bg-[#f5ece0]'
          }">Cards</button>
          <button id="view-table" class="chip-btn ${
            state.viewMode === 'table'
              ? 'border-[#9d491c] bg-[#9d491c] text-[#fff8f0] hover:bg-[#8d4017]'
              : 'border-[#ceb99f] bg-white text-[#2b2118] hover:bg-[#f5ece0]'
          }">Tabelle</button>
          <label class="chip-btn border-[#ceb99f] bg-white text-[#2b2118] hover:bg-[#f5ece0]">
            <input id="only-price" type="checkbox" class="mr-2 size-4 accent-[#9d491c]" ${state.onlyPrice ? 'checked' : ''} />
            Nur mit Preis
          </label>
          <label class="chip-btn border-[#ceb99f] bg-white text-[#2b2118] hover:bg-[#f5ece0]">
            <input id="only-shop" type="checkbox" class="mr-2 size-4 accent-[#9d491c]" ${state.onlyShop ? 'checked' : ''} />
            Nur mit Shop-Link
          </label>
          <button id="clear-filters" class="chip-btn border-[#ceb99f] bg-white text-[#2b2118] hover:bg-[#f5ece0]">Filter zuruecksetzen</button>
        </div>
      </section>

      <section class="mt-4">
        ${
          filtered.length === 0
            ? '<p class="panel p-10 text-center text-sm text-[#6f5f4c]">Keine Treffer fuer die gewaehlten Filter.</p>'
            : state.viewMode === 'cards'
              ? `<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">${filtered.map(cardTemplate).join('')}</div>`
              : tableTemplate(filtered)
        }
      </section>
    </main>
  `;

  const setAndRender = (key, value) => {
    state[key] = value;
    render();
  };

  document.querySelector('#query-input')?.addEventListener('input', (event) => setAndRender('query', event.target.value));
  document
    .querySelector('#category-filter')
    ?.addEventListener('change', (event) => setAndRender('category', event.target.value));
  document
    .querySelector('#manufacturer-filter')
    ?.addEventListener('change', (event) => setAndRender('manufacturer', event.target.value));
  document
    .querySelector('#display-filter')
    ?.addEventListener('change', (event) => setAndRender('displayType', event.target.value));
  document
    .querySelector('#active-filter')
    ?.addEventListener('change', (event) => setAndRender('active', event.target.value));
  document.querySelector('#eol-filter')?.addEventListener('change', (event) => setAndRender('eol', event.target.value));
  document.querySelector('#fov-filter')?.addEventListener('input', (event) => setAndRender('minFov', event.target.value));
  document
    .querySelector('#refresh-filter')
    ?.addEventListener('input', (event) => setAndRender('minRefresh', event.target.value));
  document
    .querySelector('#price-filter')
    ?.addEventListener('input', (event) => setAndRender('maxPrice', event.target.value));
  document.querySelector('#sort-filter')?.addEventListener('change', (event) => setAndRender('sort', event.target.value));
  document.querySelector('#only-price')?.addEventListener('change', (event) => setAndRender('onlyPrice', event.target.checked));
  document.querySelector('#only-shop')?.addEventListener('change', (event) => setAndRender('onlyShop', event.target.checked));
  document.querySelector('#view-cards')?.addEventListener('click', () => setAndRender('viewMode', 'cards'));
  document.querySelector('#view-table')?.addEventListener('click', () => setAndRender('viewMode', 'table'));
  document.querySelector('#clear-filters')?.addEventListener('click', () => {
    state.query = '';
    state.category = 'all';
    state.manufacturer = 'all';
    state.displayType = 'all';
    state.active = 'all';
    state.eol = 'all';
    state.minFov = '';
    state.minRefresh = '';
    state.maxPrice = '';
    state.onlyPrice = false;
    state.onlyShop = false;
    state.sort = 'name_asc';
    render();
  });
};

const parseCsv = (text) =>
  new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => resolve(data),
      error: reject,
    });
  });

const init = async () => {
  app.innerHTML = '<main class="mx-auto max-w-[1320px] px-4 py-8"><p class="panel p-6 text-sm text-[#6d5c49]">Lade Brillendaten...</p></main>';

  try {
    const response = await fetch('/data/ar_glasses.csv', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`CSV request failed with status ${response.status}`);
    }
    const csv = await response.text();
    state.rows = await parseCsv(csv);
    render();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    app.innerHTML = `
      <main class="mx-auto max-w-[1320px] px-4 py-8">
        <p class="panel border-[#d8b6a2] bg-[#fdeee6] p-6 text-sm font-semibold text-[#7b2d0b]">Daten konnten nicht geladen werden.</p>
        <p class="mt-3 text-sm text-[#6d5c49]">${escapeHtml(message)}</p>
      </main>
    `;
  }
};

init();
