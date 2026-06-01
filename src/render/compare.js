import { escapeHtml, toNumber, parsePrice, isUnknownValue } from '../utils.js';
import { state, COMPARE_LIMIT, RADAR_COLORS } from '../state.js';
import { t, compactValue, formatPrice, formatDate, formatNumber, formatLifecycleNotes } from '../i18n.js';
import { getHorizontalFov, getTrackingScore } from '../data/model.js';

const compareField = (label, getRaw, formatValue = (row) => compactValue(getRaw(row)), isUnknown = (row) => isUnknownValue(getRaw(row))) => ({
  label,
  formatValue,
  isUnknown,
});

const getCompareFields = () => [
  compareField(t('Hersteller', 'Manufacturer'), (row) => row.manufacturer),
  compareField(t('Kategorie', 'Category'), (row) => row.xr_category, (row) => compactValue(row.xr_category, 'AR')),
  compareField(t('Release', 'Release'), (row) => row.release_date || row.announced_date, (row) => formatDate(row.release_date || row.announced_date)),
  compareField(t('Preis', 'Price'), (row) => row.price_usd, (row) => formatPrice(row.price_usd), (row) => !parsePrice(row.price_usd)),
  compareField('Display', (row) => row.display_type),
  compareField(t('Optik', 'Optics'), (row) => row.optics),
  compareField(t('Tracking', 'Tracking'), (row) => row.tracking),
  compareField('Eye Tracking', (row) => row.eye_tracking),
  compareField('Hand Tracking', (row) => row.hand_tracking),
  compareField('Passthrough', (row) => row.passthrough),
  compareField(t('FOV horizontal', 'FOV horizontal'), (row) => row.fov_horizontal_deg, (row) => formatNumber(row.fov_horizontal_deg, ' deg'), (row) => toNumber(row.fov_horizontal_deg) === null),
  compareField(t('FOV vertikal', 'FOV vertical'), (row) => row.fov_vertical_deg, (row) => formatNumber(row.fov_vertical_deg, ' deg'), (row) => toNumber(row.fov_vertical_deg) === null),
  compareField(t('Refresh', 'Refresh'), (row) => row.refresh_hz, (row) => formatNumber(row.refresh_hz, ' Hz'), (row) => toNumber(row.refresh_hz) === null),
  compareField(t('Aufloesung', 'Resolution'), (row) => row.resolution_per_eye),
  compareField(t('Gewicht', 'Weight'), (row) => row.weight_g, (row) => formatNumber(row.weight_g, ' g'), (row) => toNumber(row.weight_g) === null),
  compareField('Compute Unit', (row) => row.compute_unit),
  compareField(t('Software', 'Software'), (row) => row.software),
  compareField(t('Vertrieb', 'Distribution'), (row) => row.active_distribution),
  compareField(t('EOL / Lifecycle', 'EOL / Lifecycle'), (row) => row.eol_status),
  compareField(
    t('Lifecycle Notes', 'Lifecycle notes'),
    (row) => row.lifecycle_notes,
    (row) => formatLifecycleNotes(row.lifecycle_notes, t('Keine Angaben.', 'No details.')),
  ),
];

const getRadarAxes = () => [
  { label: 'FOV H', inverted: false, getValue: (row) => getHorizontalFov(row) },
  { label: t('Refresh', 'Refresh'), inverted: false, getValue: (row) => toNumber(row.refresh_hz) },
  { label: t('Gewicht (inv.)', 'Weight (inv.)'), inverted: true, getValue: (row) => toNumber(row.weight_g) },
  { label: t('Preis (inv.)', 'Price (inv.)'), inverted: true, getValue: (row) => parsePrice(row.price_usd) },
  { label: t('Tracking-Score', 'Tracking score'), inverted: false, getValue: (row) => getTrackingScore(row) },
];

const normalizeRadarValue = (value, min, max, inverted = false) => {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  const range = max - min;
  if (!Number.isFinite(range) || Math.abs(range) < 1e-9) {
    return 0.5;
  }
  const normalized = Math.max(0, Math.min(1, (value - min) / range));
  return inverted ? 1 - normalized : normalized;
};

const compareRadarTemplate = (selectedRows) => {
  if (!selectedRows.length) {
    return '';
  }

  const axes = getRadarAxes();
  const ranges = axes.map((axis) => {
    const values = selectedRows.map((row) => axis.getValue(row)).filter((value) => Number.isFinite(value));
    if (!values.length) {
      return { min: 0, max: 0 };
    }
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  });

  const size = 360;
  const center = size / 2;
  const maxRadius = 130;
  const ringCount = 5;
  const axisCount = axes.length;
  const startAngle = -Math.PI / 2;
  const angleStep = (Math.PI * 2) / axisCount;
  const pointFor = (axisIndex, value) => {
    const angle = startAngle + axisIndex * angleStep;
    const radius = maxRadius * value;
    return {
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    };
  };

  const gridPolygons = Array.from({ length: ringCount }, (_, index) => {
    const level = (index + 1) / ringCount;
    const points = axes
      .map((_, axisIndex) => {
        const point = pointFor(axisIndex, level);
        return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      })
      .join(' ');
    return `<polygon points="${points}" fill="none" stroke="#44403c" stroke-width="1" />`;
  }).join('');

  const axisLines = axes
    .map((axis, axisIndex) => {
      const outer = pointFor(axisIndex, 1);
      const labelPoint = pointFor(axisIndex, 1.12);
      const anchor = labelPoint.x > center + 6 ? 'start' : labelPoint.x < center - 6 ? 'end' : 'middle';
      const labelY = labelPoint.y > center ? labelPoint.y + 11 : labelPoint.y - 7;
      return `
        <line x1="${center}" y1="${center}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}" stroke="#44403c" stroke-width="1" />
        <text x="${labelPoint.x.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="${anchor}" font-size="11" fill="#a8a29e">${escapeHtml(axis.label)}</text>
      `;
    })
    .join('');

  const series = selectedRows.map((row, rowIndex) => {
    const color = RADAR_COLORS[rowIndex % RADAR_COLORS.length];
    const normalizedValues = axes.map((axis, axisIndex) =>
      normalizeRadarValue(axis.getValue(row), ranges[axisIndex].min, ranges[axisIndex].max, axis.inverted),
    );
    const polygonPoints = normalizedValues
      .map((value, axisIndex) => {
        const point = pointFor(axisIndex, value);
        return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      })
      .join(' ');
    const points = normalizedValues
      .map((value, axisIndex) => {
        const point = pointFor(axisIndex, value);
        return `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3" fill="${color}" />`;
      })
      .join('');
    return {
      row,
      color,
      polygon: `<polygon points="${polygonPoints}" fill="${color}29" stroke="${color}" stroke-width="2" />`,
      points,
    };
  });

  return `
    <div class="border-b border-[#44403c] bg-[#1c1917] px-4 py-4">
      <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[#a8a29e]">${t(
        'Spider Chart (normalisiert auf Auswahl)',
        'Spider chart (normalized to current selection)',
      )}</p>
      <div class="mt-3 overflow-x-auto">
        <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${t(
          'Radarvergleich der ausgewaehlten Modelle',
          'Radar comparison of selected models',
        )}" class="mx-auto block h-[360px] min-w-[320px]">
          ${gridPolygons}
          ${axisLines}
          ${series.map((entry) => entry.polygon).join('')}
          ${series.map((entry) => entry.points).join('')}
        </svg>
      </div>
      <p class="mt-2 text-xs text-[#a8a29e]">${t(
        'Achsen: FOV H, Refresh, Gewicht (invertiert), Preis (invertiert), Tracking-Score.',
        'Axes: FOV H, refresh, weight (inverted), price (inverted), tracking score.',
      )}</p>
      <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        ${series
          .map(
            (entry) => `
              <div class="inline-flex items-center gap-2 rounded-lg border border-[#44403c] bg-[#1c1917] px-2.5 py-1.5 text-xs text-[#a8a29e]">
                <span class="inline-block h-2.5 w-2.5 rounded-full" style="background:${entry.color};"></span>
                <span class="font-semibold">${escapeHtml(compactValue(entry.row.name, t('Unbekannt', 'Unknown')))}</span>
                <span class="text-[#a8a29e]">${escapeHtml(compactValue(entry.row.manufacturer, ''))}</span>
              </div>
            `,
          )
          .join('')}
      </div>
    </div>
  `;
};

export const compareModeTemplate = (selectedRows) => {
  if (!selectedRows.length) {
    return `<p class="panel p-8 text-sm text-[#a8a29e]">${t(
      `Keine Modelle ausgewaehlt. Waehle bis zu ${COMPARE_LIMIT} Modelle fuer den Direktvergleich.`,
      `No models selected. Choose up to ${COMPARE_LIMIT} models for direct comparison.`,
    )}</p>`;
  }

  const fields = getCompareFields();
  const visibleFields = state.hideUnknown
    ? fields.filter((field) => selectedRows.some((row) => !field.isUnknown(row)))
    : fields;

  return `
    <div class="panel overflow-hidden">
      <div class="border-b border-[#44403c] bg-[#1c1917] px-4 py-3">
        <h2 class="font-semibold text-2xl text-[#f5f5f4]">${t('Direktvergleich', 'Direct comparison')}</h2>
        <p class="mt-1 text-sm text-[#a8a29e]">${t(
          `${selectedRows.length} ausgewaehlte Modelle, max. ${COMPARE_LIMIT} gleichzeitig.`,
          `${selectedRows.length} selected models, max ${COMPARE_LIMIT} at once.`,
        )}</p>
      </div>
      ${compareRadarTemplate(selectedRows)}
      <div class="overflow-x-auto">
        <table class="min-w-[980px] border-collapse text-sm" aria-describedby="results-status">
          <caption class="visually-hidden">${t(
            'Direkter Modellvergleich der aktuell ausgewaehlten Brillen.',
            'Direct model comparison of the currently selected glasses.',
          )}</caption>
          <thead class="bg-[#1c1917] text-left text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">
            <tr>
              <th class="px-3 py-3">${t('Merkmal', 'Feature')}</th>
              ${selectedRows
                .map(
                  (row) => `
                    <th class="px-3 py-3 align-top">
                      <p class="font-semibold text-[#f5f5f4]">${escapeHtml(compactValue(row.name, t('Unbekannt', 'Unknown')))}</p>
                      <p class="mt-1 text-[11px] font-medium normal-case tracking-normal text-[#a8a29e]">${escapeHtml(
                        compactValue(row.manufacturer, t('Unbekannt', 'Unknown')),
                      )}</p>
                    </th>
                  `,
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${visibleFields
              .map((field, rowIndex) => {
                const rowClass = rowIndex % 2 === 0 ? 'bg-[#171412]' : 'bg-[#1c1917]';
                return `
                  <tr class="${rowClass} align-top text-[#f5f5f4]">
                    <td class="px-3 py-3 font-semibold text-[#a8a29e]">${escapeHtml(field.label)}</td>
                    ${selectedRows
                      .map((row) => {
                        const hidden = state.hideUnknown && field.isUnknown(row);
                        const rawText = hidden ? '' : field.formatValue(row);
                        return `<td class="px-3 py-3">${escapeHtml(rawText || (state.hideUnknown ? '' : t('k. A.', 'n/a')))}</td>`;
                      })
                      .join('')}
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

export const compareBarTemplate = (selectedRows) => {
  const count = selectedRows.length;
  const compareToggleClasses = state.compareMode
    ? 'chip-btn border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]'
    : 'chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]';

  return `
    <section class="panel mt-4 p-4 sm:p-5">
      <div class="flex flex-wrap items-center gap-2">
        <p class="rounded-full border border-[#44403c] bg-[#1c1917] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">
          ${t('Vergleich', 'Compare')}: ${count}/${COMPARE_LIMIT}
        </p>
        <button
          id="toggle-compare-mode"
          type="button"
          aria-pressed="${state.compareMode ? 'true' : 'false'}"
          class="${compareToggleClasses}"
          ${count === 0 ? 'disabled' : ''}
        >${
          state.compareMode ? t('Liste anzeigen', 'Show list') : t('Compare-Modus', 'Compare mode')
        }</button>
        <button id="clear-compare" type="button" class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]" ${
          count === 0 ? 'disabled' : ''
        }>${t('Auswahl leeren', 'Clear selection')}</button>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        ${
          count
            ? selectedRows
                .map(
                  (row) => `
                    <span class="inline-flex items-center gap-2 rounded-full border border-[#44403c] bg-[#1c1917] px-3 py-1.5 text-xs text-[#a8a29e]">
                      <span class="font-semibold">${escapeHtml(compactValue(row.name, t('Unbekannt', 'Unknown')))}</span>
                      <span class="text-[#a8a29e]">${escapeHtml(compactValue(row.manufacturer, ''))}</span>
                      <button
                        data-remove-compare="${escapeHtml(row.__rowId)}"
                        type="button"
                        aria-label="${escapeHtml(
                          t(
                            `Aus Vergleich entfernen: ${compactValue(row.name, t('Unbekannt', 'Unknown'))}`,
                            `Remove from comparison: ${compactValue(row.name, t('Unbekannt', 'Unknown'))}`,
                          ),
                        )}"
                        class="rounded-full border border-[#44403c] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#84cc16] hover:bg-[#292524]"
                      >x</button>
                    </span>
                  `,
                )
                .join('')
            : `<p class="text-sm text-[#a8a29e]">${t(
                'Noch nichts ausgewaehlt. Nutze "Compare" in Card oder Tabelle.',
                'Nothing selected yet. Use "Compare" in cards or table.',
              )}</p>`
        }
      </div>

      ${state.compareNotice ? `<p class="mt-3 text-xs font-semibold text-[#84cc16]">${escapeHtml(state.compareNotice)}</p>` : ''}
    </section>
  `;
};
