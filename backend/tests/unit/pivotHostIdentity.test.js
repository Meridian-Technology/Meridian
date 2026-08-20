const {
  isInvalidHostName,
  normalizeHostIdentity,
  unionHostIdentities,
  identitiesFromPartifulHosts,
  identitiesFromLumaHosts,
  identitiesFromJsonLdOrganizer,
  identityFromDisplayName,
  displayFieldsFromIdentities,
} = require('../../utilities/pivotHostIdentity');

describe('isInvalidHostName', () => {
  it('filters platform names', () => {
    expect(isInvalidHostName('partiful.com')).toBe(true);
    expect(isInvalidHostName('Luma')).toBe(true);
    expect(isInvalidHostName('Roof Records')).toBe(false);
  });
});

describe('identitiesFromPartifulHosts', () => {
  it('emits one identity per host and lists managed first', () => {
    const identities = identitiesFromPartifulHosts([
      { name: 'basem', isManaged: false, id: 'user-basem' },
      {
        name: '(un)PTO',
        isManaged: true,
        id: 'user-unpto',
        photo: 'https://cdn.partiful.com/unpto.jpg',
      },
      { name: 'partiful.com', isManaged: true },
    ]);

    expect(identities).toHaveLength(2);
    expect(identities[0]).toMatchObject({
      provider: 'partiful',
      name: '(un)PTO',
      externalId: 'user-unpto',
      profileUrl: 'https://partiful.com/u/user-unpto',
      imageUrl: 'https://cdn.partiful.com/unpto.jpg',
    });
    expect(identities[1]).toMatchObject({
      provider: 'partiful',
      name: 'basem',
      externalId: 'user-basem',
    });
  });
});

describe('identitiesFromLumaHosts', () => {
  it('emits one identity per host object', () => {
    const identities = identitiesFromLumaHosts([
      {
        first_name: 'Vivian',
        last_name: 'Cai',
        avatar_url: 'https://images.lumacdn.com/avatars/vivian.jpg',
        api_id: 'usr-vivian',
        username: 'viviancai',
      },
      { name: 'Adrian Yumul', avatar_url: 'https://images.lumacdn.com/avatars/adrian.jpg' },
    ]);

    expect(identities).toHaveLength(2);
    expect(identities[0]).toMatchObject({
      provider: 'luma',
      name: 'Vivian Cai',
      externalId: 'usr-vivian',
      profileUrl: 'https://luma.com/user/viviancai',
      imageUrl: 'https://images.lumacdn.com/avatars/vivian.jpg',
    });
    expect(identities[1]).toMatchObject({
      provider: 'luma',
      name: 'Adrian Yumul',
    });
    expect(identities[1].externalId).toBeUndefined();
  });
});

describe('identitiesFromJsonLdOrganizer', () => {
  it('does not join organizer nodes into one identity', () => {
    const identities = identitiesFromJsonLdOrganizer(
      [
        { '@type': 'Person', name: 'Alice', url: 'https://example.com/alice' },
        { '@type': 'Person', name: 'Bob' },
      ],
      'partiful',
    );

    expect(identities).toHaveLength(2);
    expect(identities.map((row) => row.name)).toEqual(['Alice', 'Bob']);
    expect(identities[0].profileUrl).toBe('https://example.com/alice');
  });
});

describe('identityFromDisplayName', () => {
  it('builds a generic-site identity without inventing an externalId', () => {
    const identity = identityFromDisplayName('FilmScene', 'generic-site');
    expect(identity).toEqual({ provider: 'generic-site', name: 'FilmScene' });
  });

  it('drops invalid platform names', () => {
    expect(identityFromDisplayName('partiful.com', 'partiful')).toBeNull();
  });
});

describe('unionHostIdentities', () => {
  it('unions by provider+externalId, then profileUrl, then name', () => {
    const merged = unionHostIdentities(
      [{ provider: 'partiful', name: 'Alice', externalId: 'a1' }],
      [
        { provider: 'partiful', name: 'Alice Chen', externalId: 'a1', imageUrl: 'https://cdn.example/a.jpg' },
        { provider: 'luma', name: 'Bob', profileUrl: 'https://luma.com/user/bob' },
      ],
    );

    expect(merged).toHaveLength(2);
    expect(merged[0].name).toBe('Alice');
    expect(merged[1].provider).toBe('luma');
  });
});

describe('displayFieldsFromIdentities', () => {
  it('fills missing image/profile from the primary identity', () => {
    const fields = displayFieldsFromIdentities([
      {
        provider: 'partiful',
        name: 'Roof Records',
        profileUrl: 'https://partiful.com/u/roof',
        imageUrl: 'https://cdn.partiful.com/roof.jpg',
      },
    ]);

    expect(fields.imageUrl).toBe('https://cdn.partiful.com/roof.jpg');
    expect(fields.profileUrl).toBe('https://partiful.com/u/roof');
  });

  it('does not overwrite an existing image with empty', () => {
    const fields = displayFieldsFromIdentities([], {
      imageUrl: 'https://existing.example/host.jpg',
    });
    expect(fields.imageUrl).toBe('https://existing.example/host.jpg');
  });
});

describe('normalizeHostIdentity', () => {
  it('rejects unknown providers and empty rows', () => {
    expect(normalizeHostIdentity({ provider: 'eventbrite', name: 'X' })).toBeNull();
    expect(normalizeHostIdentity({ provider: 'partiful' })).toBeNull();
  });
});
