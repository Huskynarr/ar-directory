import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import Papa from 'papaparse';
import { assignDevicePaths } from './src/data/paths.js';

const DATA_DIR = 'public/data';

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fact = (label, value, suffix = '') =>
  value !== undefined && value !== null && String(value).trim() !== ''
    ? `<dt>${label}</dt><dd>${escapeHtml(value)}${suffix}</dd>`
    : '';

const buildCatalogHtml = (rows, paths) => {
  const items = rows
    .map((row) => {
      const fov = [row.fov_horizontal_deg, row.fov_vertical_deg, row.fov_diagonal_deg]
        .map((value) => (String(value || '').trim() ? value : '–'))
        .join(' / ');
      const path = paths.get(row.id)?.path;
      const link = path
        ? ` <a href="/${path}/">Details &amp; Vergleich</a>`
        : row.official_url
          ? ` <a href="${escapeHtml(row.official_url)}" rel="nofollow noopener">Produktseite</a>`
          : '';
      return `<article>
  <h3>${path ? `<a href="/${path}/">${escapeHtml(row.name)}</a>` : escapeHtml(row.name)}</h3>
  <dl>
    ${fact('Hersteller', row.manufacturer)}
    ${fact('Kategorie', row.xr_category)}
    ${fact('Release', row.release_date)}
    ${fact('Preis (USD)', row.price_usd ? `$${row.price_usd}` : '')}
    ${fact('Display', row.display_type)}
    ${fact('Optik', row.optics)}
    ${row.fov_horizontal_deg || row.fov_vertical_deg || row.fov_diagonal_deg ? `<dt>FOV (H/V/D)</dt><dd>${escapeHtml(fov)}</dd>` : ''}
    ${fact('Aufloesung/Auge', row.resolution_per_eye)}
    ${fact('Refresh', row.refresh_hz, ' Hz')}
    ${fact('Gewicht', row.weight_g, ' g')}
    ${fact('Tracking', row.tracking)}
    ${fact('Lifecycle', row.eol_status)}
  </dl>${link}
</article>`;
    })
    .join('\n');
  return `<section id="static-catalog" aria-label="Vollstaendige Modelliste">
  <h2>Alle ${rows.length} AR/XR Brillen im Ueberblick</h2>
  ${items}
</section>`;
};

// Injects build-time SEO/LLM content derived from the curated dataset so crawlers
// and JS-less AI agents see the full catalog + structured data in the shipped HTML.
const seoInjectPlugin = () => ({
  name: 'ar-directory-seo-inject',
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      const metadata = readJson(`${DATA_DIR}/ar_glasses.metadata.json`) || {};
      const structured = readJson(`${DATA_DIR}/structured-data.json`);

      let rows = [];
      try {
        const parsed = Papa.parse(readFileSync(`${DATA_DIR}/ar_glasses.csv`, 'utf8'), {
          header: true,
          skipEmptyLines: true,
        });
        rows = Array.isArray(parsed.data) ? parsed.data.filter((r) => r.name) : [];
      } catch {
        rows = [];
      }

      const tokens = {
        __COUNT__: String(metadata.records ?? rows.length ?? ''),
        __AR__: String(metadata.ar_records ?? ''),
        __XR__: String(metadata.xr_records ?? ''),
        __MANUFACTURERS__: String(metadata.manufacturers ?? ''),
      };
      let out = html;
      for (const [token, value] of Object.entries(tokens)) {
        out = out.replaceAll(token, value);
      }

      const ldScript = structured
        ? `<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script>`
        : '';
      out = out.replace('<!-- @structured-data -->', ldScript);

      const paths = assignDevicePaths(rows);
      const catalog = rows.length ? buildCatalogHtml(rows, paths) : '';
      out = out.replace('<!-- @catalog -->', catalog);

      return out;
    },
  },
});

// GitHub Pages serves 404.html for any path without a matching file. Copying the
// built index.html there lets client-side routes like /compare/<a>-vs-<b> boot
// the SPA (which then reads location.pathname). Device pages are real files and
// are served directly, so they never hit this fallback.
const spaFallbackPlugin = () => ({
  name: 'ar-directory-spa-404',
  closeBundle() {
    try {
      writeFileSync('dist/404.html', readFileSync('dist/index.html', 'utf8'));
    } catch {}
  },
});

const buildStamp = new Date()
  .toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  .replace(', ', ' - ');

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(buildStamp),
  },
  plugins: [tailwindcss(), seoInjectPlugin(), spaFallbackPlugin()],
});
