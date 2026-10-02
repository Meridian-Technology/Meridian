jest.mock('../../services/getGlobalModelService', () => jest.fn());
jest.mock('../../services/pivotEntryService', () => ({listPivotCities: jest.fn()}));

const getGlobalModels = require('../../services/getGlobalModelService');
const {listPivotCities} = require('../../services/pivotEntryService');
const {joinCityInterest} = require('../../services/justGoCityInterestService');

const model = {
  createIndexes: jest.fn(async () => {}),
  updateOne: jest.fn(async () => ({})),
};

describe('JustGo city interest', () => {
  beforeEach(() => {
    getGlobalModels.mockReturnValue({JustGoCityInterest: model});
    listPivotCities.mockResolvedValue({data: {cities: [
      {tenantKey: 'sf', cityDisplayName: 'San Francisco'},
    ]}});
    model.updateOne.mockClear();
  });

  it('records demand for a city without a tenant', async () => {
    const result = await joinCityInterest({}, {
      cityId: 4853828,
      email: ' PERSON@example.com ',
      source: 'ios',
      consent: true,
    });
    expect(result.data).toMatchObject({cityId: 4853828, cityLabel: 'Des Moines, IA'});
    expect(model.updateOne).toHaveBeenCalledWith(
      {cityId: 4853828, email: 'person@example.com'},
      {$setOnInsert: expect.objectContaining({source: 'ios', consentAt: expect.any(Date)})},
      {upsert: true},
    );
  });

  it('routes live cities into the app instead of the demand bucket', async () => {
    const result = await joinCityInterest({}, {
      cityId: 5391959,
      email: 'person@example.com',
      source: 'ios',
      consent: true,
    });
    expect(result).toMatchObject({status: 409, code: 'CITY_AVAILABLE'});
    expect(model.updateOne).not.toHaveBeenCalled();
  });

  it('requires explicit consent', async () => {
    const result = await joinCityInterest({}, {
      cityId: 4853828,
      email: 'person@example.com',
      source: 'android',
    });
    expect(result).toMatchObject({status: 400, code: 'CONSENT_REQUIRED'});
    expect(model.updateOne).not.toHaveBeenCalled();
  });
});
