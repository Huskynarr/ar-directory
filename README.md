# AR/XR Brillen Vergleich

Webverzeichnis fuer AR- und XR-Brillen mit Fokus auf Vergleichbarkeit:
- Kartenansicht und tabellarische Ansicht
- Shop-Link pro Modell
- Preisstatus pro Modell
- Spezifikationen (Display, FOV, Refresh, Tracking, Compute, Software)
- Lifecycle-Infos (aktiver Vertrieb, EOL-Status, Hinweise)

## Screenshot

![AR-XR Vergleich Startseite](docs/screenshots/startseite.png)

## Features

- Startseite zeigt alle verfuegbaren Brillen als Cards
- Umschaltbar zwischen `Cards` und `Tabelle`
- Volltextsuche (Modell, Hersteller, Software, Tracking, Display, Lifecycle-Notizen)
- Filter:
  - Kategorie (`AR` / `XR`)
  - Hersteller
  - Display-Typ
  - Optik
  - Tracking
  - Eye Tracking
  - Hand Tracking
  - Passthrough
  - aktiver Vertrieb
  - Preset `Nur aktiv im Vertrieb` fuer schnellen Fokus auf verfuegbare Modelle
  - explizite `AR-Flag` und `XR-Flag` Toggle
  - EOL/Update-Status
  - minimaler horizontaler Winkel (FOV)
  - minimale Refresh-Rate
  - maximaler Preis (USD)
  - nur mit Preis
  - nur mit Shop-Link
- Sortierung:
  - Name, Hersteller, Neueste, Preis, FOV
- Sprache:
  - DE/EN Umschaltung per UI-Button
  - persistiert in LocalStorage und URL-Parameter `lang`
- Teilen:
  - URL-sharebar (Filter, Sortierung und Compare-Auswahl koennen direkt geteilt werden)
- Vergleich:
  - Multi-Select mit bis zu 6 Modellen
  - Compare-Modus mit direkter Merkmalsmatrix
  - Radar-Chart fuer schnellen visuellen Modellvergleich
- Datenexport:
  - `CSV Export` fuer aktuell gefilterte Ergebnisse
- Ansichtsoptionen:
  - `EUR-Zusatz` nutzt einen Live-EUR-Kurs zur USD-Umrechnung
  - `Unbekannte Werte ausblenden` reduziert Rauschen in Listen und Compare-Ansicht
  - `Hellmodus`/`Dunkelmodus` (huskynarr-inspiriert), persistent per LocalStorage und URL-Parameter `theme`
- Kartenansicht:
  - initial 12 Cards und `Mehr laden` Pagination
- Karten enthalten:
  - Bild, Name, Hersteller, Kategorie
  - Preis, Vertrieb, Lifecycle/EOL
  - Display, Optik, FOV, Refresh, Aufloesung
  - Software, Compute Unit, Tracking, Eye/Hand/Passthrough
  - Shop-Link + Datenquelle

## Datenabdeckung

- Enthalten sind AR-Modelle plus XR-Brillen (Display-/Smart-Glasses-Kategorie)
- Legacy-Modelle sind explizit enthalten, z. B.:
  - Microsoft HoloLens 1
  - Epson Moverio BT-200
  - Sony SmartEyeglass (SED-E1)
  - Recon Jet
  - Vuzix M100
- Aktueller Datensatzstand: `public/data/ar_glasses.metadata.json`

## Tech Stack

- Vite
- Tailwind CSS (via `@tailwindcss/vite`)
- Vanilla JavaScript
- Papa Parse (CSV Parsing)

## Datenquelle

Die Datengrundlage ist ein kuratierter lokaler Datensatz:
- Generator: `scripts/generate-ar-csv.mjs`
- Herstellerbild-Enrichment: `scripts/enrich-manufacturer-images.mjs`
- Ausgabe:
  - `public/data/ar_glasses.csv`
  - `public/data/ar_glasses.metadata.json`
- Bilddarstellung:
  - Primar werden `image_url`-Eintraege aus offiziellen Herstellerseiten genutzt.
  - Fuer technisch instabile Legacy-Quellen werden originale Herstellerbilder lokal gespiegelt unter `public/images/manufacturers/`.
  - Das Enrichment nutzt zusaetzlich kuratierte Modell-Overrides und markeninterne Fallbacks, falls einzelne Produktseiten technisch nicht mehr erreichbar sind.
  - Falls kein valides Herstellerbild gefunden wird, zeigt die UI eine lokale SVG-Fallback-Visualisierung.

## SEO & LLM Discovery

Fuer bessere Auffindbarkeit in Suchmaschinen und LLM-basierten Suchsystemen sind enthalten:
- HTML-Meta-Optimierung in `index.html`:
  - Title/Description/Robots
  - OpenGraph + Twitter Cards
  - JSON-LD (`WebSite`, `CollectionPage`, `Dataset`)
- Crawl-Dateien:
  - `public/robots.txt`
  - `public/sitemap.xml`
  - `public/llms.txt`
  - `public/llms-full.txt`
  - `public/ai-search.json`
- OpenGraph-Bild:
  - `public/og/startseite.png`

Wenn die Seite nicht unter `https://huskynarr.de/` laeuft, sollten URLs in
`public/sitemap.xml`, `public/robots.txt`, `public/llms.txt`, `public/llms-full.txt` und `public/ai-search.json`
auf die produktive Domain angepasst werden.

## Lokale Entwicklung

Voraussetzungen:
- Node.js 20+
- npm

Installation:

```bash
npm ci
```

Entwicklung starten:

```bash
npm run dev
```

Produktions-Build:

```bash
npm run build
```

Build lokal pruefen:

```bash
npm run preview
```

Datensatz neu generieren:

```bash
node scripts/generate-ar-csv.mjs
```

Herstellerbilder aus offiziellen Seiten neu anreichern:

```bash
npm run images:enrich
```

## Projektstruktur

```text
.
├─ public/
│  └─ data/
│     ├─ ar_glasses.csv
│     └─ ar_glasses.metadata.json
│  └─ images/
│     └─ manufacturers/
├─ scripts/
│  ├─ generate-ar-csv.mjs
│  └─ enrich-manufacturer-images.mjs
├─ src/
│  ├─ main.js
│  └─ style.css
├─ docs/
│  └─ screenshots/
│     └─ startseite.png
├─ .gitlab-ci.yml
├─ .node-version
├─ CONTRIBUTING.md
├─ LICENSE
├─ vite.config.js
└─ README.md
```

## CI / GitLab Pipeline

Die `.gitlab-ci.yml` enthaelt zwei Jobs:
- `verify:data`: prueft, ob Daten generiert werden koennen und die Exportdateien existieren
- `build:app`: baut die App mit Vite und speichert `dist/` als Artefakt

Damit sind Datenvalidierung und Build in CI abgedeckt.

## Deployment (Plesk)

Wenn Plesk das Repository direkt zieht, ist der uebliche Ablauf:
- Repository in Plesk verbinden und Auto-Deployment aktivieren
- Node-Version festlegen:
  - Im Repo liegt `.node-version` mit `24` fuer `nodenv`.
- Als Deployment Action auf dem Plesk-Host ein robustes Script verwenden (non-interactive shell + nodenv):

```bash
set -euo pipefail

export NODENV_ROOT="$HOME/.nodenv"
export PATH="$NODENV_ROOT/bin:$NODENV_ROOT/shims:$PATH"
if command -v nodenv >/dev/null 2>&1; then
  eval "$(nodenv init -)"
fi

# sicherstellen, dass im Repo gearbeitet wird
cd /var/www/vhosts/huskynarr.de/ardirectory.huskynarr.de

node -v
npm -v
npm ci
npm run build

# Dist in Docroot kopieren (Pfad bei Bedarf anpassen)
rsync -a --delete dist/ /var/www/vhosts/huskynarr.de/ardirectory.huskynarr.de/httpdocs/
```

- Falls `nodenv` nicht verwendet wird, alternativ absolute Node/NPM-Binaries aus einer installierten Version nutzen
  (z. B. `$HOME/.nodenv/versions/24/bin/node` und `$HOME/.nodenv/versions/24/bin/npm`).
- Optional fuer SPA-Routing (nur falls direkte Unterseiten-URLs 404 liefern) `.htaccess` im Docroot hinterlegen:

```apacheconf
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

## Contributing

Details fuer Contributions stehen in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

Dieses Projekt steht unter der MIT-Lizenz. Siehe [`LICENSE`](LICENSE).
