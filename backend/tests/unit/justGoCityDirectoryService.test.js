const {
  searchCities,
  getCity,
  nearestCity,
  citySelection,
} = require('../../services/justGoCityDirectoryService');

describe('JustGo city directory', () => {
  it('searches cities outside the active tenant list', () => {
    const results = searchCities('des moines');
    expect(results[0]).toMatchObject({name: 'Des Moines', countryCode: 'US', regionCode: 'IA'});
  });

  it('keeps identically named cities distinct', () => {
    const paris = searchCities('paris');
    expect(paris[0].countryCode).toBe('FR');
    expect(paris.some(city => city.countryCode === 'US')).toBe(true);
  });

  it('ranks matching live cities before the result limit', () => {
    const tenants = [{tenantKey: 'sf', cityDisplayName: 'San Francisco'}];
    expect(searchCities('sa', 1, tenants)[0].id).toBe(5391959);
  });

  it('finds a nearby city for a map tap and rejects distant coordinates', () => {
    expect(nearestCity(37.7749, -122.4194)?.name).toBe('San Francisco');
    expect(nearestCity(0, 0)).toBeNull();
  });

  it('only marks the matching US city as live for legacy tenant labels', () => {
    const tenants = [{tenantKey: 'sf', cityDisplayName: 'San Francisco'}];
    expect(citySelection(getCity(5391959), tenants)).toMatchObject({available: true, tenantKey: 'sf'});
    expect(citySelection(getCity(1690019), tenants)).toMatchObject({available: false, tenantKey: null});
  });
});
