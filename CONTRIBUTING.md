# Contributing

Danke fuer deinen Beitrag.

## Workflow

1. Fork/Branch anlegen (`feature/...` oder `fix/...`).
2. Abhaengigkeiten installieren:
   ```bash
   npm ci
   ```
3. Aenderungen umsetzen.
4. Falls Datenlogik betroffen ist, Datensatz neu erzeugen:
   ```bash
   node scripts/generate-ar-csv.mjs
   ```
5. Build pruefen:
   ```bash
   npm run build
   ```
6. Merge Request erstellen.

## Richtlinien

- Kleine, klar abgegrenzte Commits
- Aussagekraeftige Commit-Messages
- Keine Secrets im Repository
- Stil und Struktur der bestehenden Oberflaeche beibehalten

## Merge Request Checklist

- [ ] Build laeuft lokal
- [ ] CSV/Metadata aktualisiert (falls relevant)
- [ ] README/Docs aktualisiert (falls relevant)
- [ ] Aenderungen sind im MR kurz erklaert
