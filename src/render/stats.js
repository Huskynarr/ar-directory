export const buildStatsChartSvg = (arCount, xrCount) => {
  const total = arCount + xrCount;
  if (total === 0) return '';
  const w = 200;
  const h = 24;
  const arW = Math.round((arCount / total) * w);
  const arPct = ((arCount / total) * 100).toFixed(0);
  return `<svg viewBox="0 0 ${w} ${h}" class="inline-block h-6 w-full max-w-[200px] rounded-full overflow-hidden" aria-label="AR ${arCount} / XR ${xrCount}">
    <rect x="0" y="0" width="${arW}" height="${h}" fill="#84cc16" />
    <rect x="${arW}" y="0" width="${w - arW}" height="${h}" fill="#0e7490" />
    <text x="${arW / 2}" y="${h / 2 + 1}" text-anchor="middle" dominant-baseline="central" font-size="10" fill="#0c0a09" font-weight="700">AR ${arPct}%</text>
    <text x="${arW + (w - arW) / 2}" y="${h / 2 + 1}" text-anchor="middle" dominant-baseline="central" font-size="10" fill="#fff" font-weight="700">XR ${100 - Number(arPct)}%</text>
  </svg>`;
};
