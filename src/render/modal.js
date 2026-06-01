import { escapeHtml, safeExternalUrl } from '../utils.js';
import { state, toggleFavorite } from '../state.js';
import { t, compactValue, formatPrice, formatDate, formatLifecycleNotes } from '../i18n.js';
import { getShopInfo } from '../data/model.js';
import { getModelImageUrl } from './image.js';
import { lifecycleTone, buildCardFacts } from './shared.js';
import { requestRender } from './registry.js';

const detailModalTemplate = (row) => {
  if (!row) return '';
  const name = escapeHtml(compactValue(row.name, t('Unbekanntes Modell', 'Unknown model')));
  const manufacturer = escapeHtml(compactValue(row.manufacturer, t('Unbekannt', 'Unknown')));
  const image = safeExternalUrl(row.image_url) || getModelImageUrl(row);
  const shop = getShopInfo(row);
  const isFavorite = state.favorites.includes(row.__rowId);
  const allFacts = buildCardFacts(row);
  const lifecycleNotes = formatLifecycleNotes(row.lifecycle_notes, t('Keine Angaben.', 'No details.'));
  const infoUrl = safeExternalUrl(row.lifecycle_source) || safeExternalUrl(row.source_page);
  return `
    <div id="detail-modal" class="detail-modal-overlay" role="dialog" aria-modal="true" aria-label="${name}">
      <div class="detail-modal-content panel p-0 overflow-hidden">
        <div class="flex items-center justify-between border-b border-[#44403c] bg-[#1c1917] px-5 py-4">
          <div><p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#a8a29e]">${manufacturer}</p><h2 class="mt-1 text-xl font-bold text-[#f5f5f4]">${name}</h2></div>
          <div class="flex items-center gap-2">
            <button data-favorite-toggle="${escapeHtml(row.__rowId)}" type="button" class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#44403c] bg-[#1c1917] text-xl transition hover:border-amber-400/60 ${isFavorite ? 'text-amber-400' : 'text-[#a8a29e]'}">${isFavorite ? '&#9733;' : '&#9734;'}</button>
            <button id="close-detail-modal" type="button" class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#44403c] bg-[#1c1917] text-lg text-[#a8a29e] hover:bg-[#292524]" aria-label="${t('Schliessen', 'Close')}">&#10005;</button>
          </div>
        </div>
        <div class="max-h-[75vh] overflow-y-auto">
          ${image ? `<div class="flex items-center justify-center border-b border-[#44403c] bg-[#171412] p-6"><img src="${escapeHtml(image)}" alt="${name}" class="max-h-64 object-contain" /></div>` : ''}
          <div class="space-y-4 p-5">
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div class="soft-panel p-3"><p class="text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">${t('Preis', 'Price')}</p><p class="mt-1 font-semibold text-[#f5f5f4]">${escapeHtml(formatPrice(row.price_usd))}</p></div>
              <div class="soft-panel p-3"><p class="text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">${t('Release', 'Release')}</p><p class="mt-1 font-semibold text-[#f5f5f4]">${escapeHtml(formatDate(row.release_date || row.announced_date))}</p></div>
              <div class="soft-panel p-3"><p class="text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">${t('Kategorie', 'Category')}</p><p class="mt-1 font-semibold text-[#f5f5f4]">${escapeHtml(compactValue(row.xr_category, 'AR'))}</p></div>
            </div>
            <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              ${allFacts.map((f) => `<div><dt class="text-xs text-[#a8a29e]">${escapeHtml(f.label)}</dt><dd class="mt-0.5 font-medium text-[#f5f5f4]">${escapeHtml(f.value)}</dd></div>`).join('')}
            </dl>
            <div class="rounded-2xl border p-3 text-sm ${lifecycleTone(row)}">
              <p class="text-[11px] font-semibold uppercase tracking-[0.12em]">${t('Updates / EOL', 'Updates / EOL')}</p>
              <p class="mt-1 font-semibold">${escapeHtml(compactValue(row.eol_status))}</p>
              ${lifecycleNotes ? `<p class="mt-2 text-xs leading-relaxed">${escapeHtml(lifecycleNotes)}</p>` : ''}
            </div>
            <div class="flex flex-wrap gap-2">
              ${shop.url ? `<a href="${escapeHtml(shop.url)}" target="_blank" rel="noreferrer" class="chip-btn ${shop.official ? 'border-[#84cc16] bg-[#84cc16] text-[#0c0a09]' : 'border-[#44403c] bg-[#1c1917] text-[#f5f5f4]'}">${escapeHtml(shop.label)}</a>` : ''}
              ${infoUrl ? `<a href="${escapeHtml(infoUrl)}" target="_blank" rel="noreferrer" class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4]">${t('Datenquelle', 'Data source')}</a>` : ''}
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
