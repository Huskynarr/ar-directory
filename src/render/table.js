import { escapeHtml, safeExternalUrl } from '../utils.js';
import { state } from '../state.js';
import { t, compactValue, formatPrice, formatNumber, formatLifecycleNotes, maybeHiddenText } from '../i18n.js';
import { getShopInfo } from '../data/model.js';
import { categoryTone, selectionLabelTemplate } from './shared.js';

export const tableTemplate = (rows) => {
  if (!rows.length) {
    return `<p class="panel p-8 text-center text-sm text-[#a8a29e]">${t(
      'Keine Ergebnisse fuer diese Filter.',
      'No results for these filters.',
    )}</p>`;
  }

  return `
    <div class="panel overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-[1950px] border-collapse text-sm" aria-describedby="results-status">
          <caption class="visually-hidden">${t(
            'Tabellarische Ansicht aller gefilterten AR- und XR-Modelle.',
            'Table view of all filtered AR and XR models.',
          )}</caption>
          <thead class="bg-[#1c1917] text-left text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">
            <tr>
              <th class="px-3 py-3">${t('Vergleich', 'Compare')}</th>
              <th class="px-3 py-3">${t('Brille', 'Glasses')}</th>
              <th class="px-3 py-3">${t('Hersteller', 'Manufacturer')}</th>
              <th class="px-3 py-3">${t('Kat.', 'Cat.')}</th>
              <th class="px-3 py-3">Display</th>
              <th class="px-3 py-3">${t('Optik', 'Optics')}</th>
              <th class="px-3 py-3">${t('Tracking', 'Tracking')}</th>
              <th class="px-3 py-3">Eye</th>
              <th class="px-3 py-3">Hand</th>
              <th class="px-3 py-3">Passthrough</th>
              <th class="px-3 py-3">FOV H</th>
              <th class="px-3 py-3">${t('Refresh', 'Refresh')}</th>
              <th class="px-3 py-3">${t('Aufloesung', 'Resolution')}</th>
              <th class="px-3 py-3">${t('Gewicht', 'Weight')}</th>
              <th class="px-3 py-3">${t('Preis', 'Price')}</th>
              <th class="px-3 py-3">${t('Vertrieb', 'Distribution')}</th>
              <th class="px-3 py-3">${t('EOL / Updates', 'EOL / Updates')}</th>
              <th class="px-3 py-3">${t('Software', 'Software')}</th>
              <th class="px-3 py-3">${t('Compute', 'Compute')}</th>
              <th class="px-3 py-3">${t('Links', 'Links')}</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((row, index) => {
                const shop = getShopInfo(row);
                const infoUrl = safeExternalUrl(row.lifecycle_source || row.source_page);
                const selected = state.selectedIds.includes(row.__rowId);
                const lifecycleNotes = formatLifecycleNotes(row.lifecycle_notes, t('Keine Angaben.', 'No details.'));
                const modelName = compactValue(row.name, t('Unbekannt', 'Unknown'));

                return `
                  <tr class="${index % 2 === 0 ? 'bg-[#171412]' : 'bg-[#1c1917]'} align-top text-[#f5f5f4]">
                    <td class="px-3 py-3">${selectionLabelTemplate(
                      row.__rowId,
                      selected,
                      modelName,
                    )}</td>
                    <td class="px-3 py-3">
                      <p class="font-semibold">${escapeHtml(modelName)}</p>
                      <p class="mt-1 text-xs text-[#a8a29e]">${escapeHtml(
                        maybeHiddenText(row.resolution_per_eye, t('k. A.', 'n/a')) || t('k. A.', 'n/a'),
                      )}</p>
                    </td>
                    <td class="px-3 py-3">${escapeHtml(compactValue(row.manufacturer))}</td>
                    <td class="px-3 py-3">
                      <span class="rounded-full border px-2 py-1 text-xs font-semibold ${categoryTone(row.xr_category)}">${escapeHtml(
                        compactValue(row.xr_category, 'AR'),
                      )}</span>
                    </td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.display_type) || t('k. A.', 'n/a'))}</td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.optics) || t('k. A.', 'n/a'))}</td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.tracking) || t('k. A.', 'n/a'))}</td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.eye_tracking) || t('k. A.', 'n/a'))}</td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.hand_tracking) || t('k. A.', 'n/a'))}</td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.passthrough) || t('k. A.', 'n/a'))}</td>
                    <td class="px-3 py-3">${escapeHtml(formatNumber(row.fov_horizontal_deg, ' deg'))}</td>
                    <td class="px-3 py-3">${escapeHtml(formatNumber(row.refresh_hz, ' Hz'))}</td>
                    <td class="px-3 py-3">${escapeHtml(compactValue(row.resolution_per_eye, t('k. A.', 'n/a')))}</td>
                    <td class="px-3 py-3">${escapeHtml(formatNumber(row.weight_g, ' g'))}</td>
                    <td class="px-3 py-3">${escapeHtml(formatPrice(row.price_usd))}</td>
                    <td class="px-3 py-3">${escapeHtml(compactValue(row.active_distribution, t('k. A.', 'n/a')))}</td>
                    <td class="px-3 py-3">
                      <p class="font-semibold">${escapeHtml(compactValue(row.eol_status))}</p>
                      ${lifecycleNotes ? `<p class="mt-1 text-xs text-[#a8a29e]">${escapeHtml(lifecycleNotes)}</p>` : ''}
                    </td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.software) || t('k. A.', 'n/a'))}</td>
                    <td class="px-3 py-3">${escapeHtml(maybeHiddenText(row.compute_unit) || t('k. A.', 'n/a'))}</td>
                    <td class="px-3 py-3">
                      <div class="flex flex-col gap-2">
                        ${
                          shop.url
                            ? `<a
                                href="${escapeHtml(shop.url)}"
                                target="_blank"
                                rel="noreferrer"
                                aria-label="${escapeHtml(`${shop.label}: ${modelName}`)}"
                                class="text-xs font-semibold text-[#84cc16] hover:underline"
                              >${escapeHtml(shop.label)}</a>`
                            : `<span class="text-xs text-[#a8a29e]">${t('Kein Shop-Link', 'No shop link')}</span>`
                        }
                        ${
                          infoUrl
                            ? `<a
                                href="${escapeHtml(infoUrl)}"
                                target="_blank"
                                rel="noreferrer"
                                aria-label="${escapeHtml(`${t('Quelle', 'Source')}: ${modelName}`)}"
                                class="text-xs font-semibold text-[#84cc16] hover:underline"
                              >${t(
                                'Quelle',
                                'Source',
                              )}</a>`
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
