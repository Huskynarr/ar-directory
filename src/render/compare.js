import { escapeHtml, toNumber, parsePrice, parseResolutionWidth, isUnknownValue } from '../utils.js';
import { state, COMPARE_LIMIT, RADAR_COLORS } from '../state.js';
import { t, compactValue, formatPrice, formatDate, formatNumber, formatLifecycleNotes } from '../i18n.js';
import { getHorizontalFov, getTrackingScore } from '../data/model.js';

// Numeric comparators per field: returns a comparable number (or null) plus the
// "better" direction so the matrix can highlight the strongest value in a row.
// `dir: 'high'` = higher is better, `dir: 'low'` = lower is better.
const compareField = (
  label,
  getRaw,
  formatValue = (row) => compactValue(getRaw(row)),
  isUnknown = (row) => isUnknownValue(getRaw(row)),
  best = null,
) => ({
  label,
  formatValue,
  isUnknown,
  best,
});

const getCompareFields = () => [
  compareField(t('Hersteller', 'Manufacturer'), (row) => row.manufacturer),
  compareField(t('Kategorie', 'Category'), (row) => row.xr_category, (row) => compactValue(row.xr_category, 'AR')),
  compareField(t('Release', 'Release'), (row) => row.release_date || row.announced_date, (row) => formatDate(row.release_date || row.announced_date)),
  compareField(t('Preis', 'Price'), (row) => row.price_usd, (row) => formatPrice(row.price_usd), (row) => !parsePrice(row.price_usd), {
    dir: 'low',
    getValue: (row) => parsePrice(row.price_usd),
  }),
  compareField('Display', (row) => row.display_type),
  compareField(t('Optik', 'Optics'), (row) => row.optics),
  compareField(t('Tracking', 'Tracking'), (row) => row.tracking),
  compareField('Eye Tracking', (row) => row.eye_tracking),
  compareField('Hand Tracking', (row) => row.hand_tracking),
  compareField('Passthrough', (row) => row.passthrough),
  compareField(t('FOV horizontal', 'FOV horizontal'), (row) => row.fov_horizontal_deg, (row) => formatNumber(row.fov_horizontal_deg, ' deg'), (row) => toNumber(row.fov_horizontal_deg) === null, {
    dir: 'high',
    getValue: (row) => toNumber(row.fov_horizontal_deg),
  }),
  compareField(t('FOV vertikal', 'FOV vertical'), (row) => row.fov_vertical_deg, (row) => formatNumber(row.fov_vertical_deg, ' deg'), (row) => toNumber(row.fov_vertical_deg) === null, {
    dir: 'high',
    getValue: (row) => toNumber(row.fov_vertical_deg),
  }),
  compareField(t('Refresh', 'Refresh'), (row) => row.refresh_hz, (row) => formatNumber(row.refresh_hz, ' Hz'), (row) => toNumber(row.refresh_hz) === null, {
    dir: 'high',
    getValue: (row) => toNumber(row.refresh_hz),
  }),
  compareField(t('Aufloesung', 'Resolution'), (row) => row.resolution_per_eye, undefined, undefined, {
    dir: 'high',
    getValue: (row) => parseResolutionWidth(row.resolution_per_eye),
  }),
  compareField(t('Gewicht', 'Weight'), (row) => row.weight_g, (row) => formatNumber(row.weight_g, ' g'), (row) => toNumber(row.weight_g) === null, {
    dir: 'low',
    getValue: (row) => toNumber(row.weight_g),
  }),
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

// Returns a Set of column indices that hold the "best" value for a numeric field.
// Returns null when a winner can't be determined (no comparator, no usable
// numbers, or every model ties on the same value).
const getBestIndices = (field, selectedRows) => {
  if (!field.best || selectedRows.length < 2) {
    return null;
  }
  const values = selectedRows.map((row) => {
    const value = field.best.getValue(row);
    return Number.isFinite(value) ? value : null;
  });
  const usable = values.filter((value) => value !== null);
  if (usable.length < 2) {
    return null;
  }
  const target = field.best.dir === 'low' ? Math.min(...usable) : Math.max(...usable);
  // Don't highlight if everything is identical — no meaningful "best".
  if (Math.min(...usable) === Math.max(...usable)) {
    return null;
  }
  const best = new Set();
  values.forEach((value, index) => {
    if (value !== null && value === target) {
      best.add(index);
    }
  });
  return best.size ? best : null;
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

  const size = 560;
  const center = size / 2;
  const maxRadius = 196;
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
    // Faint alternating ring fill for depth, outermost ring drawn stronger.
    const fill = index % 2 === 0 ? 'rgba(168,162,158,0.05)' : 'none';
    const stroke = index === ringCount - 1 ? '#57534e' : '#44403c';
    return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="1" />`;
  }).join('');

  const axisLines = axes
    .map((axis, axisIndex) => {
      const outer = pointFor(axisIndex, 1);
      const labelPoint = pointFor(axisIndex, 1.16);
      const anchor = labelPoint.x > center + 8 ? 'start' : labelPoint.x < center - 8 ? 'end' : 'middle';
      const labelY = labelPoint.y > center ? labelPoint.y + 16 : labelPoint.y - 10;
      return `
        <line x1="${center}" y1="${center}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}" stroke="#44403c" stroke-width="1" />
        <text x="${labelPoint.x.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="${anchor}" font-size="16" font-weight="600" fill="#a8a29e">${escapeHtml(axis.label)}</text>
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
        return `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4.5" fill="${color}" stroke="#0c0a09" stroke-width="1.5" />`;
      })
      .join('');
    return {
      row,
      color,
      polygon: `<polygon points="${polygonPoints}" fill="${color}26" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" />`,
      points,
    };
  });

  return `
    <div class="border-b border-[#44403c] bg-[#1c1917] px-4 py-5 sm:px-6 sm:py-6">
      <div class="flex items-center gap-2">
        <span class="inline-block h-3.5 w-1 rounded-full bg-[#84cc16]"></span>
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-[#a8a29e]">${t(
          'Spider Chart (normalisiert auf Auswahl)',
          'Spider chart (normalized to current selection)',
        )}</p>
      </div>
      <div class="mt-4 overflow-x-auto">
        <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${t(
          'Radarvergleich der ausgewaehlten Modelle',
          'Radar comparison of selected models',
        )}" class="mx-auto block h-auto w-full max-w-[560px] min-w-[300px]">
          ${gridPolygons}
          ${axisLines}
          ${series.map((entry) => entry.polygon).join('')}
          ${series.map((entry) => entry.points).join('')}
        </svg>
      </div>
      <p class="mt-3 text-center text-xs text-[#a8a29e]">${t(
        'Achsen: FOV H, Refresh, Gewicht (invertiert), Preis (invertiert), Tracking-Score.',
        'Axes: FOV H, refresh, weight (inverted), price (inverted), tracking score.',
      )}</p>
      <div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        ${series
          .map(
            (entry) => `
              <div class="inline-flex items-center gap-2 rounded-xl border border-[#44403c] bg-[#171412] px-3 py-2 text-xs text-[#a8a29e]">
                <span class="inline-block h-3 w-3 shrink-0 rounded-full ring-2 ring-[#0c0a09]" style="background:${entry.color};"></span>
                <span class="truncate font-semibold text-[#f5f5f4]">${escapeHtml(compactValue(entry.row.name, t('Unbekannt', 'Unknown')))}</span>
                <span class="truncate text-[#a8a29e]">${escapeHtml(compactValue(entry.row.manufacturer, ''))}</span>
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
    return `
      <div class="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span class="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#44403c] bg-[#171412] text-2xl text-[#84cc16]">&#9783;</span>
        <h2 class="text-lg font-semibold text-[#f5f5f4]">${t('Noch nichts zu vergleichen', 'Nothing to compare yet')}</h2>
        <p class="max-w-md text-sm text-[#a8a29e]">${t(
          `Keine Modelle ausgewaehlt. Waehle bis zu ${COMPARE_LIMIT} Modelle fuer den Direktvergleich.`,
          `No models selected. Choose up to ${COMPARE_LIMIT} models for direct comparison.`,
        )}</p>
      </div>`;
  }

  const fields = getCompareFields();
  const visibleFields = state.hideUnknown
    ? fields.filter((field) => selectedRows.some((row) => !field.isUnknown(row)))
    : fields;

  return `
    <div class="panel overflow-hidden">
      <div class="border-b border-[#44403c] bg-[#1c1917] px-4 py-4 sm:px-6 sm:py-5">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="text-2xl font-semibold text-[#f5f5f4]">${t('Direktvergleich', 'Direct comparison')}</h2>
            <p class="mt-1 text-sm text-[#a8a29e]">${t(
              `${selectedRows.length} ausgewaehlte Modelle, max. ${COMPARE_LIMIT} gleichzeitig.`,
              `${selectedRows.length} selected models, max ${COMPARE_LIMIT} at once.`,
            )}</p>
          </div>
          <span class="inline-flex items-center gap-1.5 rounded-full border border-[#84cc16]/40 bg-[#84cc16]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#84cc16]">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-[#84cc16]"></span>${t('Bester Wert markiert', 'Best value marked')}
          </span>
        </div>
      </div>
      ${compareRadarTemplate(selectedRows)}
      <div class="overflow-x-auto">
        <table class="min-w-[760px] border-collapse text-sm" aria-describedby="results-status">
          <caption class="visually-hidden">${t(
            'Direkter Modellvergleich der aktuell ausgewaehlten Brillen.',
            'Direct model comparison of the currently selected glasses.',
          )}</caption>
          <thead class="bg-[#1c1917] text-left text-[11px] uppercase tracking-[0.12em] text-[#a8a29e]">
            <tr>
              <th class="sticky left-0 z-10 bg-[#1c1917] px-4 py-3.5 shadow-[1px_0_0_0_#44403c]">${t('Merkmal', 'Feature')}</th>
              ${selectedRows
                .map((row, colIndex) => {
                  const color = RADAR_COLORS[colIndex % RADAR_COLORS.length];
                  return `
                    <th class="min-w-[150px] px-4 py-3.5 align-top">
                      <p class="flex items-center gap-2 font-semibold text-[#f5f5f4]">
                        <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style="background:${color};"></span>
                        <span class="normal-case tracking-normal">${escapeHtml(compactValue(row.name, t('Unbekannt', 'Unknown')))}</span>
                      </p>
                      <p class="mt-1 pl-[18px] text-[11px] font-medium normal-case tracking-normal text-[#a8a29e]">${escapeHtml(
                        compactValue(row.manufacturer, t('Unbekannt', 'Unknown')),
                      )}</p>
                    </th>
                  `;
                })
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${visibleFields
              .map((field, rowIndex) => {
                const zebra = rowIndex % 2 === 0 ? 'bg-[#171412]' : 'bg-[#1c1917]';
                const bestIndices = getBestIndices(field, selectedRows);
                return `
                  <tr class="${zebra} align-top text-[#f5f5f4]">
                    <td class="sticky left-0 z-10 ${zebra} px-4 py-3 font-semibold text-[#a8a29e] shadow-[1px_0_0_0_#44403c]">${escapeHtml(field.label)}</td>
                    ${selectedRows
                      .map((row, colIndex) => {
                        const hidden = state.hideUnknown && field.isUnknown(row);
                        const rawText = hidden ? '' : field.formatValue(row);
                        const isBest = bestIndices ? bestIndices.has(colIndex) : false;
                        const cellClass = isBest
                          ? 'px-4 py-3 font-semibold text-[#84cc16]'
                          : 'px-4 py-3';
                        const display = escapeHtml(rawText || (state.hideUnknown ? '' : t('k. A.', 'n/a')));
                        const value = isBest
                          ? `<span class="inline-flex items-center gap-1.5"><span class="inline-block h-1.5 w-1.5 rounded-full bg-[#84cc16]"></span>${display}</span>`
                          : display;
                        return `<td class="${cellClass}">${value}</td>`;
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
