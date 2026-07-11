import { escapeHtml, normalizeText, isUnknownValue } from '../utils.js';
import { state } from '../state.js';
import { t, compactValue, formatNumber } from '../i18n.js';
import { isEol, getFovDisplay } from '../data/model.js';

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
    ? 'border-[var(--line-strong)] bg-[var(--surface-3)] text-[var(--text)]'
    : 'border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--text)]';

export const lifecycleTone = (row) => {
  if (isEol(row)) {
    return 'border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--muted)]';
  }
  if (normalizeText(row.eol_status).includes('angekündigt')) {
    return 'border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--text)]';
  }
  return 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)]';
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

export const buildFovFact = (row) => {
  const fov = getFovDisplay(row);
  if (!fov) {
    return { label: 'FOV', raw: '', value: formatNumber('', ' deg') };
  }
  const axisSuffix = fov.axis === 'd' ? t('° (diag.)', '° (diag.)') : fov.axis === 'v' ? t('° (vert.)', '° (vert.)') : '°';
  return { label: 'FOV', raw: String(fov.value), value: `${formatNumber(fov.value)}${axisSuffix}` };
};

export const buildCardFacts = (row) => {
  const fovFact = buildFovFact(row);
  const entries = [
    { label: t('Display', 'Display'), raw: row.display_type, value: compactValue(row.display_type) },
    { label: t('Optik', 'Optics'), raw: row.optics, value: compactValue(row.optics) },
    { label: fovFact.label, raw: fovFact.raw, value: fovFact.value },
    { label: t('Auflösung', 'Resolution'), raw: row.resolution_per_eye, value: compactValue(row.resolution_per_eye) },
    { label: t('Tracking', 'Tracking'), raw: row.tracking, value: compactValue(row.tracking) },
    { label: t('Passthrough', 'Passthrough'), raw: row.passthrough, value: compactValue(row.passthrough) },
    { label: t('Refresh', 'Refresh'), raw: row.refresh_hz, value: formatNumber(row.refresh_hz, ' Hz') },
    { label: t('Gewicht', 'Weight'), raw: row.weight_g, value: formatNumber(row.weight_g, ' g') },
    { label: t('Eye Tracking', 'Eye Tracking'), raw: row.eye_tracking, value: compactValue(row.eye_tracking) },
    { label: t('Hand Tracking', 'Hand Tracking'), raw: row.hand_tracking, value: compactValue(row.hand_tracking) },
    { label: t('Software', 'Software'), raw: row.software, value: compactValue(row.software) },
    { label: t('Compute', 'Compute'), raw: row.compute_unit, value: compactValue(row.compute_unit) },
  ];

  if (!state.hideUnknown) {
    return entries;
  }
  return entries.filter((entry) => !isUnknownValue(entry.raw));
};
