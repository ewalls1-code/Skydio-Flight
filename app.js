const RULES = {
  windCaution: 10,
  windNoGo: 14,
  gustNoGo: 18,
  rainCaution: 0.5,
  rainNoGo: 2,
  snowNoGo: 0.5,
  minVisibility: 3000,
  minCloudBase: 120,
};

const locationInput = document.getElementById('location-input');
const searchBtn = document.getElementById('search-btn');
const statusCard = document.getElementById('status-card');
const conditionsCard = document.getElementById('conditions-card');
const aviationCard = document.getElementById('aviation-card');
const statusPill = document.getElementById('overall-status');
const conditionsList = document.getElementById('conditions-list');
const locationLabel = document.getElementById('location-label');
const updatedLabel = document.getElementById('updated-label');
const stationLabel = document.getElementById('station-label');
const aviationSummary = document.getElementById('aviation-summary');
const metarRaw = document.getElementById('metar-raw');
const tafRaw = document.getElementById('taf-raw');
const errorLabel = document.getElementById('error');

const WEATHER_FIELDS = [
  'wind_speed_10m',
  'wind_gusts_10m',
  'precipitation',
  'snowfall',
  'visibility',
  'cloud_base',
].join(',');

searchBtn.addEventListener('click', () => checkWeather(locationInput.value.trim()));
locationInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') checkWeather(locationInput.value.trim());
});

async function checkWeather(query) {
  hideError();
  if (!query) {
    showError('Please enter an address, ZIP, city, or place.');
    return;
  }

  setLoadingState();

  try {
    const place = await geocode(query);
    if (!place) {
      showError('No matching location found.');
      return;
    }

    const weather = await fetchOpenMeteo(place.lat, place.lon);
    const aviation = await fetchAviationData(place.lat, place.lon);
    const recommendation = evaluateConditions(weather.current, aviation);

    renderResult(place, weather.current, aviation, recommendation);
  } catch (error) {
    console.error(error);
    showError('Unable to fetch data right now. Please try again.');
  }
}

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) throw new Error('Geocode request failed.');
  const data = await res.json();
  return data[0] ?? null;
}

async function fetchOpenMeteo(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: WEATHER_FIELDS,
    wind_speed_unit: 'ms',
    timezone: 'auto',
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!res.ok) throw new Error('Open-Meteo request failed.');
  return res.json();
}

async function fetchAviationData(lat, lon) {
  let stationId = null;
  let metar = null;
  let taf = null;

  try {
    const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
    if (!pointRes.ok) throw new Error('Point lookup failed');
    const pointData = await pointRes.json();

    const stationsRes = await fetch(pointData.properties.observationStations);
    if (!stationsRes.ok) throw new Error('Station lookup failed');
    const stationsData = await stationsRes.json();
    const stationUrl = stationsData.observationStations?.[0];
    if (!stationUrl) return { stationId, metar, taf };

    stationId = stationUrl.split('/').pop();

    const metarRes = await fetch(`https://api.weather.gov/stations/${stationId}/observations/latest`);
    if (metarRes.ok) {
      const metarData = await metarRes.json();
      metar = metarData.properties?.rawMessage || null;
    }

    const tafListRes = await fetch(`https://api.weather.gov/products/types/TAF/locations/${stationId}`);
    if (tafListRes.ok) {
      const tafListData = await tafListRes.json();
      const firstTafId = tafListData['@graph']?.[0]?.id;
      if (firstTafId) {
        const tafRes = await fetch(firstTafId);
        if (tafRes.ok) {
          const tafData = await tafRes.json();
          taf = tafData.productText || null;
        }
      }
    }
  } catch (error) {
    console.warn('Aviation data unavailable:', error);
  }

  return { stationId, metar, taf };
}

function evaluateConditions(current, aviation) {
  const checks = [];

  checks.push(condition('Wind speed', `${current.wind_speed_10m} m/s`, current.wind_speed_10m > RULES.windNoGo ? 'no-go' : (current.wind_speed_10m > RULES.windCaution ? 'caution' : 'go')));
  checks.push(condition('Wind gusts', `${current.wind_gusts_10m} m/s`, current.wind_gusts_10m > RULES.gustNoGo ? 'no-go' : 'go'));
  checks.push(condition('Precipitation', `${current.precipitation} mm/h`, current.precipitation > RULES.rainNoGo ? 'no-go' : (current.precipitation > RULES.rainCaution ? 'caution' : 'go')));
  checks.push(condition('Snowfall', `${current.snowfall} mm/h`, current.snowfall > RULES.snowNoGo ? 'no-go' : 'go'));
  checks.push(condition('Visibility', `${Math.round(current.visibility)} m`, current.visibility < RULES.minVisibility ? 'no-go' : 'go'));
  checks.push(condition('Cloud base', `${Math.round(current.cloud_base)} m`, current.cloud_base < RULES.minCloudBase ? 'no-go' : 'go'));

  const tafRisk = evaluateTafRisk(aviation.taf);
  if (tafRisk) {
    checks.push(condition('TAF hazards', tafRisk.reason, tafRisk.level));
  }

  const hasNoGo = checks.some((entry) => entry.level === 'no-go');
  const hasCaution = checks.some((entry) => entry.level === 'caution');
  const overall = hasNoGo ? 'no-go' : (hasCaution ? 'caution' : 'go');

  return { overall, checks };
}

function evaluateTafRisk(tafText) {
  if (!tafText) return null;

  const upper = tafText.toUpperCase();
  const severe = [' TS', ' +TS', ' FZRA', ' +RA', ' SN', ' FG', ' SQ'];
  if (severe.some((token) => upper.includes(token))) {
    return { level: 'no-go', reason: 'TAF includes significant hazard tokens (e.g. TS/SN/FG/FZRA).' };
  }

  const caution = [' RA', ' BR', ' HZ', 'G', ' BKN', ' OVC'];
  if (caution.some((token) => upper.includes(token))) {
    return { level: 'caution', reason: 'TAF includes potential reduced-operations indicators.' };
  }

  return { level: 'go', reason: 'TAF does not include configured hazard tokens.' };
}

function condition(label, value, level) {
  return { label, value, level };
}

function renderResult(place, current, aviation, recommendation) {
  statusCard.hidden = false;
  conditionsCard.hidden = false;
  aviationCard.hidden = false;

  statusPill.className = `status-pill status-${recommendation.overall}`;
  statusPill.textContent = recommendationLabel(recommendation.overall);

  locationLabel.textContent = `Location: ${place.display_name}`;
  updatedLabel.textContent = `Observed at: ${current.time}`;
  stationLabel.textContent = `Nearest weather.gov station: ${aviation.stationId || 'Unavailable'}`;

  conditionsList.innerHTML = '';
  recommendation.checks.forEach((entry) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${entry.label}:</strong> ${entry.value} — <em>${recommendationLabel(entry.level)}</em>`;
    conditionsList.appendChild(li);
  });

  metarRaw.textContent = aviation.metar || 'METAR unavailable from selected station.';
  tafRaw.textContent = aviation.taf || 'TAF unavailable for selected station.';
  aviationSummary.textContent = 'Raw METAR/TAF shown below are the exact source texts used for aviation-context scoring.';
}

function recommendationLabel(level) {
  if (level === 'go') return 'GO';
  if (level === 'caution') return 'CAUTION';
  return 'NO-GO';
}

function setLoadingState() {
  statusCard.hidden = false;
  conditionsCard.hidden = true;
  aviationCard.hidden = true;
  statusPill.className = 'status-pill';
  statusPill.textContent = 'Loading...';
  locationLabel.textContent = '';
  updatedLabel.textContent = '';
  stationLabel.textContent = '';
}

function showError(message) {
  errorLabel.hidden = false;
  errorLabel.textContent = message;
}

function hideError() {
  errorLabel.hidden = true;
  errorLabel.textContent = '';
}
