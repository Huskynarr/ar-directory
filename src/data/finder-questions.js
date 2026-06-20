// Single source of truth for the guided finder's questions. Dependency-free
// (plain bilingual objects, no DOM/i18n imports) so it can be consumed by both
// the browser SPA (src/render/finder.js) and the static page generator
// (vite.config.js) without drift between the interactive quiz and the crawlable
// /finder/ landing page.
export const FINDER_QUESTIONS = [
  {
    id: 'usecase',
    header: { de: 'Einsatz', en: 'Use case' },
    question: { de: 'Wofür willst du die Brille hauptsächlich nutzen?', en: 'What will you mainly use the glasses for?' },
    options: [
      { value: 'media', icon: '🎬', label: { de: 'Filme & Medien unterwegs', en: 'Movies & media on the go' }, desc: { de: 'Großes Bild im Zug, Flugzeug oder auf dem Sofa.', en: 'A big screen on the train, plane or couch.' } },
      { value: 'gaming', icon: '🎮', label: { de: 'Gaming & Immersion', en: 'Gaming & immersion' }, desc: { de: 'Immersive Spiele, hohe Bildrate, 6DoF.', en: 'Immersive games, high refresh, 6DoF.' } },
      { value: 'work', icon: '🖥️', label: { de: 'Arbeit & virtuelle Monitore', en: 'Work & virtual monitors' }, desc: { de: 'Mehrere scharfe Displays ersetzen den Schreibtisch.', en: 'Several sharp screens replacing your desk.' } },
      { value: 'everyday', icon: '🕶️', label: { de: 'Alltag & AI-Assistent', en: 'Everyday & AI assistant' }, desc: { de: 'Leichte Smart-/AI-Brille mit Kamera & Audio.', en: 'Lightweight smart/AI glasses with camera & audio.' } },
      { value: 'enterprise', icon: '🏭', label: { de: 'Enterprise & Industrie', en: 'Enterprise & industry' }, desc: { de: 'Training, Wartung, Field Service, robust.', en: 'Training, maintenance, field service, rugged.' } },
      { value: 'dev', icon: '🧪', label: { de: 'Entwicklung & Experimente', en: 'Development & tinkering' }, desc: { de: 'Viele Sensoren, offene Plattform, SDKs.', en: 'Lots of sensors, open platform, SDKs.' } },
    ],
  },
  {
    id: 'category',
    header: { de: 'Bauart', en: 'Form' },
    question: { de: 'Welche Bauart schwebt dir vor?', en: 'Which kind of device do you have in mind?' },
    options: [
      { value: 'ar', icon: '👓', label: { de: 'Leichte AR-/Display-Brille', en: 'Lightweight AR/display glasses' }, desc: { de: 'Sieht aus wie eine Brille, durchsichtig.', en: 'Looks like glasses, see-through.' } },
      { value: 'xr', icon: '🥽', label: { de: 'Immersives XR-Headset', en: 'Immersive XR headset' }, desc: { de: 'Volle Immersion, Passthrough, VR/MR.', en: 'Full immersion, passthrough, VR/MR.' } },
      { value: 'any', icon: '🤷', label: { de: 'Egal / unsicher', en: 'No preference / unsure' }, desc: { de: 'Zeig mir einfach die besten Treffer.', en: 'Just show me the best matches.' } },
    ],
  },
  {
    id: 'budget',
    header: { de: 'Budget', en: 'Budget' },
    question: { de: 'Wie viel möchtest du ungefähr ausgeben?', en: 'Roughly how much do you want to spend?' },
    options: [
      { value: 'low', icon: '💶', label: { de: 'Bis ca. 300 €', en: 'Up to ~€300' }, desc: { de: 'Einsteiger & Schnäppchen.', en: 'Entry level & bargains.' } },
      { value: 'mid', icon: '💶', label: { de: '300 – 600 €', en: '€300 – 600' }, desc: { de: 'Solide Mittelklasse.', en: 'Solid mid-range.' } },
      { value: 'high', icon: '💶', label: { de: '600 – 1500 €', en: '€600 – 1500' }, desc: { de: 'Gehobene Modelle.', en: 'Premium models.' } },
      { value: 'premium', icon: '💎', label: { de: 'Über 1500 €', en: 'Over €1500' }, desc: { de: 'High-End, Preis egal.', en: 'High-end, price no object.' } },
      { value: 'any', icon: '🤷', label: { de: 'Budget egal', en: "Budget doesn't matter" }, desc: { de: 'Preis nicht entscheidend.', en: 'Price is not decisive.' } },
    ],
  },
  {
    id: 'formfactor',
    header: { de: 'Gewicht', en: 'Weight' },
    question: { de: 'Wie wichtig ist dir geringes Gewicht?', en: 'How important is low weight to you?' },
    options: [
      { value: 'light', icon: '🪶', label: { de: 'So leicht wie möglich', en: 'As light as possible' }, desc: { de: 'Brillen-Formfaktor, lange tragbar.', en: 'Glasses form factor, wear for hours.' } },
      { value: 'balanced', icon: '⚖️', label: { de: 'Ausgewogen', en: 'Balanced' }, desc: { de: 'Etwas mehr Gewicht für mehr Leistung okay.', en: 'A bit more weight for more power is fine.' } },
      { value: 'any', icon: '💪', label: { de: 'Egal, Hauptsache Leistung', en: "Don't care, performance first" }, desc: { de: 'Auch ein Headset ist in Ordnung.', en: 'A full headset is fine too.' } },
    ],
  },
  {
    id: 'connection',
    header: { de: 'Anschluss', en: 'Connection' },
    question: { de: 'Standalone oder angeschlossen?', en: 'Standalone or tethered?' },
    options: [
      { value: 'standalone', icon: '🔋', label: { de: 'Standalone', en: 'Standalone' }, desc: { de: 'Eigener Akku & Chip, kein Kabel nötig.', en: 'Own battery & chip, no cable needed.' } },
      { value: 'tethered', icon: '🔌', label: { de: 'An Handy/PC angeschlossen', en: 'Tethered to phone/PC' }, desc: { de: 'Leichter, braucht aber eine Quelle.', en: 'Lighter, but needs a host device.' } },
      { value: 'any', icon: '🤷', label: { de: 'Egal', en: 'No preference' }, desc: { de: 'Beides ist in Ordnung.', en: 'Either is fine.' } },
    ],
  },
  {
    id: 'availability',
    header: { de: 'Verfügbarkeit', en: 'Availability' },
    question: { de: 'Sollen nur aktuell erhältliche Geräte erscheinen?', en: 'Should only currently available devices appear?' },
    options: [
      { value: 'current', icon: '🛒', label: { de: 'Nur aktuell kaufbar', en: 'Currently buyable only' }, desc: { de: 'Keine eingestellten/EOL-Modelle.', en: 'No discontinued/EOL models.' } },
      { value: 'any', icon: '🗄️', label: { de: 'Auch Legacy & Sammler', en: 'Include legacy & collectibles' }, desc: { de: 'Ältere Modelle dürfen dabei sein.', en: 'Older models are welcome too.' } },
    ],
  },
];
