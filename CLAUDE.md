# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AR Directory — a curated AR/XR glasses comparison web application. Single-page app built with Vite + Vanilla JavaScript + Tailwind CSS. Displays 114+ AR/XR device specifications from a local CSV dataset with filtering, sorting, comparison, and internationalization (DE/EN).

## Commands

```bash
npm run dev              # Start Vite dev server
npm run build            # Production build → dist/
npm run preview          # Preview production build
npm run images:enrich    # Fetch/cache manufacturer product images
node scripts/generate-ar-csv.mjs  # Regenerate CSV + metadata from curated data
```

No test framework is configured. CI validates data generation and build success.

## Architecture

**Monolithic SPA**: `index.html` → `src/main.js` (single ~2200-line file containing all application logic).

**Data flow**:
1. `init()` loads CSV from `/data/ar_glasses.csv` via Papa Parse, fetches USD→EUR rate from Frankfurter API
2. Centralized `state` object holds all filters, view mode, language, theme, selections, pagination
3. `render()` is the core loop: filters rows → sorts → extracts filter options → builds DOM via template literals → attaches event listeners
4. URL params and localStorage keep state persistent across sessions

**Key patterns**:
- State management: single mutable `state` object, imperative updates trigger `render()`
- Rendering: string template literals building full DOM sections (no virtual DOM)
- Localization: `t(de, en)` helper function, `normalizeText()` for value matching
- Compare mode: up to 6 models side-by-side with SVG radar chart
- Image fallback: generated SVG data URLs with model initials
- Theme: dark (default) / light via CSS custom properties and body classes

**Data pipeline** (`scripts/`):
- `generate-ar-csv.mjs` — normalizes, validates, and outputs CSV + JSON metadata
- `enrich-manufacturer-images.mjs` — fetches official product images with per-model URL overrides, caches under `public/images/manufacturers/`

## CSV Dataset

33 fields per record in `public/data/ar_glasses.csv`. Key fields: `id`, `name`, `manufacturer`, `xr_category` (AR/XR), `price_usd`, `fov_*_deg`, `resolution_per_eye`, `refresh_hz`, `display_type`, `optics`, `tracking`, `release_date`, `eol_status`, `active_distribution`.

Metadata in `public/data/ar_glasses.metadata.json`.

## CI/CD (.gitlab-ci.yml)

Two stages on `node:20-alpine`:
1. **verify:data** — runs `generate-ar-csv.mjs`, checks CSV and metadata exist and are non-empty
2. **build:app** — runs `npm run build`, artifacts `dist/` (1 week retention)

## Deployment

Plesk via rsync. Build with `npm ci && npm run build`, deploy `dist/` to docroot. Node version managed by nodenv (see `.node-version`: Node 24).
