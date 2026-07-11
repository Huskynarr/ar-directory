import { escapeHtml, safeExternalUrl } from '../utils.js';
import { state } from '../state.js';
import { t, compactValue, formatPrice, formatDate, formatLifecycleNotes, maybeHiddenText } from '../i18n.js';
import { getShopInfo, isRecentRelease } from '../data/model.js';
import { AFFILIATE_REL, buildBuyLinks, getAffiliateOverrides } from '../affiliate.js';
import { getModelImageUrl } from './image.js';
import { categoryTone, lifecycleTone, selectionLabelTemplate, buildCardFacts } from './shared.js';

export const cardTemplate = (row) => {
  const name = escapeHtml(compactValue(row.name, t('Unbekanntes Modell', 'Unknown model')));
  const manufacturer = escapeHtml(compactValue(row.manufacturer, t('Unbekannt', 'Unknown')));
  const category = escapeHtml(compactValue(row.xr_category, 'AR'));
  const image = safeExternalUrl(row.image_url) || getModelImageUrl(row);
  const shop = getShopInfo(row);
  const buyLinks = buildBuyLinks(row, getAffiliateOverrides());
  const shopButtonClasses = shop.official
    ? 'chip-btn border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
    : 'chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]';
  const lifecycleClasses = lifecycleTone(row);
  const eolDate = row.eol_date ? formatDate(row.eol_date) : t('k. A.', 'n/a');
  const releaseDate = formatDate(row.release_date || row.announced_date);
  const lifecycleSourceUrl = safeExternalUrl(row.lifecycle_source);
  const infoUrl = lifecycleSourceUrl || safeExternalUrl(row.source_page);
  const isSelected = state.selectedIds.includes(row.__rowId);
  const isFavorite = state.favorites.includes(row.__rowId);
  const facts = buildCardFacts(row);
  const primaryFacts = facts.slice(0, 6);
  const secondaryFacts = facts.slice(6);
  const lifecycleNotes = formatLifecycleNotes(row.lifecycle_notes, t('Keine Angaben.', 'No details.'));
  const lifecycleSource = maybeHiddenText(row.lifecycle_source, '');
  const showLifecycleSourceInInfo = Boolean(lifecycleSource && !lifecycleSourceUrl);

  return `
    <article class="panel group overflow-hidden transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[#84cc16]/50 hover:ring-1 hover:ring-[#84cc16]/30 hover:shadow-lg hover:shadow-black/30" data-model-card="${escapeHtml(row.__rowId)}">
      <div class="relative h-44 cursor-pointer overflow-hidden border-b border-[#44403c]/60 bg-[#131b26]" data-detail-open="${escapeHtml(row.__rowId)}">
        ${
          image
            ? `<img src="${escapeHtml(image)}" alt="${name}" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="h-full w-full object-contain p-4 transition duration-300 ease-out group-hover:scale-[1.03] group-hover:brightness-105" />`
            : `<div class="grid h-full place-items-center text-sm text-[#a8a29e]">${t('Kein Bild verfügbar', 'No image available')}</div>`
        }
        <div class="absolute left-3 top-3 flex items-center gap-1.5" onclick="event.stopPropagation()">${selectionLabelTemplate(
          row.__rowId,
          isSelected,
          compactValue(row.name, t('Unbekannt', 'Unknown')),
        )}
        <button
          data-favorite-toggle="${escapeHtml(row.__rowId)}"
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#44403c] bg-[#1c1917] text-lg transition hover:border-[var(--brand)] ${isFavorite ? 'text-[var(--brand)]' : 'text-[#a8a29e]'}"
          aria-label="${escapeHtml(isFavorite ? t('Favorit entfernen', 'Remove favorite') : t('Als Favorit merken', 'Add to favorites'))}"
        >${isFavorite ? '&#9733;' : '&#9734;'}</button>
        </div>
        <span class="absolute right-3 top-3 rounded-full border px-2.5 py-1 text-xs font-bold ${categoryTone(row.xr_category)}">${category}</span>
        ${
          isRecentRelease(row)
            ? `<span class="absolute bottom-3 left-3 rounded-full border border-lime-400/50 bg-lime-400/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-lime-200">${t('Neu', 'New')}</span>`
            : ''
        }
      </div>
      <div class="space-y-5 p-5">
        <div class="space-y-1.5">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#a8a29e]">${manufacturer}</p>
          <h2 class="font-semibold text-2xl leading-tight text-[#f5f5f4]"><button type="button" data-detail-open="${escapeHtml(row.__rowId)}" class="text-left underline-offset-4 transition-colors hover:text-[#84cc16] hover:underline focus-visible:text-[#84cc16] focus-visible:underline">${name}</button></h2>
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

        <div class="rounded-lg border-l-[3px] py-2 pl-3.5 pr-2 text-sm ${lifecycleClasses}">
          <p class="text-[11px] font-semibold uppercase tracking-[0.12em]">${t('Updates / EOL', 'Updates / EOL')}</p>
          <p class="mt-1 font-semibold">${escapeHtml(compactValue(row.eol_status))}</p>
          ${row.eol_date ? `<p class="mt-1 text-xs">${t('EOL-Datum', 'EOL date')}: ${escapeHtml(eolDate)}</p>` : ''}
          ${lifecycleNotes ? `<p class="mt-2 text-xs leading-relaxed">${escapeHtml(lifecycleNotes)}</p>` : ''}
          ${
            showLifecycleSourceInInfo
              ? `<p class="mt-2 text-[11px] leading-relaxed">${t('Quelle', 'Source')}: ${escapeHtml(lifecycleSource)}</p>`
              : ''
          }
        </div>

        <div class="flex flex-wrap gap-2">
          ${
            shop.url
              ? `<a href="${escapeHtml(shop.url)}" target="_blank" rel="noreferrer" class="${shopButtonClasses}">${escapeHtml(shop.label)}</a>`
              : `<span class="chip-btn cursor-not-allowed border-[#44403c] bg-[#292524] text-[#a8a29e]">${t(
                  'Herstellerlink fehlt',
                  'No manufacturer link',
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
          ${buyLinks
            .map(
              (l) =>
                `<a href="${escapeHtml(l.url)}" target="_blank" rel="${AFFILIATE_REL}" class="chip-btn affiliate-link"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 8H7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="20" r="1.2" fill="currentColor"/><circle cx="17" cy="20" r="1.2" fill="currentColor"/></svg>${escapeHtml(
                  l.label,
                )}</a>`,
            )
            .join('')}
        </div>
        <p class="text-xs text-[#a8a29e]">${escapeHtml(shop.source)}${
          buyLinks.length ? ` · <span title="Affiliate">*</span> ${escapeHtml(t('Affiliate-Links', 'Affiliate links'))}` : ''
        }</p>
      </div>
    </article>
  `;
};
