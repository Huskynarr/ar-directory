import { escapeHtml, safeExternalUrl } from '../utils.js';
import { state } from '../state.js';
import { t, compactValue, formatPrice, formatNumber, formatLifecycleNotes, maybeHiddenText } from '../i18n.js';
import { getShopInfo } from '../data/model.js';
import { AFFILIATE_REL, buildBuyLinks, getAffiliateOverrides } from '../affiliate.js';
import { categoryTone, selectionLabelTemplate, buildFovFact } from './shared.js';

const na = () => t('k. A.', 'n/a');

export const tableTemplate = (rows) => {
  if (!rows.length) {
    return `<p class="panel p-8 text-center text-sm text-[#a8a29e]">${t(
      'Keine Ergebnisse für diese Filter.',
      'No results for these filters.',
    )}</p>`;
  }

  const headCells = [
    t('Kat.', 'Cat.'),
    t('Preis', 'Price'),
    'Display',
    t('Optik', 'Optics'),
    'FOV',
    t('Refresh', 'Refresh'),
    t('Auflösung', 'Resolution'),
    t('Gewicht', 'Weight'),
    t('Tracking', 'Tracking'),
    'Eye',
    'Hand',
    'Passthrough',
    t('Vertrieb', 'Distribution'),
    t('EOL / Updates', 'EOL / Updates'),
    t('Software', 'Software'),
    t('Compute', 'Compute'),
    t('Links', 'Links'),
  ];

  return `
    <div class="panel overflow-hidden">
      <div class="overflow-x-auto">
        <table class="ui-table min-w-[1700px] w-full border-collapse text-sm" data-table-density="${state.focusMode ? 'compact' : 'comfortable'}" aria-describedby="results-status">
          <caption class="visually-hidden">${t(
            'Tabellarische Ansicht aller gefilterten AR- und XR-Modelle.',
            'Table view of all filtered AR and XR models.',
          )}</caption>
          <thead class="bg-[#1c1917] text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a8a29e]">
            <tr>
              <th class="sticky left-0 z-20 bg-[#1c1917] px-3 py-2.5 min-w-[230px]">${t('Modell', 'Model')}</th>
              ${headCells.map((label) => `<th class="whitespace-nowrap px-3 py-2.5">${escapeHtml(label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((row, index) => {
                const shop = getShopInfo(row);
                const buyLinks = buildBuyLinks(row, getAffiliateOverrides());
                const infoUrl = safeExternalUrl(row.lifecycle_source || row.source_page);
                const selected = state.selectedIds.includes(row.__rowId);
                const lifecycleNotes = formatLifecycleNotes(row.lifecycle_notes, t('Keine Angaben.', 'No details.'));
                const modelName = compactValue(row.name, t('Unbekannt', 'Unknown'));
                const rowBg = index % 2 === 0 ? 'bg-[#171412]' : 'bg-[#1c1917]';

                return `
                  <tr class="${rowBg} group align-top text-[#f5f5f4] transition hover:brightness-125">
                    <td class="sticky left-0 z-10 ${rowBg} border-r border-[#292524] px-3 py-2.5 align-middle">
                      <div class="flex items-center gap-2.5">
                        ${selectionLabelTemplate(row.__rowId, selected, modelName)}
                        <button type="button" data-detail-open="${escapeHtml(row.__rowId)}" class="min-w-0 text-left">
                          <p class="truncate font-semibold hover:underline">${escapeHtml(modelName)}</p>
                          <p class="truncate text-xs text-[#a8a29e]">${escapeHtml(compactValue(row.manufacturer))}</p>
                        </button>
                      </div>
                    </td>
                    <td class="px-3 py-2.5">
                      <span class="rounded-full border px-2 py-0.5 text-xs font-semibold ${categoryTone(row.xr_category)}">${escapeHtml(
                        compactValue(row.xr_category, 'AR'),
                      )}</span>
                    </td>
                    <td class="whitespace-nowrap px-3 py-2.5 font-semibold">${escapeHtml(formatPrice(row.price_usd))}</td>
                    <td class="px-3 py-2.5">${escapeHtml(maybeHiddenText(row.display_type) || na())}</td>
                    <td class="px-3 py-2.5">${escapeHtml(maybeHiddenText(row.optics) || na())}</td>
                    <td class="whitespace-nowrap px-3 py-2.5">${escapeHtml(buildFovFact(row).value)}</td>
                    <td class="whitespace-nowrap px-3 py-2.5">${escapeHtml(formatNumber(row.refresh_hz, ' Hz'))}</td>
                    <td class="whitespace-nowrap px-3 py-2.5">${escapeHtml(compactValue(row.resolution_per_eye, na()))}</td>
                    <td class="whitespace-nowrap px-3 py-2.5">${escapeHtml(formatNumber(row.weight_g, ' g'))}</td>
                    <td class="px-3 py-2.5">${escapeHtml(maybeHiddenText(row.tracking) || na())}</td>
                    <td class="px-3 py-2.5">${escapeHtml(maybeHiddenText(row.eye_tracking) || na())}</td>
                    <td class="px-3 py-2.5">${escapeHtml(maybeHiddenText(row.hand_tracking) || na())}</td>
                    <td class="px-3 py-2.5">${escapeHtml(maybeHiddenText(row.passthrough) || na())}</td>
                    <td class="px-3 py-2.5">${escapeHtml(compactValue(row.active_distribution, na()))}</td>
                    <td class="px-3 py-2.5 min-w-[200px]">
                      <p class="font-semibold">${escapeHtml(compactValue(row.eol_status))}</p>
                      ${lifecycleNotes ? `<p class="mt-1 text-xs text-[#a8a29e]">${escapeHtml(lifecycleNotes)}</p>` : ''}
                    </td>
                    <td class="px-3 py-2.5">${escapeHtml(maybeHiddenText(row.software) || na())}</td>
                    <td class="px-3 py-2.5">${escapeHtml(maybeHiddenText(row.compute_unit) || na())}</td>
                    <td class="px-3 py-2.5">
                      <div class="flex flex-col gap-1.5 whitespace-nowrap">
                        ${
                          shop.url
                            ? `<a href="${escapeHtml(shop.url)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(`${shop.label}: ${modelName}`)}" class="text-xs font-semibold text-[#84cc16] hover:underline">${escapeHtml(shop.label)}</a>`
                            : `<span class="text-xs text-[#a8a29e]">${t('Kein Herstellerlink', 'No manufacturer link')}</span>`
                        }
                        ${
                          buyLinks.length
                            ? `<a href="${escapeHtml(buyLinks[0].url)}" target="_blank" rel="${AFFILIATE_REL}" aria-label="${escapeHtml(`${buyLinks[0].label}: ${modelName}`)}" class="text-xs font-semibold text-[var(--text)] hover:text-[var(--brand)] hover:underline">${escapeHtml(buyLinks[0].label)} *</a>`
                            : ''
                        }
                        ${
                          infoUrl
                            ? `<a href="${escapeHtml(infoUrl)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(`${t('Quelle', 'Source')}: ${modelName}`)}" class="text-xs text-[#a8a29e] hover:underline">${t('Quelle', 'Source')}</a>`
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
