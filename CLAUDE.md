# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AR Directory — a curated AR/XR glasses comparison web application. Single-page app built with Vite + Vanilla JavaScript + Tailwind CSS. Displays 200+ AR/XR device specifications from a local CSV dataset with filtering, sorting, comparison, and internationalization (DE/EN).

## Commands

```bash
npm run dev              # Start Vite dev server
npm run build            # Production build → dist/ (Vite plugin injects JSON-LD + static catalog)
npm run preview          # Preview production build
npm test                 # Run Vitest unit tests
npm run test:watch       # Run tests in watch mode
npm run data:generate    # Regenerate CSV (normalize) + metadata + all SEO/LLM artifacts
npm run data:enrich      # Apply scripts/enrichment-2026.json (field updates + new devices) to CSV
npm run og:generate      # Regenerate branded 1200x630 OG share cards -> public/og/models/<slug>.png (needs sharp; run locally + commit)
npm run images:enrich    # Fetch/cache manufacturer product images
```

## Architecture

**Modular SPA**: `index.html` → `src/main.js` (thin orchestrator: `render()` loop, event wiring, `init()`) wiring together focused ES modules:
- `src/state.js` — central `state` object, constants, theme/language/favorites, localStorage + URL persistence
- `src/i18n.js` — `t()`, locale/number/currency/date formatting
- `src/seo.js` — runtime document SEO signal updates; `src/actions.js` — CSV export, share URL
- `src/data/` — `dataset.js` (Papa Parse, FX rate), `model.js` (row-derived helpers), `filters.js` (filter/sort)
- `src/render/` — `cards.js`, `table.js`, `compare.js` (radar), `modal.js`, `image.js`, `shared.js`, `stats.js`, `registry.js` (render-callback registry to avoid an import cycle)
- `src/utils.js` — pure utilities (unit-tested)

**Data flow**:
1. `init()` loads CSV from `/data/ar_glasses.csv` via Papa Parse, fetches USD→EUR rate from Frankfurter API, loads favorites/theme/language from localStorage
2. Centralized `state` object holds all filters, view mode, language, theme, selections, pagination, favorites
3. `render()` is the core loop: filters rows → sorts → extracts filter options → builds DOM via template literals → attaches event listeners
4. URL params and localStorage keep state persistent across sessions

**Key patterns**:
- State management: single mutable `state` object, imperative updates trigger `render()`
- Rendering: string template literals building full DOM sections (no virtual DOM)
- Localization: `t(de, en)` helper function, `normalizeText()` for value matching
- Compare mode: up to 6 models side-by-side with SVG radar chart
- Detail modal: click card image to open fullscreen detail view
- Favorites: localStorage-persisted, filterable via "Only favorites" toggle
- Image fallback: generated SVG data URLs with model initials
- Theme: auto-detects `prefers-color-scheme`, then dark/light via CSS custom properties
- Keyboard shortcuts: `/` focuses search, `Esc` clears search or closes modal
- Pagination: cards view shows one page at a time (`CARDS_PER_PAGE`) with windowed page controls (`paginationTemplate`); changing page scrolls to the top of `#results` so the footer stays reachable. `cardsPage` persists in the URL.
- Performance: debounced search (150ms) and numeric inputs (200ms)

**Data pipeline** (`scripts/`):
- `generate-ar-csv.mjs` — normalizes/validates the CSV and generates ALL derived artifacts from it (single source of truth): `ar_glasses.metadata.json`, `structured-data.json` (JSON-LD), `sitemap.xml`, `llms.txt`, `llms-full.txt`, `ai-search.json`, plus static crawlable pages (`public/<brand>/<model>/index.html` per device, `public/modelle/index.html` catalog, `public/glossar.html`) via `scripts/lib/render-pages.mjs`. It also writes legacy redirect stubs at `public/modelle/<slug>.html` (canonical + meta-refresh → new URL) since GitHub Pages can't issue real 301s. Tolerates recoverable CSV quote/CRLF warnings.

**URL scheme**: device pages live at `/<brand>/<model>/` (e.g. `/xreal/one-pro/`); compare is a client route `/compare/<brand-model>-vs-<brand-model>`. Path derivation lives in `src/data/paths.js` (`assignDevicePaths`) and is imported by BOTH the build (generate-ar-csv, render-pages, vite.config) and the SPA so static pages and client links always agree. The SPA keeps the in-page modal for quick detail viewing and links its "Detailseite" button to the real subpage.
- `apply-enrichment.mjs` — applies a research payload (`enrichment-2026.json`: per-field changes keyed by id + new device rows with sources) to the CSV; identity/image/provenance columns are immutable. Run `data:generate` afterwards.
- `enrich-manufacturer-images.mjs` — fetches official product images with per-model URL overrides, caches under `public/images/manufacturers/`

**Affiliate** (`src/affiliate.js`, imported by app + page generator): scaffolding for Amazon.de/.com, eBay, Otto, idealo (Otto/idealo via AWIN). `AFFILIATE.enabled` is false by default — no buy buttons/disclosure ship until partner IDs + legal pages are set. `buildBuyLinks(row, overrides)` prefers curated deeplinks from `public/data/affiliate-overrides.json` (keyed by CSV id), else builds tagged search links; all get `rel="sponsored nofollow noopener"`. Legal templates `public/impressum.html` + `public/datenschutz.html` are generated (fill `[PLATZHALTER]`).

**Branded OG cards**: `scripts/generate-og-images.mjs` (`npm run og:generate`) renders a 1200x630 PNG share card per device (name, manufacturer, category, key spec chips, price) via `sharp` into `public/og/models/<slug>.png`. Device pages set `og:image`/`twitter:image` to these cards. Run locally and COMMIT the PNGs — they are static assets, so the deploy host needs no image build step. `sharp` is an `optionalDependency` so `npm ci` on the host won't fail if it can't build it.

**Build-time SEO injection** (`vite.config.js`): a `transformIndexHtml` plugin replaces `__COUNT__/__AR__/__XR__/__MANUFACTURERS__` tokens from metadata, injects the generated JSON-LD into `<head>`, and renders a static crawlable `<section>` catalog of all models into `#app` (the SPA replaces it at runtime — so crawlers/JS-less AI agents see full content).

**Testing** (`src/__tests__/`):
- Vitest for unit tests on pure utility functions in `src/utils.js`
- 105 tests covering escapeHtml, safeExternalUrl, toNumber, parsePrice, normalizeText, parseResolutionWidth, parseBooleanParam, isUnknownValue, toInitials, debounce, uniqueSorted

**PWA**:
- `public/manifest.json` — web app manifest for installation
- `public/sw.js` — service worker with cache-first for static assets, network-first for data

## CSV Dataset

40 fields per record in `public/data/ar_glasses.csv` (268 records). Deeper spec columns (`chipset`, `brightness_nits`, `connectivity`, `audio`, `battery`, `ipd_mm`, `prescription_support`, `camera`) are surfaced on the static per-device pages. Key fields: `id`, `name`, `manufacturer`, `xr_category` (AR/XR), `price_usd`, `fov_*_deg`, `resolution_per_eye`, `refresh_hz`, `display_type`, `optics`, `tracking`, `release_date`, `eol_status`, `active_distribution`.

Metadata in `public/data/ar_glasses.metadata.json`.

## CI/CD (.gitlab-ci.yml)

Two stages on `node:20-alpine`:
1. **verify:data** — runs `generate-ar-csv.mjs`, checks CSV and metadata exist and are non-empty
2. **build:app** — runs `npm run build`, artifacts `dist/` (1 week retention)

## Deployment

GitHub Pages at custom domain `ar-directory.huskynarr.de` (subdomain root, so Vite `base` stays `/`). Build with `npm ci && npm run build`, publish `dist/`. Build emits `dist/404.html` (copy of `index.html`) so client routes like `/compare/...` boot the SPA, plus `CNAME` and `.nojekyll` (shipped from `public/`). Device pages are real files served directly; only unknown paths fall through to `404.html`. Node version managed by nodenv (see `.node-version`: Node 24).
