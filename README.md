# Skydio X10 Flight Weather + Aviation Context Check

Single-page app that returns a **GO / CAUTION / NO-GO** recommendation for a Skydio X10 mission.

## What it now supports

- Input by **ZIP code, street address, city, or place**.
- Current weather conditions (Open-Meteo).
- Aviation context from nearest weather.gov station:
  - Latest **METAR raw message**
  - Latest **TAF raw text** (if available)
- On-screen display of the exact METAR/TAF text used by the app.

## Run locally

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>

## Notes

- `RULES` in `app.js` controls weather thresholds.
- `evaluateTafRisk` in `app.js` controls TAF token interpretation.
- Some locations may not return TAF/METAR depending on station coverage/API availability.
