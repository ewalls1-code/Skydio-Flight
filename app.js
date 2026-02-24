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
const statusPill = document.getElementById('overall-status');
const conditionsList = document.getElementById('conditions-list');
const locationLabel = document.getElementById('location-label');
const updatedLabel = document.getElementById('updated-label');
const errorLabel = document.getElementById('error');

const WEATHER_FIELDS = [
  'wind_speed_10m',
  'wind_gusts_10m',
  'precipitation',
  'snowfall',
  'visibility',
  'cloud_base',
  'temperature_2m',
  'weather_code',
];

searchBtn.addEventListener('click', () => checkWeather(locationInput.value.trim()));
locationInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    checkWeather(locationInput.value.trim());
  }
});

async function checkWeather(query) {
  hideError();
  if (!query) {
    showError('Please enter a location.');
    return;
  }

  setLoadingState();

  try {
    const place = await geocode(query);
    if (!place) {
      showError('Location not found. Try a city + state/country.');
      return;
    }

    const weather = await fetchCurrentWeather(place.latitude, place.longitude);
    const recommendation = evaluateConditions(weather.current);

    renderResult(place, weather.current, recommendation);
  } catch (error) {
    console.error(error);
    showError('Unable to fetch weather right now. Please try again.');
  }
}

async function geocode(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Geocoding request failed.');
  }
  const data = await res.json();
  return data.results?.[0] ?? null;
}

async function fetchCurrentWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: WEATHER_FIELDS.join(','),
    wind_speed_unit: 'ms',
    timezone: 'auto',
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!res.ok) {
    throw new Error('Weather request failed.');
  }
  return res.json();
}

function evaluateConditions(current) {
  const checks = [];

  checks.push(condition('Wind speed', `${current.wind_speed_10m} m/s`, current.wind_speed_10m <= RULES.windNoGo ? (current.wind_speed_10m > RULES.windCaution ? 'caution' : 'go') : 'no-go'));
  checks.push(condition('Wind gusts', `${current.wind_gusts_10m} m/s`, current.wind_gusts_10m > RULES.gustNoGo ? 'no-go' : 'go'));
  checks.push(condition('Precipitation', `${current.precipitation} mm/h`, current.precipitation > RULES.rainNoGo ? 'no-go' : (current.precipitation > RULES.rainCaution ? 'caution' : 'go')));
  checks.push(condition('Snowfall', `${current.snowfall} mm/h`, current.snowfall > RULES.snowNoGo ? 'no-go' : 'go'));
  checks.push(condition('Visibility', `${Math.round(current.visibility)} m`, current.visibility < RULES.minVisibility ? 'no-go' : 'go'));
  checks.push(condition('Cloud base', `${Math.round(current.cloud_base)} m`, current.cloud_base < RULES.minCloudBase ? 'no-go' : 'go'));

  const hasNoGo = checks.some((c) => c.level === 'no-go');
  const hasCaution = checks.some((c) => c.level === 'caution');
  const overall = hasNoGo ? 'no-go' : (hasCaution ? 'caution' : 'go');

  return { overall, checks };
}

function condition(label, value, level) {
  return { label, value, level };
}

function renderResult(place, current, recommendation) {
  statusCard.hidden = false;
  conditionsCard.hidden = false;

  statusPill.className = `status-pill status-${recommendation.overall}`;
  statusPill.textContent = recommendationLabel(recommendation.overall);

  const placeParts = [place.name, place.admin1, place.country].filter(Boolean);
  locationLabel.textContent = `Location: ${placeParts.join(', ')}`;
  updatedLabel.textContent = `Observed at: ${current.time}`;

  conditionsList.innerHTML = '';
  recommendation.checks.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${item.label}:</strong> ${item.value} — <em>${recommendationLabel(item.level)}</em>`;
    conditionsList.appendChild(li);
  });
}

function recommendationLabel(level) {
  if (level === 'go') return 'GO';
  if (level === 'caution') return 'CAUTION';
  return 'NO-GO';
}

function setLoadingState() {
  statusCard.hidden = false;
  conditionsCard.hidden = true;
  statusPill.className = 'status-pill';
  statusPill.textContent = 'Loading...';
  locationLabel.textContent = '';
  updatedLabel.textContent = '';
}

function showError(message) {
  errorLabel.hidden = false;
  errorLabel.textContent = message;
}

function hideError() {
  errorLabel.hidden = true;
  errorLabel.textContent = '';
}
