import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import Papa from 'papaparse';
import { assignSlugs } from './scripts/lib/render-pages.mjs';

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

const buildCatalogHtml = (rows, slugs) => {
  const items = rows
    .map((row) => {
      const fov = [row.fov_horizontal_deg, row.fov_vertical_deg, row.fov_diagonal_deg]
        .map((value) => (String(value || '').trim() ? value : '–'))
        .join(' / ');
      const slug = slugs.get(row.id);
      const link = slug
        ? ` <a href="/modelle/${slug}.html">Details &amp; Vergleich</a>`
        : row.official_url
          ? ` <a href="${escapeHtml(row.official_url)}" rel="nofollow noopener">Produktseite</a>`
          : '';
      return `<article>
  <h3>${slug ? `<a href="/modelle/${slug}.html">${escapeHtml(row.name)}</a>` : escapeHtml(row.name)}</h3>
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

      const slugs = assignSlugs(rows);
      const catalog = rows.length ? buildCatalogHtml(rows, slugs) : '';
      out = out.replace('<!-- @catalog -->', catalog);

      return out;
    },
  },
});

export default defineConfig({
  plugins: [tailwindcss(), seoInjectPlugin()],
});
