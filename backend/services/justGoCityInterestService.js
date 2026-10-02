const getGlobalModels = require('./getGlobalModelService');
const {normalizeWaitlistEmail} = require('../utilities/justGoWaitlistEmail');
const {getCity, citySelection} = require('./justGoCityDirectoryService');
const {listPivotCities} = require('./pivotEntryService');

const indexPromises = new WeakMap();

async function ensureIndexes(model) {
  if (!indexPromises.has(model)) {
    const promise = model.createIndexes().catch(error => {
      indexPromises.delete(model);
      throw error;
    });
    indexPromises.set(model, promise);
  }
  await indexPromises.get(model);
}

async function joinCityInterest(req, body = {}) {
  const city = getCity(body.cityId);
  if (!city) return {error: 'Choose a city from search.', status: 400, code: 'CITY_INVALID'};
  const email = normalizeWaitlistEmail(body.email);
  if (!email) return {error: 'Enter a valid email address.', status: 400, code: 'INVALID_EMAIL'};
  if (body.consent !== true) {
    return {error: 'Consent is required.', status: 400, code: 'CONSENT_REQUIRED'};
  }
  const source = ['ios', 'android', 'web'].includes(body.source) ? body.source : null;
  if (!source) return {error: 'Invalid signup source.', status: 400, code: 'SOURCE_INVALID'};

  const {data} = await listPivotCities(req);
  const selection = citySelection(city, data.cities);
  if (selection.available) {
    return {error: 'This city is live. Open it in JustGo.', status: 409, code: 'CITY_AVAILABLE'};
  }

  const {JustGoCityInterest} = getGlobalModels(req, 'JustGoCityInterest');
  await ensureIndexes(JustGoCityInterest);
  try {
    await JustGoCityInterest.updateOne(
      {cityId: city.id, email},
      {$setOnInsert: {
        cityId: city.id,
        cityLabel: selection.label,
        email,
        source,
        consentAt: new Date(),
      }},
      {upsert: true},
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  return {data: {cityId: city.id, cityLabel: selection.label}};
}

async function cityInterestDemand(req) {
  const {JustGoCityInterest} = getGlobalModels(req, 'JustGoCityInterest');
  return JustGoCityInterest.aggregate([
    {$group: {
      _id: '$cityId',
      cityLabel: {$first: '$cityLabel'},
      signups: {$sum: 1},
      latestSignupAt: {$max: '$createdAt'},
    }},
    {$sort: {signups: -1, latestSignupAt: -1}},
    {$limit: 250},
  ]);
}

module.exports = {joinCityInterest, cityInterestDemand};
