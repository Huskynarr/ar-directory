// Guided "Welche Brille passt zu mir?" finder. A small step-by-step quiz that
// scores every device against the user's answers and surfaces the best matches.
// Lives at the client route /finder/ (served via 404.html on GitHub Pages, like
// /compare/). Self-contained: keeps its own step state and re-render loop so it
// never touches the directory's render()/syncUrlWithState() path.
import { escapeHtml, normalizeText, toNumber, parsePrice, parseResolutionWidth, isUnknownValue, safeExternalUrl } from '../utils.js';
import { t, formatPrice, formatNumber } from '../i18n.js';
import { state } from '../state.js';
import { getModelImageUrl } from './image.js';
import { categoryTone } from './shared.js';
import { isEol, isLikelyActive, isXrRow, getNormalizedFov } from '../data/model.js';
import { FINDER_QUESTIONS } from '../data/finder-questions.js';

export const isFinderRoute = () => /^\/finder\/?$/.test(window.location.pathname);

// Wizard state persists at module scope so a re-render (e.g. after the FX rate
// resolves) keeps the user on their current step.
const finder = { step: 0, answers: {}, showResults: false };

export const resetFinder = () => {
  finder.step = 0;
  finder.answers = {};
  finder.showResults = false;
};

// Localize the shared question data to the active UI language.
const loc = (entry) => (state.language === 'en' ? entry.en : entry.de);
const getQuestions = () =>
  FINDER_QUESTIONS.map((q) => ({
    id: q.id,
    header: loc(q.header),
    question: loc(q.question),
    options: q.options.map((o) => ({ value: o.value, icon: o.icon, label: loc(o.label), desc: loc(o.desc) })),
  }));

// --- Scoring helpers -------------------------------------------------------

const BUDGET_RANGES = { low: [0, 350], mid: [300, 650], high: [600, 1600], premium: [1400, Infinity] };
const BUDGET_MAX_PRICE = { low: '350', mid: '650', high: '1600', premium: '' };

const present = (value) => {
  if (!value || isUnknownValue(value)) return false;
  const n = normalizeText(value);
  return n !== '' && !['nein', 'no', 'none', 'kein', 'keine', '-', 'n/a', 'na'].includes(n);
};

const clamp = (n) => Math.max(0, Math.min(100, n));

const getConnectionType = (row) => {
  const blob = normalizeText([row.compute_unit, row.software, row.tracking, row.display_type, row.connectivity].join(' '));
  const standalone = ['standalone', 'snapdragon', 'qualcomm', 'android', 'horizon', 'visionos', 'rokid os', 'xr2', 'xr1', 'onboard', 'eigenständig'];
  const tethered = ['tethered', 'usb-c', 'usb c', 'host', 'smartphone', 'displayport', 'dp alt', 'dp-alt', 'wired', 'hdmi', 'console', 'angeschlossen', 'kabel'];
  const hasStandalone = standalone.some((k) => blob.includes(k));
  const hasTethered = tethered.some((k) => blob.includes(k));
  if (hasStandalone && hasTethered) return 'mixed';
  if (hasStandalone) return 'standalone';
  if (hasTethered) return 'tethered';
  return isXrRow(row) ? 'standalone' : 'tethered';
};

const scoreUsecase = (row, usecase) => {
  const fov = getNormalizedFov(row);
  const refresh = toNumber(row.refresh_hz);
  const resW = parseResolutionWidth(row.resolution_per_eye);
  const weight = toNumber(row.weight_g);
  const tracking = normalizeText(row.tracking);
  const is6dof = tracking.includes('6dof') || tracking.includes('6 dof') || tracking.includes('inside-out') || tracking.includes('inside out');
  const isXr = isXrRow(row);
  const display = normalizeText(row.display_type);
  const oled = display.includes('oled') || display.includes('lcos') || display.includes('micro');
  const connection = getConnectionType(row);
  const eyeT = present(row.eye_tracking);
  const handT = present(row.hand_tracking);
  const pass = present(row.passthrough);

  switch (usecase) {
    case 'gaming': {
      let s = isXr ? 35 : 6;
      s += refresh != null ? (refresh >= 120 ? 25 : refresh >= 90 ? 20 : refresh >= 72 ? 12 : 4) : 8;
      s += is6dof ? 20 : 5;
      s += fov != null ? (fov >= 90 ? 20 : fov >= 40 ? 12 : fov >= 30 ? 6 : 2) : 6;
      return clamp(s);
    }
    case 'media': {
      let s = resW != null ? (resW >= 1920 ? 30 : resW >= 1280 ? 22 : resW >= 960 ? 12 : 5) : 10;
      s += oled ? 25 : display.includes('lcd') ? 12 : 8;
      s += weight != null ? (weight <= 120 ? 20 : weight <= 300 ? 12 : 4) : 8;
      s += fov != null ? (fov >= 45 ? 15 : fov >= 30 ? 10 : 5) : 6;
      s += isXr ? 5 : 10;
      return clamp(s);
    }
    case 'work': {
      let s = resW != null ? (resW >= 1920 ? 32 : resW >= 1200 ? 22 : 10) : 10;
      s += isXr ? 12 : 22;
      s += weight != null ? (weight <= 110 ? 22 : weight <= 300 ? 12 : 4) : 8;
      s += refresh != null ? (refresh >= 90 ? 14 : refresh >= 60 ? 10 : 5) : 6;
      s += 10;
      return clamp(s);
    }
    case 'everyday': {
      let s = weight != null ? (weight <= 60 ? 35 : weight <= 100 ? 25 : weight <= 160 ? 12 : 3) : 10;
      s += connection === 'standalone' ? 20 : connection === 'mixed' ? 12 : 8;
      const smart = normalizeText([row.name, row.manufacturer, row.software, row.camera, row.audio].join(' '));
      s += ['ai', 'assistant', 'gpt', 'gemini', 'ray-ban', 'rayban', 'smart', 'audio', 'speaker', 'translation', 'übersetz'].some((k) => smart.includes(k)) ? 20 : 8;
      s += present(row.camera) ? 10 : 4;
      s += 6;
      return clamp(s);
    }
    case 'enterprise': {
      let s = isXr ? 12 : 25;
      s += handT ? 20 : 8;
      s += connection === 'standalone' ? 20 : 8;
      s += is6dof ? 15 : 5;
      s += pass ? 8 : 4;
      const ent = normalizeText([row.name, row.manufacturer, row.software].join(' '));
      if (['hololens', 'magic leap', 'realwear', 'vuzix', 'enterprise', 'industrial', 'rugged', 'trimble', 'daqri'].some((k) => ent.includes(k))) s += 12;
      return clamp(s);
    }
    case 'dev': {
      let s = is6dof ? 22 : 6;
      s += eyeT ? 18 : 5;
      s += handT ? 18 : 5;
      s += pass ? 16 : 5;
      s += fov != null && fov >= 40 ? 12 : 6;
      const dv = normalizeText([row.software, row.name, row.manufacturer].join(' '));
      if (['android', 'openxr', 'sdk', 'developer', 'linux', 'webxr'].some((k) => dv.includes(k))) s += 10;
      return clamp(s);
    }
    default:
      return 0;
  }
};

const USECASE_REASON = {
  gaming: t('Stark für immersives Gaming', 'Strong for immersive gaming'),
  media: t('Top Bild- & Display-Qualität', 'Top picture & display quality'),
  work: t('Gut als virtueller Monitor', 'Great as a virtual monitor'),
  everyday: t('Leichte Alltags-/AI-Brille', 'Light everyday/AI glasses'),
  enterprise: t('Enterprise-/Industrie-tauglich', 'Enterprise/industry ready'),
  dev: t('Viele Features für Entwickler', 'Feature-rich for developers'),
};

const WEIGHTS = { usecase: 1.3, category: 1.0, budget: 0.9, availability: 0.8, formfactor: 0.6, connection: 0.6 };

// Returns { percent: number|null, reasons: string[], fallback: number }.
const scoreDevice = (row, answers) => {
  let acc = 0;
  let wsum = 0;
  const reasons = [];
  const add = (key, raw, reason) => {
    acc += raw * WEIGHTS[key];
    wsum += 100 * WEIGHTS[key];
    if (reason && raw >= 60) reasons.push({ reason, raw });
  };

  if (answers.usecase) {
    const raw = scoreUsecase(row, answers.usecase);
    add('usecase', raw, USECASE_REASON[answers.usecase]);
  }
  if (answers.category && answers.category !== 'any') {
    const isXr = isXrRow(row);
    const match = (answers.category === 'xr') === isXr;
    add('category', match ? 100 : 0, match ? (answers.category === 'xr' ? t('Immersives XR', 'Immersive XR') : t('Leichte AR-Brille', 'Lightweight AR glasses')) : null);
  }
  if (answers.budget && answers.budget !== 'any') {
    const price = parsePrice(row.price_usd);
    let raw;
    if (price == null) {
      raw = 45;
    } else {
      const [lo, hi] = BUDGET_RANGES[answers.budget];
      if (price >= lo && price <= hi) raw = 100;
      else {
        const dist = price < lo ? lo - price : price - hi;
        const tol = Number.isFinite(hi) ? Math.max(300, (hi - lo) * 0.5) : 400;
        raw = clamp(100 * (1 - dist / tol));
      }
    }
    add('budget', raw, t('Passt ins Budget', 'Fits the budget'));
  }
  if (answers.formfactor && answers.formfactor !== 'any') {
    const weight = toNumber(row.weight_g);
    let raw;
    if (answers.formfactor === 'light') {
      raw = weight == null ? 40 : weight <= 90 ? 100 : weight <= 150 ? 80 : weight <= 300 ? 45 : 10;
    } else {
      raw = weight == null ? 55 : weight <= 400 ? 100 : weight <= 650 ? 70 : 35;
    }
    const reason = weight != null && answers.formfactor === 'light' && weight <= 150 ? t(`Sehr leicht (${Math.round(weight)} g)`, `Very light (${Math.round(weight)} g)`) : null;
    add('formfactor', raw, reason);
  }
  if (answers.connection && answers.connection !== 'any') {
    const type = getConnectionType(row);
    let raw;
    if (answers.connection === 'standalone') raw = type === 'standalone' ? 100 : type === 'mixed' ? 70 : 15;
    else raw = type === 'tethered' ? 100 : type === 'mixed' ? 70 : 20;
    add('connection', raw, raw >= 100 ? (answers.connection === 'standalone' ? t('Standalone', 'Standalone') : t('Leicht & angeschlossen', 'Light & tethered')) : null);
  }
  if (answers.availability === 'current') {
    const active = isLikelyActive(row);
    const eol = isEol(row);
    const raw = eol ? 0 : active ? 100 : 55;
    add('availability', raw, raw >= 100 ? t('Aktuell erhältlich', 'Currently available') : null);
  }

  const percent = wsum > 0 ? Math.round((acc / wsum) * 100) : null;
  const fallback = (isLikelyActive(row) ? 2 : 0) + (isEol(row) ? -1 : 0);
  const topReasons = reasons.sort((a, b) => b.raw - a.raw).slice(0, 3).map((r) => r.reason);
  return { percent, reasons: topReasons, fallback };
};

const rankDevices = (answers, limit = 9) =>
  state.rows
    .map((row) => ({ row, ...scoreDevice(row, answers) }))
    .sort((a, b) => {
      const pa = a.percent == null ? -1 : a.percent;
      const pb = b.percent == null ? -1 : b.percent;
      if (pb !== pa) return pb - pa;
      return b.fallback - a.fallback;
    })
    .slice(0, limit);

// --- Rendering -------------------------------------------------------------

const answeredCount = () => Object.values(finder.answers).filter(Boolean).length;

const matchToneClass = (percent) => {
  if (percent == null) return 'border-[#44403c] bg-[#1c1917] text-[#a8a29e]';
  if (percent >= 80) return 'border-lime-400/50 bg-lime-400/15 text-lime-200';
  if (percent >= 55) return 'border-amber-400/40 bg-amber-400/10 text-amber-200';
  return 'border-[#44403c] bg-[#1c1917] text-[#a8a29e]';
};

const resultCardTemplate = ({ row, percent, reasons }) => {
  const name = escapeHtml(row.name || t('Unbekanntes Modell', 'Unknown model'));
  const manufacturer = escapeHtml(row.manufacturer || t('Unbekannt', 'Unknown'));
  const category = escapeHtml(row.xr_category || 'AR');
  const image = safeExternalUrl(row.image_url) || getModelImageUrl(row);
  const detailHref = row.__path ? `/${row.__path}/` : safeExternalUrl(row.official_url) || '#';
  const fov = getNormalizedFov(row);
  const chips = [
    { label: t('Preis', 'Price'), value: formatPrice(row.price_usd) },
    fov != null ? { label: 'FOV', value: `${formatNumber(fov)}°` } : null,
    present(row.refresh_hz) ? { label: 'Refresh', value: formatNumber(row.refresh_hz, ' Hz') } : null,
    present(row.weight_g) ? { label: t('Gewicht', 'Weight'), value: formatNumber(row.weight_g, ' g') } : null,
  ].filter(Boolean);

  return `
    <article class="panel group flex flex-col overflow-hidden transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[#84cc16]/50 hover:ring-1 hover:ring-[#84cc16]/30">
      <div class="relative h-40 overflow-hidden border-b border-[#44403c]/60 bg-[#131b26]">
        <img src="${escapeHtml(image)}" alt="${name}" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="h-full w-full object-contain p-4" />
        <span class="absolute right-3 top-3 rounded-full border px-2.5 py-1 text-xs font-bold ${categoryTone(row.xr_category)}">${category}</span>
        <span class="absolute left-3 top-3 rounded-full border px-2.5 py-1 text-xs font-bold ${matchToneClass(percent)}">${
          percent == null ? t('Vorschlag', 'Suggestion') : t(`${percent}% Match`, `${percent}% match`)
        }</span>
      </div>
      <div class="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a8a29e]">${manufacturer}</p>
          <h3 class="text-lg font-semibold leading-tight text-[#f5f5f4]">${name}</h3>
        </div>
        ${
          chips.length
            ? `<dl class="grid grid-cols-2 gap-2 text-sm">${chips
                .map(
                  (c) => `<div class="soft-panel p-2"><dt class="text-[11px] uppercase tracking-[0.1em] text-[#a8a29e]">${escapeHtml(c.label)}</dt><dd class="mt-0.5 font-semibold text-[#f5f5f4]">${escapeHtml(c.value)}</dd></div>`,
                )
                .join('')}</dl>`
            : ''
        }
        ${
          reasons.length
            ? `<ul class="flex flex-wrap gap-1.5">${reasons
                .map((r) => `<li class="rounded-full border border-lime-500/30 bg-lime-500/10 px-2 py-0.5 text-[11px] font-medium text-lime-200">✓ ${escapeHtml(r)}</li>`)
                .join('')}</ul>`
            : ''
        }
        <a href="${escapeHtml(detailHref)}" class="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#84cc16] bg-[#84cc16] px-3 py-2 text-sm font-semibold text-[#0c0a09] transition hover:bg-[#65a30d]">${t('Details ansehen', 'View details')} →</a>
      </div>
    </article>`;
};

const progressBar = (current, total) => {
  const pct = Math.round((current / total) * 100);
  return `
    <div class="mt-1 flex items-center gap-3">
      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1c1917]">
        <div class="h-full rounded-full bg-gradient-to-r from-lime-400 to-lime-600 transition-all duration-300" style="width:${pct}%"></div>
      </div>
      <span class="shrink-0 text-xs font-semibold text-[#a8a29e]">${current} / ${total}</span>
    </div>`;
};

const shellTemplate = (inner) => `
  <a href="#finder-main" class="skip-link">${t('Zum Inhalt springen', 'Skip to content')}</a>
  <main id="finder-main" tabindex="-1" class="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8">
    <header class="panel relative overflow-hidden p-5 sm:p-6">
      <div class="theme-hero-surface absolute inset-0 -z-10"></div>
      <div class="flex items-start justify-between gap-3">
        <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-lime-500 sm:text-xs">${t('AR / XR FINDER', 'AR / XR FINDER')}</p>
        <a href="/" data-nav class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">← ${t('Zum Verzeichnis', 'To the directory')}</a>
      </div>
      <h1 class="mt-2 text-2xl font-bold leading-tight text-transparent bg-clip-text bg-gradient-to-r from-lime-400 to-lime-600 sm:text-4xl">${t(
        'Welche AR-/XR-Brille passt zu mir?',
        'Which AR/XR glasses fit me?',
      )}</h1>
      <p class="mt-2.5 max-w-2xl text-sm leading-relaxed text-[#a8a29e] sm:text-base">${t(
        'Beantworte ein paar kurze Fragen und der Finder durchsucht alle Modelle nach den besten Treffern für dich.',
        'Answer a few short questions and the finder searches all models for your best matches.',
      )}</p>
    </header>
    ${inner}
    <footer class="mt-4">
      <div class="panel flex flex-wrap items-center gap-3 p-4 text-sm text-[#a8a29e]">
        <a href="/" data-nav class="font-semibold text-[#84cc16] hover:underline">${t('Alle Modelle', 'All models')}</a>
        <a href="/glossar.html" class="hover:underline">${t('Glossar & FAQ', 'Glossary & FAQ')}</a>
        <a href="/impressum.html" class="hover:underline">${t('Impressum', 'Legal Notice')}</a>
        <a href="/datenschutz.html" class="hover:underline">${t('Datenschutz', 'Privacy')}</a>
      </div>
    </footer>
  </main>`;

const questionTemplate = () => {
  const questions = getQuestions();
  const q = questions[finder.step];
  const selected = finder.answers[q.id];
  const options = q.options
    .map((opt) => {
      const isSel = selected === opt.value;
      return `
        <button type="button" data-finder-option="${escapeHtml(opt.value)}" aria-pressed="${isSel ? 'true' : 'false'}" class="group/opt flex items-start gap-3 rounded-xl border p-4 text-left transition ${
          isSel
            ? 'border-[#84cc16] bg-[#84cc16]/10 ring-1 ring-[#84cc16]/40'
            : 'border-[#44403c] bg-[#1c1917] hover:border-[#84cc16]/50 hover:bg-[#292524]'
        }">
          <span class="text-2xl leading-none" aria-hidden="true">${opt.icon}</span>
          <span class="min-w-0">
            <span class="block font-semibold text-[#f5f5f4]">${escapeHtml(opt.label)}</span>
            <span class="mt-0.5 block text-sm text-[#a8a29e]">${escapeHtml(opt.desc)}</span>
          </span>
        </button>`;
    })
    .join('');

  return shellTemplate(`
    <section class="panel mt-4 p-5 sm:p-6">
      <div class="flex items-center gap-2">
        <span class="rounded-full border border-[#44403c] bg-[#1c1917] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-lime-300">${escapeHtml(q.header)}</span>
      </div>
      ${progressBar(finder.step + 1, questions.length)}
      <h2 class="mt-4 text-xl font-semibold text-[#f5f5f4] sm:text-2xl">${escapeHtml(q.question)}</h2>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">${options}</div>
      <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" data-finder-back ${finder.step === 0 ? 'disabled' : ''} class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524] ${
          finder.step === 0 ? 'cursor-not-allowed opacity-50' : ''
        }">← ${t('Zurück', 'Back')}</button>
        <div class="flex items-center gap-2">
          ${
            answeredCount() > 0
              ? `<button type="button" data-finder-results class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">${t('Ergebnisse zeigen', 'Show results')}</button>`
              : ''
          }
          <button type="button" data-finder-next class="chip-btn border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]">${
            finder.step === questions.length - 1 ? t('Ergebnisse', 'Results') : t('Weiter', 'Next')
          } →</button>
        </div>
      </div>
    </section>`);
};

const summaryChips = () =>
  getQuestions()
    .filter((q) => finder.answers[q.id])
    .map((q) => {
      const opt = q.options.find((o) => o.value === finder.answers[q.id]);
      return opt && opt.value !== 'any'
        ? `<li class="rounded-full border border-[#44403c] bg-[#1c1917] px-3 py-1 text-xs font-medium text-[#f5f5f4]">${escapeHtml(q.header)}: ${escapeHtml(opt.label)}</li>`
        : '';
    })
    .filter(Boolean)
    .join('');

const resultsTemplate = () => {
  const ranked = rankDevices(finder.answers);
  const chips = summaryChips();
  return shellTemplate(`
    <section class="panel mt-4 p-5 sm:p-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-xl font-semibold text-[#f5f5f4] sm:text-2xl">${t('Deine besten Treffer', 'Your best matches')}</h2>
          <p class="mt-1 text-sm text-[#a8a29e]">${t(
            'Basierend auf deinen Antworten – sortiert nach Passgenauigkeit.',
            'Based on your answers – sorted by fit.',
          )}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" data-finder-edit class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">${t('Antworten ändern', 'Edit answers')}</button>
          <button type="button" data-finder-restart class="chip-btn border-[#44403c] bg-[#1c1917] text-[#f5f5f4] hover:bg-[#292524]">${t('Neu starten', 'Start over')}</button>
          <button type="button" data-finder-apply class="chip-btn border-[#84cc16] bg-[#84cc16] text-[#0c0a09] hover:bg-[#65a30d]">${t('Im Verzeichnis öffnen', 'Open in directory')}</button>
        </div>
      </div>
      ${chips ? `<ul class="mt-4 flex flex-wrap gap-2">${chips}</ul>` : ''}
    </section>
    <section class="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      ${ranked.map(resultCardTemplate).join('')}
    </section>`);
};

// Apply the coarse intent behind the answers to the directory filters, then
// hand off to the main view. Only maps answers that have a clean filter analog.
const applyAnswersToDirectory = () => {
  const a = finder.answers;
  state.query = '';
  state.manufacturer = 'all';
  state.displayType = 'all';
  state.optics = 'all';
  state.tracking = 'all';
  state.eol = 'all';
  state.onlyFavorites = false;
  state.cardsPage = 1;
  state.compareMode = false;
  state.selectedIds = [];

  state.category = a.category === 'ar' ? 'AR' : a.category === 'xr' ? 'XR' : 'all';
  state.maxPrice = a.budget && a.budget !== 'any' ? BUDGET_MAX_PRICE[a.budget] || '' : '';
  state.maxWeight = a.formfactor === 'light' ? '150' : '';
  state.onlyAvailable = a.availability === 'current';
  state.sort = 'priority_default';

  window.dispatchEvent(new CustomEvent('ar-navigate', { detail: { path: '/' } }));
};

export const renderFinder = () => {
  const app = document.querySelector('#app');
  if (!app) return;
  app.innerHTML = finder.showResults ? resultsTemplate() : questionTemplate();

  if (finder.showResults) {
    app.querySelector('[data-finder-edit]')?.addEventListener('click', () => {
      finder.showResults = false;
      renderFinder();
    });
    app.querySelector('[data-finder-restart]')?.addEventListener('click', () => {
      resetFinder();
      renderFinder();
    });
    app.querySelector('[data-finder-apply]')?.addEventListener('click', applyAnswersToDirectory);
    return;
  }

  const q = getQuestions()[finder.step];
  const goNext = () => {
    if (finder.step < FINDER_QUESTIONS.length - 1) {
      finder.step += 1;
      renderFinder();
    } else {
      finder.showResults = true;
      renderFinder();
    }
  };

  app.querySelectorAll('[data-finder-option]').forEach((btn) => {
    btn.addEventListener('click', () => {
      finder.answers[q.id] = btn.getAttribute('data-finder-option');
      // Auto-advance for a snappy quiz feel.
      goNext();
    });
  });
  app.querySelector('[data-finder-next]')?.addEventListener('click', goNext);
  app.querySelector('[data-finder-back]')?.addEventListener('click', () => {
    if (finder.step > 0) {
      finder.step -= 1;
      renderFinder();
    }
  });
  app.querySelector('[data-finder-results]')?.addEventListener('click', () => {
    finder.showResults = true;
    renderFinder();
  });
};
