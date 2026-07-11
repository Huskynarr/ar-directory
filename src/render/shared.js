import { escapeHtml, normalizeText, isUnknownValue } from '../utils.js';
import { state, APP_VERSION, APP_BUILD, getSystemThemePreference } from '../state.js';
import { t, compactValue, formatNumber } from '../i18n.js';
import { isEol, getFovDisplay } from '../data/model.js';

export const brandLockupTemplate = () => `
  <div class="brand-lockup">
    <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 28 28" fill="none"><path d="M3.5 14h5.2m10.6 0h5.2M8.7 10.5h4.2c1.1 0 2 .9 2 2v3c0 1.1-.9 2-2 2H8.7a2 2 0 0 1-2-2v-3c0-1.1.9-2 2-2Zm10.6 0h-4.2c-1.1 0-2 .9-2 2v3c0 1.1.9 2 2 2h4.2a2 2 0 0 0 2-2v-3c0-1.1-.9-2-2-2Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>
    <span><strong>AR DIRECTORY</strong><small>by Huskynarr</small></span>
  </div>`;

export const headerControlsTemplate = () => {
  const languageLabel = state.language === 'de'
    ? t('Sprache wechseln: Englisch', 'Switch language: English')
    : t('Sprache wechseln: Deutsch', 'Switch language: German');
  const languageIcon = state.language === 'de'
    ? `<svg class="flag-icon" viewBox="0 0 24 16" fill="none" aria-hidden="true"><rect x=".75" y=".75" width="22.5" height="14.5" rx="2.5" fill="#111827" stroke="rgba(255,255,255,.35)"/><path d="M2.2 2.2h19.6v3.9H2.2z" fill="#1f1f1f"/><path d="M2.2 6.1h19.6V10H2.2z" fill="#c81e1e"/><path d="M2.2 10h19.6v3.9H2.2z" fill="#facc15"/></svg>`
    : `<svg class="flag-icon" viewBox="0 0 24 16" fill="none" aria-hidden="true"><rect x=".75" y=".75" width="22.5" height="14.5" rx="2.5" fill="#fff" stroke="rgba(255,255,255,.35)"/><path d="M2.2 2.2h19.6v1.45H2.2zm0 2.15h19.6V5.8H2.2zm0 2.15h19.6v1.45H2.2zm0 2.15h19.6v1.45H2.2zm0 2.15h19.6v1.45H2.2zm0 2.15h19.6v.95H2.2z" fill="#be123c"/><path d="M2.2 2.2H11v6.85H2.2z" fill="#1d4ed8"/></svg>`;
  const effectiveTheme = state.theme === 'auto' ? getSystemThemePreference() : state.theme;
  const themeLabel = state.theme === 'auto'
    ? t(`Darstellung: Automatisch (${effectiveTheme === 'light' ? 'Hell' : 'Dunkel'}). Zu Hell wechseln`, `Theme: Auto (${effectiveTheme}). Switch to light`)
    : state.theme === 'light'
      ? t('Darstellung: Hell. Zu Dunkel wechseln', 'Theme: Light. Switch to dark')
      : t('Darstellung: Dunkel. Zu Automatisch wechseln', 'Theme: Dark. Switch to auto');
  const themeIcon = state.theme === 'auto'
    ? `<svg class="theme-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor"/><path d="M8 21h8M12 17v4" stroke="currentColor" stroke-linecap="round"/></svg>`
    : state.theme === 'light'
      ? `<svg class="theme-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3c0 .29 0 .57.01.86A7.5 7.5 0 0 0 18.75 11.36c.29 0 .57-.01.86-.01" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg class="theme-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4" stroke="currentColor"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-linecap="round"/></svg>`;

  return `<div class="site-controls">
    <button id="toggle-language" type="button" class="theme-icon-btn" aria-label="${escapeHtml(languageLabel)}" title="${escapeHtml(languageLabel)}">${languageIcon}</button>
    <button id="theme-toggle" type="button" class="theme-icon-btn" data-theme-mode="${state.theme}" aria-label="${escapeHtml(themeLabel)}" title="${escapeHtml(themeLabel)}">${themeIcon}</button>
  </div>`;
};

export const siteFooterTemplate = ({ disclosure = '' } = {}) => `
  <footer class="site-footer">
    <div class="site-footer-primary">
      <div class="site-footer-brand">
        ${brandLockupTemplate()}
        <p>${t(
          'Kuratiertes Verzeichnis für fundierte AR-/XR-Entscheidungen.',
          'A curated directory for informed AR/XR decisions.',
        )}</p>
      </div>
      <nav class="site-footer-navigation" aria-label="${t('Weitere Bereiche', 'More sections')}">
        <div>
          <strong>${t('Vergleichen', 'Compare')}</strong>
          <a href="/" data-nav>${t('Interaktiver Vergleich', 'Interactive comparison')}</a>
          <a href="/modelle/">${t('Modellindex', 'Model index')}</a>
          <a href="/data.html">${t('Daten & Methodik', 'Data & methodology')}</a>
        </div>
        <div>
          <strong>${t('Einordnen', 'Understand')}</strong>
          <a href="/faq.html">FAQ</a>
          <a href="/glossar.html">${t('Glossar', 'Glossary')}</a>
          <a href="/asset-notices.html">${t('Bildnachweise', 'Credits')}</a>
        </div>
      </nav>
    </div>
    ${disclosure ? `<p class="site-footer-disclosure">* ${escapeHtml(disclosure)}</p>` : ''}
    <div class="site-footer-meta">
      <nav aria-label="${t('Rechtliches', 'Legal')}">
        <a href="/impressum.html">${t('Impressum', 'Legal notice')}</a>
        <a href="/datenschutz.html">${t('Datenschutz', 'Privacy')}</a>
      </nav>
      <span class="build-version" title="Build ${escapeHtml(APP_BUILD)}">v${escapeHtml(APP_VERSION)} · ${escapeHtml(APP_BUILD)}</span>
    </div>
  </footer>`;

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
  <label class="compare-control inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#44403c] bg-[#1c1917] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#a8a29e]" title="${escapeHtml(
    rowName ? t(`${rowName} vergleichen`, `Compare ${rowName}`) : t('Modell vergleichen', 'Compare model'),
  )}">
    <input
      data-compare-toggle
      data-model-id="${escapeHtml(rowId)}"
      type="checkbox"
      class="size-4 accent-[#84cc16]"
      aria-label="${escapeHtml(
        rowName ? t(`${rowName} vergleichen`, `Compare ${rowName}`) : t('Modell vergleichen', 'Compare model'),
      )}"
      ${selected ? 'checked' : ''}
    />
    <span class="compare-label-text">${t('Vergleichen', 'Compare')}</span>
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
