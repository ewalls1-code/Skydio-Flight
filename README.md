# Skydio X10 Flight Weather Check

A lightweight single-page app that checks current weather and gives a **GO / CAUTION / NO-GO** recommendation for flying a Skydio X10.

## Features

- Search any location by name.
- Pulls live weather from Open-Meteo APIs.
- Evaluates wind, gusts, precipitation, snowfall, visibility, and cloud base.
- Shows a clear recommendation based on configurable risk thresholds.

## Run locally

Because this app is static HTML/CSS/JS, you can run it with any static file server:

```bash
python3 -m http.server 4173
```

Then open: <http://localhost:4173>

## Tuning thresholds

Edit the `RULES` object in `app.js`.
