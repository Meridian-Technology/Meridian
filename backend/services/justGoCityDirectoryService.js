const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, '../data');
const SHARD_DIR = path.join(DATA_DIR, 'justGoCityShards');
const COORDINATES_PATH = path.join(DATA_DIR, 'justGoCityCoordinates.bin');
const COORDINATE_BYTES = 13;
const shardCache = new Map();
let coordinates;

// Compact GeoNames row: id, name, ASCII name, country, admin1, lat, lon,
// population, admin1 name, country name.
const ID = 0;
const NAME = 1;
const ASCII_NAME = 2;
const COUNTRY = 3;
const REGION = 4;
const LAT = 5;
const LON = 6;
const POPULATION = 7;
const REGION_NAME = 8;
const COUNTRY_NAME = 9;

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toCity(row) {
  if (!row) return null;
  return {
    id: row[ID],
    name: row[NAME],
    countryCode: row[COUNTRY],
    regionCode: row[REGION],
    regionName: row[REGION_NAME],
    countryName: row[COUNTRY_NAME],
    latitude: row[LAT],
    longitude: row[LON],
    population: row[POPULATION],
  };
}

function shardKey(name) {
  const first = normalize(name).charAt(0);
  return /^[a-z]$/.test(first) ? first : '_';
}

function loadShard(key) {
  if (shardCache.has(key)) {
    const rows = shardCache.get(key);
    shardCache.delete(key);
    shardCache.set(key, rows);
    return rows;
  }
  const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(SHARD_DIR, `${key}.json.gz`))).toString('utf8'));
  shardCache.set(key, rows);
  if (shardCache.size > 2) shardCache.delete(shardCache.keys().next().value);
  return rows;
}

function coordinateIndex() {
  if (!coordinates) coordinates = fs.readFileSync(COORDINATES_PATH);
  return coordinates;
}

function coordinateRecordForId(cityId) {
  const data = coordinateIndex();
  let low = 0;
  let high = data.length / COORDINATE_BYTES - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const offset = middle * COORDINATE_BYTES;
    const id = data.readUInt32LE(offset);
    if (id === cityId) return offset;
    if (id < cityId) low = middle + 1;
    else high = middle - 1;
  }
  return -1;
}

function publicCity(city) {
  if (!city) return null;
  const region = city.countryCode === 'US' ? city.regionCode : city.regionName;
  const label = city.countryCode === 'US'
    ? `${city.name}${region ? `, ${region}` : ''}`
    : `${city.name}${region ? `, ${region}` : ''}, ${city.countryName}`;
  return {
    cityId: city.id,
    name: city.name,
    label,
    countryCode: city.countryCode,
    regionCode: city.regionCode,
    latitude: city.latitude,
    longitude: city.longitude,
  };
}

function matchScore(row, query) {
  const name = normalize(row[NAME]);
  const asciiName = normalize(row[ASCII_NAME]);
  if (name === query || asciiName === query) return 0;
  const suffix = `${row[REGION]} ${row[REGION_NAME]} ${row[COUNTRY]} ${row[COUNTRY_NAME]}`;
  const searchName = normalize(`${row[NAME]} ${suffix}`);
  const searchAscii = normalize(`${row[ASCII_NAME]} ${suffix}`);
  if (searchName.startsWith(query) || searchAscii.startsWith(query)) return 1;
  if (searchName.includes(` ${query}`) || searchAscii.includes(` ${query}`)) return 2;
  if (searchName.includes(query) || searchAscii.includes(query)) return 3;
  const terms = query.split(' ');
  const nameTerms = new Set(searchName.split(' '));
  const asciiTerms = new Set(searchAscii.split(' '));
  if (terms.every(term => nameTerms.has(term) || asciiTerms.has(term))) return 4;
  return null;
}

function searchCities(query, limit = 12, activeTenants = []) {
  const needle = normalize(query);
  if (needle.length < 2 || needle.length > 80) return [];
  const liveNames = new Set(activeTenants.map(tenant =>
    normalize(String(tenant.cityDisplayName || '').split(',')[0])));
  const matches = [];
  for (const row of loadShard(shardKey(needle))) {
    const score = matchScore(row, needle);
    if (score === null) continue;
    const rank = score * 0.5 - Math.log10(row[POPULATION] + 10) - (row[COUNTRY] === 'US' ? 1 : 0);
    const available = liveNames.has(normalize(row[NAME])) &&
      Boolean(activeTenantForCity(toCity(row), activeTenants));
    matches.push({row, rank, available});
  }
  matches.sort((a, b) => Number(b.available) - Number(a.available) ||
    a.rank - b.rank || b.row[POPULATION] - a.row[POPULATION]);
  return matches.slice(0, limit).map(({row}) => toCity(row));
}

function getCity(cityId) {
  const id = Number(cityId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const offset = coordinateRecordForId(id);
  if (offset < 0) return null;
  const key = String.fromCharCode(coordinateIndex().readUInt8(offset + 12));
  return toCity(loadShard(key).find(row => row[ID] === id));
}

function nearestCity(latitude, longitude, maxKm = 50) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  let bestId = null;
  let bestKm = maxKm;
  const latitudeRadians = latitude * Math.PI / 180;
  const latitudeRange = maxKm / 110;
  const longitudeRange = Math.min(180, maxKm / (110 * Math.max(0.01, Math.cos(latitudeRadians))));
  const data = coordinateIndex();
  for (let offset = 0; offset < data.length; offset += COORDINATE_BYTES) {
    const cityLatitude = data.readFloatLE(offset + 4);
    const cityLongitude = data.readFloatLE(offset + 8);
    const longitudeDifference = Math.abs(cityLongitude - longitude);
    if (Math.abs(cityLatitude - latitude) > latitudeRange ||
        Math.min(longitudeDifference, 360 - longitudeDifference) > longitudeRange) continue;
    const dLat = (cityLatitude - latitude) * Math.PI / 180;
    const dLon = (cityLongitude - longitude) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(latitudeRadians) *
      Math.cos(cityLatitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    const km = 12742 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (km < bestKm) {
      bestId = data.readUInt32LE(offset);
      bestKm = km;
    }
  }
  return bestId ? getCity(bestId) : null;
}

function activeTenantForCity(city, activeTenants = []) {
  if (!city) return null;
  for (const tenant of activeTenants) {
    const [name, region] = String(tenant.cityDisplayName || '').split(',').map(part => part.trim());
    if (normalize(name) !== normalize(city.name)) continue;
    // Existing tenant labels omit country; those legacy labels refer to US cities.
    if (city.countryCode !== 'US') continue;
    if (region && ![city.regionCode, city.regionName].some(value => normalize(region) === normalize(value))) continue;
    if (!region) {
      let largest = null;
      for (const row of loadShard(shardKey(city.name))) {
        if (row[COUNTRY] === 'US' && normalize(row[NAME]) === normalize(city.name) &&
            (!largest || row[POPULATION] > largest[POPULATION])) largest = row;
      }
      if (largest?.[ID] !== city.id) continue;
    }
    return tenant;
  }
  return null;
}

function citySelection(city, activeTenants) {
  const tenant = activeTenantForCity(city, activeTenants);
  return {
    ...publicCity(city),
    available: Boolean(tenant),
    tenantKey: tenant?.tenantKey || null,
  };
}

module.exports = {normalize, searchCities, getCity, nearestCity, publicCity, citySelection};
