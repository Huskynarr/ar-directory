# Enrichment payload schema (for apply-enrichment.mjs)

Output is a JSON file with this shape:

```json
{
  "enriched": [
    {
      "id": "<existing CSV id>",
      "name": "<device name, for readability>",
      "changes": { "<field>": "<new value>", ... },
      "confidence": "high|medium",
      "sources": ["<url>", "..."]
    }
  ],
  "newDevices": [
    {
      "name": "...", "manufacturer": "...",
      "official_url": "...", "announced_date": "YYYY-MM-DD", "release_date": "YYYY-MM-DD",
      "price_usd": "499", "xr_category": "AR",
      "active_distribution": "Ja", "eol_status": "Aktiv oder ohne EOL-Angabe",
      "eol_date": "", "lifecycle_notes": "<kurzer deutscher Satz>",
      "lifecycle_source": "<url>",
      "software": "...", "compute_unit": "Standalone|Tethered|Smartphone|PC",
      "display_type": "Micro-OLED|Micro LED|LCD|OLED|...", "optics": "Waveguide|Birdbath|Pancake|Fresnel|...",
      "fov_horizontal_deg": "46", "fov_vertical_deg": "", "fov_diagonal_deg": "52",
      "resolution_per_eye": "1920x1080", "refresh_hz": "120", "weight_g": "75",
      "tracking": "3DoF|6DoF|Inside-out|None", "eye_tracking": "Ja|Nein|Unklar",
      "hand_tracking": "Ja|Nein|Unklar", "passthrough": "<kurz beschreiben oder Nein>",
      "chipset": "Snapdragon XR2 Gen 2", "brightness_nits": "1000",
      "connectivity": "Wi-Fi 6, Bluetooth 5.3, USB-C", "audio": "Open-ear Stereo",
      "battery": "z.B. 'Integriert, 4h' oder 'Via Host-Geraet'", "ipd_mm": "57-72",
      "prescription_support": "Ja (Einsaetze)|Nein|Unklar",
      "camera": "12 MP RGB", 
      "sources": ["<url>", "..."],
      "confidence": "high|medium"
    }
  ]
}
```

Rules:
- Mutable fields for `changes` (everything else is ignored): official_url, announced_date, release_date, price_usd, xr_category, active_distribution, eol_status, eol_date, lifecycle_notes, lifecycle_source, software, compute_unit, display_type, optics, fov_horizontal_deg, fov_vertical_deg, fov_diagonal_deg, resolution_per_eye, refresh_hz, weight_g, tracking, eye_tracking, hand_tracking, passthrough, chipset, brightness_nits, connectivity, audio, battery, ipd_mm, prescription_support, camera.
- xr_category: "AR" (see-through/AR/AI/display glasses) or "XR" (VR/MR headsets with passthrough/opaque displays).
- Dates ISO YYYY-MM-DD (year-only OK as YYYY). price_usd: plain number string (launch price USD; for CNY-only launches convert and note in lifecycle_notes).
- Numeric fields: plain numbers, no units. Resolution: "WIDTHxHEIGHT" per eye.
- Unknown values: use "Unklar" or omit the field. NEVER guess — every non-trivial value needs a source you actually checked.
- lifecycle_notes in German, one short sentence.
- Discontinued devices: eol_status "EOL / Discontinued", active_distribution "Nein".
