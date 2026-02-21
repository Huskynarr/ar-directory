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
  - EOL/Update-Status
  - minimaler horizontaler Winkel (FOV)
  - minimale Refresh-Rate
  - maximaler Preis (USD)
  - nur mit Preis
  - nur mit Shop-Link
- Sortierung:
  - Name, Hersteller, Neueste, Preis, FOV
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

Die Datengrundlage wird aus der VR-Compare API erzeugt und um Legacy-Seeds erweitert:
- API: `https://vr-compare.com/api/headsets?hidden=false&detailLevel=summary`
- Generator: `scripts/generate-ar-csv.mjs`
- Ausgabe:
  - `public/data/ar_glasses.csv`
  - `public/data/ar_glasses.metadata.json`

Hinweis: Die API liefert kein offizielles, separates `XR`-Flag. XR-Brillen werden daher ueber eine nachvollziehbare Namens-/Keyword-Heuristik in den Datensatz aufgenommen.

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

## Projektstruktur

```text
.
├─ public/
│  └─ data/
│     ├─ ar_glasses.csv
│     └─ ar_glasses.metadata.json
├─ scripts/
│  └─ generate-ar-csv.mjs
├─ src/
│  ├─ main.js
│  └─ style.css
├─ docs/
│  └─ screenshots/
│     └─ startseite.png
├─ .gitlab-ci.yml
├─ CONTRIBUTING.md
├─ LICENSE
├─ vite.config.js
└─ README.md
```

## CI / GitLab Pipeline

Die `.gitlab-ci.yml` enthaelt drei Jobs:
- `verify:data`: prueft, ob Daten generiert werden koennen und die Exportdateien existieren
- `build:app`: baut die App mit Vite und speichert `dist/` als Artefakt
- `deploy:plesk`: optionaler manueller Deploy-Job (Default-Branch), der `dist/` via SSH/rsync auf Plesk synchronisiert

Damit sind Datenvalidierung, Build und optionales Deployment ueber CI abgedeckt.

## Deployment (Plesk)

Pragmatischer Ablauf fuer statisches Hosting auf Plesk:
- Build erzeugen:
  - `npm ci`
  - `npm run build`
- Output deployen:
  - Inhalt von `dist/` in den Plesk-Docroot (z. B. `httpdocs/`) hochladen oder synchronisieren
- Optional fuer SPA-Routing (nur falls direkte Unterseiten-URLs 404 liefern):
  - `.htaccess` im Docroot hinterlegen, z. B.:

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

### Optional: CI Deploy-Job `deploy:plesk`

Fuer den manuellen Deploy aus GitLab CI folgende CI/CD-Variablen setzen:
- `PLESK_HOST` (z. B. `example.com`)
- `PLESK_USER` (SSH-User)
- `PLESK_SSH_PRIVATE_KEY` (Private Key fuer den SSH-User, als masked/protected Variable)
- Optional `PLESK_TARGET_DIR` (Default: `httpdocs`)
- Optional `PLESK_PORT` (Default: `22`)
- Optional `PLESK_SSH_KNOWN_HOSTS` (falls gesetzt, wird kein `ssh-keyscan` verwendet)

Ablauf:
- Pipeline auf Default-Branch laufen lassen
- Im Job-Tab den manuellen Job `deploy:plesk` starten
- Job synchronisiert den Inhalt von `dist/` per `rsync --delete` in den Zielordner

## Contributing

Details fuer Contributions stehen in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

Dieses Projekt steht unter der MIT-Lizenz. Siehe [`LICENSE`](LICENSE).
