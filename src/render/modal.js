import { escapeHtml, safeExternalUrl } from '../utils.js';
import { state, toggleFavorite } from '../state.js';
import { t, compactValue, formatPrice, formatDate, formatLifecycleNotes } from '../i18n.js';
import { getShopInfo } from '../data/model.js';
import { AFFILIATE_REL, buildBuyLinks, getAffiliateOverrides } from '../affiliate.js';
import { getModelImageUrl } from './image.js';
import { lifecycleTone, buildCardFacts } from './shared.js';
import { requestRender } from './registry.js';

// Groups the flat fact list from buildCardFacts() into labelled sections for a
// cleaner information hierarchy. Any fact whose label is not explicitly mapped
// falls through to "Weitere Daten" so no data is ever dropped.
const groupFacts = (facts) => {
  const groupDefs = [
    {
      title: t('Display & Optik', 'Display & optics'),
      labels: ['Display', t('Optik', 'Optics'), t('Aufloesung', 'Resolution'), 'FOV H', 'FOV V', t('Refresh', 'Refresh')],
    },
    {
      title: t('Tracking', 'Tracking'),
      labels: [t('Tracking', 'Tracking'), t('Eye Tracking', 'Eye Tracking'), t('Hand Tracking', 'Hand Tracking'), t('Passthrough', 'Passthrough')],
    },
    {
      title: t('System & Bauform', 'System & build'),
      labels: [t('Compute', 'Compute'), t('Software', 'Software'), t('Gewicht', 'Weight')],
    },
  ];
  const used = new Set();
  const groups = groupDefs
    .map((def) => {
      const items = facts.filter((f) => def.labels.includes(f.label));
      items.forEach((f) => used.add(f));
      return { title: def.title, items };
    })
    .filter((g) => g.items.length);
  const rest = facts.filter((f) => !used.has(f));
  if (rest.length) {
    groups.push({ title: t('Weitere Daten', 'Further data'), items: rest });
  }
  return groups;
};

const factRowsTemplate = (items) =>
  items
    .map(
      (f, i) => `
        <div class="flex items-baseline justify-between gap-4 px-3 py-2 ${i % 2 ? '' : 'bg-[#171412]'}">
          <dt class="text-xs text-[#a8a29e]">${escapeHtml(f.label)}</dt>
          <dd class="text-right text-sm font-medium text-[#f5f5f4]">${escapeHtml(f.value)}</dd>
        </div>`,
    )
    .join('');

const detailModalTemplate = (row) => {
  if (!row) return '';
  const name = escapeHtml(compactValue(row.name, t('Unbekanntes Modell', 'Unknown model')));
  const manufacturer = escapeHtml(compactValue(row.manufacturer, t('Unbekannt', 'Unknown')));
  const category = escapeHtml(compactValue(row.xr_category, 'AR'));
  const image = safeExternalUrl(row.image_url) || getModelImageUrl(row);
  const shop = getShopInfo(row);
  const buyLinks = buildBuyLinks(row, getAffiliateOverrides());
  const editorial = (state.descriptions || {})[row.id] || {};
  const isFavorite = state.favorites.includes(row.__rowId);
  const factGroups = groupFacts(buildCardFacts(row));
  const lifecycleNotes = formatLifecycleNotes(row.lifecycle_notes, t('Keine Angaben.', 'No details.'));
  const infoUrl = safeExternalUrl(row.lifecycle_source) || safeExternalUrl(row.source_page);
  return `
    <div id="detail-modal" class="detail-modal-overlay backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="${name}">
      <div class="detail-modal-content panel p-0 overflow-hidden shadow-2xl ring-1 ring-white/5">
        <div class="flex items-start justify-between gap-3 border-b border-[#44403c] bg-[#1c1917] px-5 py-4">
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#a8a29e]">${manufacturer}</p>
            <h2 class="mt-1 truncate text-xl font-bold text-[#f5f5f4]">${name}</h2>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button data-favorite-toggle="${escapeHtml(row.__rowId)}" type="button" aria-pressed="${isFavorite ? 'true' : 'false'}" aria-label="${escapeHtml(isFavorite ? t('Favorit entfernen', 'Remove favorite') : t('Als Favorit merken', 'Add to favorites'))}" class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#44403c] bg-[#1c1917] text-xl transition hover:border-amber-400/60 ${isFavorite ? 'text-amber-400' : 'text-[#a8a29e]'}">${isFavorite ? '&#9733;' : '&#9734;'}</button>
            <button id="close-detail-modal" type="button" class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#44403c] bg-[#1c1917] text-lg text-[#a8a29e] transition hover:border-[#57534e] hover:bg-[#292524] hover:text-[#f5f5f4]" aria-label="${t('Schliessen', 'Close')}">&#10005;</button>
          </div>
        </div>
        <div class="max-h-[75vh] overflow-y-auto">
          <div class="flex items-center justify-center border-b border-[#44403c] bg-gradient-to-br from-[#171412] to-[#0c0a09] p-6">
            ${
              image
                ? `<img src="${escapeHtml(image)}" alt="${name}" class="max-h-64 w-auto rounded-xl object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]" />`
                : `<div class="grid h-40 w-full place-items-center rounded-xl border border-dashed border-[#44403c] text-sm text-[#a8a29e]">${t('Kein Bild verfuegbar', 'No image available')}</div>`
            }
          </div>
          <div class="space-y-5 p-5">
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div class="soft-panel p-3"><p class="text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">${t('Preis', 'Price')}</p><p class="mt-1 font-semibold text-[#f5f5f4]">${escapeHtml(formatPrice(row.price_usd))}</p></div>
              <div class="soft-panel p-3"><p class="text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">${t('Release', 'Release')}</p><p class="mt-1 font-semibold text-[#f5f5f4]">${escapeHtml(formatDate(row.release_date || row.announced_date))}</p></div>
              <div class="soft-panel p-3"><p class="text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">${t('Kategorie', 'Category')}</p><p class="mt-1 font-semibold text-[#f5f5f4]">${category}</p></div>
            </div>
            ${editorial.description ? `<p class="text-sm leading-relaxed text-[#d6d3d1]">${escapeHtml(editorial.description)}</p>` : ''}
            ${
              Array.isArray(editorial.highlights) && editorial.highlights.length
                ? `<div class="rounded-2xl border border-[#292524] bg-[#1c1917] p-3"><p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a3e635]">${t('Highlights', 'Highlights')}</p><ul class="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[#f5f5f4]">${editorial.highlights
                    .map((h) => `<li>${escapeHtml(h)}</li>`)
                    .join('')}</ul>${editorial.audience ? `<p class="mt-2 text-xs text-[#a8a29e]">${t('Geeignet fuer', 'Best for')}: ${escapeHtml(editorial.audience)}</p>` : ''}</div>`
                : ''
            }
            ${
              factGroups.length
                ? `<div class="space-y-4">
                    ${factGroups
                      .map(
                        (g) => `
                          <section>
                            <p class="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a29e]"><span class="inline-block h-3 w-1 rounded-full bg-[#84cc16]"></span>${escapeHtml(g.title)}</p>
                            <dl class="overflow-hidden rounded-xl border border-[#292524]">${factRowsTemplate(g.items)}</dl>
                          </section>`,
                      )
                      .join('')}
                  </div>`
                : ''
            }
            <div class="rounded-2xl border p-3 text-sm ${lifecycleTone(row)}">
              <p class="text-[11px] font-semibold uppercase tracking-[0.12em]">${t('Lifecycle', 'Lifecycle')} &middot; ${t('Updates / EOL', 'Updates / EOL')}</p>
              <p class="mt-1 font-semibold">${escapeHtml(compactValue(row.eol_status))}</p>
              ${lifecycleNotes ? `<p class="mt-2 text-xs leading-relaxed">${escapeHtml(lifecycleNotes)}</p>` : ''}
            </div>
            <div class="space-y-3 border-t border-[#292524] pt-4">
              ${
                buyLinks.length
                  ? `<div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">${buyLinks
                      .map(
                        (l) =>
                          `<a href="${escapeHtml(l.url)}" target="_blank" rel="${AFFILIATE_REL}" class="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-400/60 bg-amber-500 px-4 py-2.5 text-sm font-semibold text-[#0c0a09] shadow-sm transition hover:bg-amber-400"><span aria-hidden="true">&#128722;</span>${escapeHtml(l.label)}</a>`,
                      )
                      .join('')}</div>`
                  : ''
              }
              <div class="flex flex-wrap gap-2">
                ${shop.url ? `<a href="${escapeHtml(shop.url)}" target="_blank" rel="noreferrer" class="chip-btn ${shop.official ? 'border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]' : 'border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]'}">${escapeHtml(shop.label)}</a>` : ''}
                ${infoUrl ? `<a href="${escapeHtml(infoUrl)}" target="_blank" rel="noreferrer" class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">${t('Datenquelle', 'Data source')}</a>` : ''}
              </div>
              ${buyLinks.length ? `<p class="text-[11px] text-[#a8a29e]">* ${escapeHtml(t('Affiliate-Links – wir koennen eine Provision erhalten, fuer dich ohne Mehrkosten.', 'Affiliate links – we may earn a commission at no extra cost to you.'))}</p>` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>`;
};

export const openDetailModal = (rowId) => {
  const row = state.rows.find((r) => r.__rowId === rowId);
  if (!row) return;
  document.querySelector('#detail-modal')?.remove();
  const wrapper = document.createElement('div');
  wrapper.innerHTML = detailModalTemplate(row);
  document.body.appendChild(wrapper.firstElementChild);
  const modal = document.querySelector('#detail-modal');
  modal?.querySelector('#close-detail-modal')?.addEventListener('click', () => modal.remove());
  modal?.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal?.querySelectorAll('[data-favorite-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => { toggleFavorite(btn.getAttribute('data-favorite-toggle')); modal.remove(); requestRender(); });
  });
  const escHandler = (e) => { if (e.key === 'Escape') { modal?.remove(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
};
