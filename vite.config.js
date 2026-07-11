import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import Papa from 'papaparse';
import { assignDevicePaths } from './src/data/paths.js';
import { FINDER_QUESTIONS } from './src/data/finder-questions.js';

const DATA_DIR = 'public/data';
const SITE = 'https://ar-directory.huskynarr.de';

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
  const featuredRows = rows.slice(0, 12);
  const items = featuredRows
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
  return `<section id="static-catalog" aria-label="Aktuelle Modelle">
  <h2>Aktuelle AR/XR Brillen im Ueberblick</h2>
  ${items}
  <p><a href="/modelle/">Alle ${rows.length} Modelle in der crawlbaren Modellliste öffnen</a></p>
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

      const homepageStructured = structured
        ? {
            ...structured,
            '@graph': (structured['@graph'] || []).map((node) =>
              node['@type'] === 'ItemList'
                ? { ...node, itemListElement: (node.itemListElement || []).slice(0, 12) }
                : node,
            ),
          }
        : null;
      const ldScript = homepageStructured
        ? `<script type="application/ld+json">${JSON.stringify(homepageStructured).replace(/</g, '\\u003c')}</script>`
        : '';
      out = out.replace('<!-- @structured-data -->', ldScript);

      const paths = assignDevicePaths(rows);
      const catalog = rows.length ? buildCatalogHtml(rows, paths) : '';
      out = out.replace('<!-- @catalog -->', catalog);

      return out;
    },
  },
});

// FAQ entries power both the crawlable FAQ block and the FAQPage JSON-LD on the
// static /finder/ landing page.
const FINDER_FAQ = [
  {
    q: 'Wie funktioniert der AR-/XR-Brillen-Finder?',
    a: 'Du beantwortest sechs kurze Fragen zu Einsatzzweck, Bauart, Budget, Gewicht, Anschlussart und Verfügbarkeit. Der Finder bewertet anschließend jedes Modell im Datenbestand nach Passgenauigkeit und zeigt dir die besten Treffer mit Match-Prozent und Begründung.',
  },
  {
    q: 'Welche AR-Brille ist die richtige für mich?',
    a: 'Das hängt vom Einsatz ab: Für Filme und Arbeit unterwegs eignen sich leichte AR-/Display-Brillen mit scharfem Micro-OLED-Bild, für immersives Gaming eher XR-Headsets mit hoher Bildrate und 6DoF-Tracking. Für den Alltag sind sehr leichte Smart-/AI-Brillen interessant. Der Finder filtert anhand deiner Prioritäten.',
  },
  {
    q: 'Welche Brille eignet sich für Filme unterwegs?',
    a: 'Leichte AR-Display-Brillen mit Micro-OLED-Panels und 1080p pro Auge projizieren ein großes virtuelles Kinobild und lassen sich an Smartphone, Konsole oder Laptop anschließen. Wähle im Finder "Filme & Medien unterwegs" sowie "So leicht wie möglich".',
  },
  {
    q: 'Standalone oder an Handy/PC angeschlossen – was ist besser?',
    a: 'Standalone-Geräte haben eigenen Akku und Chip und brauchen kein Kabel, sind aber meist schwerer. Angeschlossene (tethered) Brillen sind leichter und günstiger, benötigen aber eine Quelle wie Smartphone oder PC. Im Finder kannst du deine Präferenz angeben oder "Egal" wählen.',
  },
  {
    q: 'Was kostet eine gute AR- oder XR-Brille?',
    a: 'Einsteiger-Display-Brillen gibt es ab rund 300 €, solide Mittelklasse liegt bei 300–600 €, gehobene Modelle bei 600–1500 €. High-End-Headsets können deutlich darüber liegen. Im Finder lässt sich das Budget direkt eingrenzen.',
  },
];

// Static, crawlable body for /finder/. Replaced at runtime by the interactive
// finder once JS boots — so this exists purely for search engines and no-JS
// agents. German because the document is lang="de".
const buildFinderBody = (count) => {
  const total = count || 'allen';
  const questions = FINDER_QUESTIONS.map(
    (q) => `        <section class="finder-q">
          <h2>${escapeHtml(q.header.de)}: ${escapeHtml(q.question.de)}</h2>
          <ul>
            ${q.options
              .map((o) => `<li><strong>${escapeHtml(o.label.de)}</strong> – ${escapeHtml(o.desc.de)}</li>`)
              .join('\n            ')}
          </ul>
        </section>`,
  ).join('\n');

  const quickLinks = [
    ['/?category=AR', 'Leichte AR-/Display-Brillen'],
    ['/?category=XR', 'Immersive XR-/VR-Headsets'],
    ['/?maxPrice=350', 'Brillen bis ca. 300 €'],
    ['/?maxWeight=150', 'Besonders leichte Brillen (≤ 150 g)'],
    ['/?onlyAvailable=1', 'Aktuell erhältliche Modelle'],
    ['/?category=XR&minRefresh=90', 'XR-Headsets fürs Gaming (90 Hz+)'],
  ]
    .map(([href, label]) => `<li><a href="${href}">${escapeHtml(label)}</a></li>`)
    .join('\n            ');

  const faq = FINDER_FAQ.map(
    (f) => `        <section class="finder-faq-item">
          <h3>${escapeHtml(f.q)}</h3>
          <p>${escapeHtml(f.a)}</p>
        </section>`,
  ).join('\n');

  return `<main id="main-content">
        <header>
          <p>AR / XR FINDER</p>
          <h1>Welche AR-/XR-Brille passt zu mir?</h1>
          <p>
            Beantworte sechs kurze Fragen und der Finder durchsucht ${escapeHtml(String(total))}
            AR- und XR-Brillen nach den besten Treffern für deinen Einsatzzweck, dein Budget und deine
            Wunsch-Bauart. Der interaktive Finder lädt automatisch, sobald JavaScript aktiv ist.
          </p>
          <p>
            <a href="/">Zum interaktiven Vergleich</a> ·
            <a href="/modelle/">Alle Modelle als Liste</a>
          </p>
        </header>

        <section>
          <h2>So funktioniert der Finder</h2>
          <p>
            Der Finder gewichtet zu jedem Gerät Spezifikationen wie Kategorie (AR/XR), Field of View,
            Bildwiederholrate, Auflösung, Gewicht, Tracking, Display-Typ sowie Standalone- bzw.
            Tethered-Betrieb gegen deine Antworten und sortiert die Modelle nach Passgenauigkeit.
          </p>
        </section>

        <section aria-label="Fragen des Finders">
          <h2>Die Fragen im Überblick</h2>
${questions}
        </section>

        <section aria-label="Beliebte Einstiege">
          <h2>Beliebte Einstiege</h2>
          <ul>
            ${quickLinks}
            <li><a href="/modelle/">Alle Modelle als Liste</a></li>
          </ul>
        </section>

        <section id="faq" aria-label="Häufige Fragen">
          <h2>Häufige Fragen</h2>
${faq}
        </section>
      </main>`;
};

const buildFinderJsonLd = (count) => {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: 'AR/XR Brillen-Finder',
        url: `${SITE}/finder/`,
        applicationCategory: 'BrowserApplication',
        operatingSystem: 'Web',
        inLanguage: 'de',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        description: `Geführter Finder, der ${count || 'alle'} AR- und XR-Brillen anhand von sechs Fragen nach Passgenauigkeit empfiehlt.`,
      },
      {
        '@type': 'FAQPage',
        mainEntity: FINDER_FAQ.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Start', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Brillen-Finder', item: `${SITE}/finder/` },
        ],
      },
    ],
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
};

// Emit a real, crawlable dist/finder/index.html. It reuses the freshly built
// index.html (hashed asset tags + base head) so JS boots the same SPA bundle and
// the interactive finder takes over; the swapped-in static body + finder-specific
// head/JSON-LD give search engines a proper 200 page instead of the 404 fallback.
const buildFinderPage = (builtIndexHtml, count) => {
  const title = 'AR-/XR-Brillen-Finder: In 6 Fragen zur passenden Brille | AR Directory';
  const desc = `Finde die passende AR- oder XR-Brille: Beantworte sechs kurze Fragen zu Einsatz, Budget, Gewicht und Bauart – der Finder vergleicht ${count || 'alle'} Modelle und zeigt deine besten Treffer.`;
  const ogTitle = 'AR-/XR-Brillen-Finder – in 6 Fragen zur passenden Brille';

  let html = builtIndexHtml
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta[^>]*name="description"[^>]*>/, `<meta name="description" content="${escapeHtml(desc)}" />`)
    .replace(/<link[^>]*rel="canonical"[^>]*>/, `<link rel="canonical" href="${SITE}/finder/" />`)
    .replace(/<meta[^>]*property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeHtml(ogTitle)}" />`)
    .replace(/<meta[^>]*property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeHtml(desc)}" />`)
    .replace(/<meta[^>]*property="og:url"[^>]*>/, `<meta property="og:url" content="${SITE}/finder/" />`)
    .replace(/<meta[^>]*name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escapeHtml(ogTitle)}" />`)
    .replace(/<meta[^>]*name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escapeHtml(desc)}" />`)
    .replace(
      /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
      `<script type="application/ld+json">${buildFinderJsonLd(count)}</script>`,
    );

  // Replace the #app mount content with the finder-specific static body.
  const appStart = html.indexOf('<div id="app">');
  const noscriptIdx = html.indexOf('<noscript>', appStart);
  if (appStart !== -1 && noscriptIdx !== -1) {
    const before = html.slice(0, appStart);
    const after = html.slice(noscriptIdx);
    html = `${before}<div id="app">\n      ${buildFinderBody(count)}\n    </div>\n    ${after}`;
  }
  return html;
};

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

// Writes the crawlable static landing page at dist/finder/index.html, reusing
// the just-built index.html so it ships the same hashed SPA bundle.
const finderPagePlugin = () => ({
  name: 'ar-directory-finder-page',
  closeBundle() {
    try {
      const index = readFileSync('dist/index.html', 'utf8');
      const metadata = readJson(`${DATA_DIR}/ar_glasses.metadata.json`) || {};
      const count = metadata.records ? String(metadata.records) : '';
      mkdirSync('dist/finder', { recursive: true });
      writeFileSync('dist/finder/index.html', buildFinderPage(index, count));
    } catch (error) {
      console.warn('[finder-page] skipped:', error?.message || error);
    }
  },
});

// The generated app stylesheet is small enough to inline in SPA entry pages,
// removing a render-blocking request. Static pages keep their cached app.css.
const inlineAppCssPlugin = () => ({
  name: 'ar-directory-inline-app-css',
  enforce: 'post',
  closeBundle() {
    for (const htmlPath of ['dist/index.html', 'dist/404.html', 'dist/finder/index.html']) {
      try {
        const html = readFileSync(htmlPath, 'utf8');
        const match = html.match(/<link rel="stylesheet" crossorigin href="([^"]+\.css)">/);
        if (!match) continue;
        const css = readFileSync(`dist${match[1]}`, 'utf8').replace(/<\/style/gi, '<\\/style');
        writeFileSync(htmlPath, html.replace(match[0], `<style data-app-css>${css}</style>`));
      } catch (error) {
        console.warn('[inline-app-css] skipped:', error?.message || error);
      }
    }
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
  plugins: [tailwindcss(), seoInjectPlugin(), spaFallbackPlugin(), finderPagePlugin(), inlineAppCssPlugin()],
});
