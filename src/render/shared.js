import { escapeHtml, normalizeText, isUnknownValue } from '../utils.js';
import { state } from '../state.js';
import { t, compactValue, formatNumber } from '../i18n.js';
import { isEol } from '../data/model.js';

export const optionList = (values, selectedValue, allLabel = t('Alle', 'All')) => {
  const head = `<option value="all"${selectedValue === 'all' ? ' selected' : ''}>${escapeHtml(allLabel)}</option>`;
  const options = values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}"${value === selectedValue ? ' selected' : ''}>${escapeHtml(value)}</option>`,
    )
    .join('');
  return `${head}${options}`;
};

export const categoryTone = (value) =>
  normalizeText(value) === 'xr'
    ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
    : 'border-lime-500/40 bg-lime-500/15 text-lime-200';

export const lifecycleTone = (row) => {
  if (isEol(row)) {
    return 'border-red-500/25 bg-red-500/5 text-red-300';
  }
  if (normalizeText(row.eol_status).includes('angekuendigt')) {
    return 'border-amber-500/25 bg-amber-500/5 text-amber-300';
  }
  return 'border-lime-500/20 bg-lime-500/5 text-lime-300';
};

export const selectionLabelTemplate = (rowId, selected, rowName = '') => `
  <label class="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#44403c] bg-[#1c1917] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#a8a29e]">
    <input
      data-compare-toggle
      data-model-id="${escapeHtml(rowId)}"
      type="checkbox"
      class="size-4 accent-[#84cc16]"
      aria-label="${escapeHtml(
        rowName ? t(`Vergleich: ${rowName}`, `Compare: ${rowName}`) : t('Vergleich', 'Compare'),
      )}"
      ${selected ? 'checked' : ''}
    />
    ${t('Vergleich', 'Compare')}
  </label>
`;

export const buildCardFacts = (row) => {
  const entries = [
    { label: t('Display', 'Display'), raw: row.display_type, value: compactValue(row.display_type) },
    { label: t('Optik', 'Optics'), raw: row.optics, value: compactValue(row.optics) },
    { label: t('Tracking', 'Tracking'), raw: row.tracking, value: compactValue(row.tracking) },
    { label: t('Eye Tracking', 'Eye Tracking'), raw: row.eye_tracking, value: compactValue(row.eye_tracking) },
    { label: t('Hand Tracking', 'Hand Tracking'), raw: row.hand_tracking, value: compactValue(row.hand_tracking) },
    { label: t('Passthrough', 'Passthrough'), raw: row.passthrough, value: compactValue(row.passthrough) },
    { label: 'FOV H', raw: row.fov_horizontal_deg, value: formatNumber(row.fov_horizontal_deg, ' deg') },
    { label: t('Refresh', 'Refresh'), raw: row.refresh_hz, value: formatNumber(row.refresh_hz, ' Hz') },
    { label: t('Software', 'Software'), raw: row.software, value: compactValue(row.software) },
    { label: t('Aufloesung', 'Resolution'), raw: row.resolution_per_eye, value: compactValue(row.resolution_per_eye) },
    { label: t('Compute', 'Compute'), raw: row.compute_unit, value: compactValue(row.compute_unit) },
    { label: t('Gewicht', 'Weight'), raw: row.weight_g, value: formatNumber(row.weight_g, ' g') },
    { label: 'FOV V', raw: row.fov_vertical_deg, value: formatNumber(row.fov_vertical_deg, ' deg') },
  ];

  if (!state.hideUnknown) {
    return entries;
  }
  return entries.filter((entry) => !isUnknownValue(entry.raw));
};
