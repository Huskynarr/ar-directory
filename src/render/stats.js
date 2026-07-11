import { t } from '../i18n.js';

/**
 * Renders a compact, theme-adaptive AR vs XR split visualization.
 *
 * NOTE: signature is intentionally `(arCount, xrCount)` to match the call site
 * in main.js. Do not rename or add required params.
 */
export const buildStatsChartSvg = (arCount, xrCount) => {
  const ar = Math.max(0, Number(arCount) || 0);
  const xr = Math.max(0, Number(xrCount) || 0);
  const total = ar + xr;
  if (total === 0) return '';

  const arPct = Math.round((ar / total) * 100);
  const xrPct = 100 - arPct;

  const arLabel = t('AR-Brillen', 'AR glasses');
  const xrLabel = t('XR-Brillen', 'XR glasses');
  const summary = `${arLabel}: ${ar} (${arPct}%), ${xrLabel}: ${xr} (${xrPct}%)`;

  // --- Donut gauge geometry --------------------------------------------------
  const size = 52;
  const cx = size / 2;
  const cy = size / 2;
  const r = 21;
  const stroke = 7;
  const circ = 2 * Math.PI * r;
  const arLen = (ar / total) * circ;
  const gap = total > 0 && ar > 0 && xr > 0 ? 3 : 0; // tiny visual separator
  const arDash = Math.max(0, arLen - gap);
  const xrDash = Math.max(0, circ - arLen - gap);

  // --- Horizontal segmented bar geometry ------------------------------------
  const barW = 168;
  const barH = 18;
  const minSeg = total > 0 ? 18 : 0; // keep both segments visible if non-zero
  let arBar = Math.round((ar / total) * barW);
  if (ar > 0) arBar = Math.max(minSeg, arBar);
  if (xr > 0) arBar = Math.min(arBar, barW - minSeg);
  const xrBar = barW - arBar;

  const arVisible = ar > 0;
  const xrVisible = xr > 0;

  return `
    <div class="flex items-center gap-3" role="img" aria-label="${summary}">
      <span class="sr-only">${summary}</span>
      <svg viewBox="0 0 ${size} ${size}" class="h-12 w-12 shrink-0 -rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="stats-ar-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#a3e635" />
            <stop offset="100%" stop-color="#84cc16" />
          </linearGradient>
          <linearGradient id="stats-xr-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#a8b2ad" />
            <stop offset="100%" stop-color="#6f7c77" />
          </linearGradient>
        </defs>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${stroke}"
          stroke="#78716c" stroke-opacity="0.22" />
        ${
          xrVisible
            ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#stats-xr-grad)"
                stroke-width="${stroke}" stroke-linecap="round"
                stroke-dasharray="${xrDash} ${circ - xrDash}"
                stroke-dashoffset="${-(arLen + gap)}" />`
            : ''
        }
        ${
          arVisible
            ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#stats-ar-grad)"
                stroke-width="${stroke}" stroke-linecap="round"
                stroke-dasharray="${arDash} ${circ - arDash}"
                stroke-dashoffset="0" />`
            : ''
        }
      </svg>

      <div class="flex flex-col gap-1.5">
        <svg viewBox="0 0 ${barW} ${barH}" width="${barW}" height="${barH}"
          class="h-[18px] w-[168px] overflow-visible" aria-hidden="true">
          <clipPath id="stats-bar-clip">
            <rect x="0" y="0" width="${barW}" height="${barH}" rx="${barH / 2}" />
          </clipPath>
          <g clip-path="url(#stats-bar-clip)">
            ${
              arVisible
                ? `<rect x="0" y="0" width="${arBar}" height="${barH}" fill="url(#stats-ar-grad)" />
                   <text x="9" y="${barH / 2 + 1}" dominant-baseline="central"
                     font-size="10" font-weight="800" fill="#1a2e05">AR ${arPct}%</text>`
                : ''
            }
            ${
              xrVisible
                ? `<rect x="${arBar}" y="0" width="${xrBar}" height="${barH}" fill="url(#stats-xr-grad)" />
                   <text x="${barW - 9}" y="${barH / 2 + 1}" text-anchor="end" dominant-baseline="central"
                     font-size="10" font-weight="800" fill="#ffffff">XR ${xrPct}%</text>`
                : ''
            }
          </g>
        </svg>
        <div class="flex items-center gap-3 text-[11px] font-medium text-[#a8a29e]">
          <span class="inline-flex items-center gap-1.5">
            <span class="inline-block h-2 w-2 rounded-full bg-[#84cc16]"></span>
            <span class="text-[#f5f5f4]">${ar}</span> AR
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="inline-block h-2 w-2 rounded-full bg-[#6f7c77]"></span>
            <span class="text-[#f5f5f4]">${xr}</span> XR
          </span>
        </div>
      </div>
    </div>
  `;
};
