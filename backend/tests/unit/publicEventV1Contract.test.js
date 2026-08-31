const schema = require('../../events/contracts/public-event.v1.schema.json');

function resolveRef(root, ref) {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported ref: ${ref}`);
  return ref
    .slice(2)
    .split('/')
    .reduce((value, segment) => value[segment], root);
}

function matchesSchema(value, node, root = schema) {
  if (node.$ref) return matchesSchema(value, resolveRef(root, node.$ref), root);
  if (node.oneOf) {
    return node.oneOf.filter((candidate) => matchesSchema(value, candidate, root)).length === 1;
  }
  if (Object.prototype.hasOwnProperty.call(node, 'const') && value !== node.const) return false;
  if (node.enum && !node.enum.includes(value)) return false;

  if (node.type === 'null') return value === null;
  if (node.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const keys = Object.keys(value);
    if ((node.required || []).some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
      return false;
    }
    if (node.additionalProperties === false && keys.some((key) => !node.properties?.[key])) {
      return false;
    }
    return keys.every((key) => !node.properties?.[key] || matchesSchema(value[key], node.properties[key], root));
  }
  if (node.type === 'string') {
    if (typeof value !== 'string') return false;
    if (node.minLength != null && value.length < node.minLength) return false;
    if (node.maxLength != null && value.length > node.maxLength) return false;
    if (node.pattern && !new RegExp(node.pattern).test(value)) return false;
    if (node.format === 'date-time' && Number.isNaN(Date.parse(value))) return false;
    if (node.format === 'uri') {
      try {
        new URL(value);
      } catch {
        return false;
      }
    }
  }
  return true;
}

function publicEvent(overrides = {}) {
  const id = '64f1234567890abcdef12345';
  return {
    contractVersion: '1',
    data: {
      id,
      title: 'Movie night under the stars',
      description: 'Bring a blanket and meet us on the lawn.',
      image: { url: 'https://images.example.test/event.jpg' },
      startsAt: '2026-09-05T02:00:00.000Z',
      endsAt: '2026-09-05T04:30:00.000Z',
      timezone: 'America/Los_Angeles',
      venue: { text: 'Civic Center Lawn' },
      organizer: {
        name: 'Night Owl Cinema',
        imageUrl: 'https://images.example.test/organizer.jpg',
        profileUrl: 'https://nightowl.example.test',
      },
      lifecycleStatus: 'upcoming',
      registrationCapability: 'external',
      cityId: 'oakland',
      canonicalUrl: `https://justgo.lol/events/${id}`,
      socialPreview: {
        title: 'Movie night under the stars',
        description: 'Bring a blanket and meet us on the lawn.',
        imageUrl: 'https://images.example.test/event.jpg',
      },
      ...overrides,
    },
  };
}

describe('Just Go public event v1 contract (Phase 1, Step 1.4)', () => {
  it.each([
    ['future external/ticketed', { lifecycleStatus: 'upcoming', registrationCapability: 'external' }],
    ['ongoing in-app', { lifecycleStatus: 'ongoing', registrationCapability: 'in_app' }],
    ['ended', { lifecycleStatus: 'ended', registrationCapability: 'none' }],
    ['future non-registerable', { lifecycleStatus: 'upcoming', registrationCapability: 'none' }],
    ['missing image', { image: null, socialPreview: { title: 'Movie night', description: '', imageUrl: null } }],
  ])('accepts the exact safe shape for %s events', (_label, overrides) => {
    expect(matchesSchema(publicEvent(overrides), schema)).toBe(true);
  });

  it('requires every approved display and routing field', () => {
    const required = schema.$defs.event.required;
    expect(required).toEqual([
      'id',
      'title',
      'description',
      'image',
      'startsAt',
      'endsAt',
      'timezone',
      'venue',
      'organizer',
      'lifecycleStatus',
      'registrationCapability',
      'cityId',
      'canonicalUrl',
      'socialPreview',
    ]);

    for (const field of required) {
      const response = publicEvent();
      delete response.data[field];
      expect(matchesSchema(response, schema)).toBe(false);
    }
  });

  it.each([
    ['attendees', [{ userId: 'private-user' }]],
    ['registrationCount', 12],
    ['registrationFormId', '64f1234567890abcdef99999'],
    ['externalLink', 'https://tickets.example.test/private-destination'],
    ['contact', { email: 'private@example.test' }],
    ['approvalReference', 'internal-workflow-id'],
    ['hostingId', { _id: 'technical-org-id' }],
    ['customFields', { pivot: { parsed: { source: 'internal' } } }],
    ['isDeleted', false],
    ['status', 'approved'],
  ])('rejects sensitive or predicate-only field %s', (field, value) => {
    expect(matchesSchema(publicEvent({ [field]: value }), schema)).toBe(false);
  });

  it('rejects extra fields at every nested boundary', () => {
    const nestedCases = [
      publicEvent({ image: { url: 'https://images.example.test/event.jpg', storageKey: 'secret' } }),
      publicEvent({ venue: { text: 'Civic Center Lawn', classroomId: 'internal' } }),
      publicEvent({ organizer: { name: 'Host', imageUrl: null, profileUrl: null, userId: 'private' } }),
      publicEvent({ socialPreview: { title: 'Title', description: '', imageUrl: null, rawHtml: '<b>x</b>' } }),
      { ...publicEvent(), debug: { tenant: 'oakland' } },
    ];
    nestedCases.forEach((response) => expect(matchesSchema(response, schema)).toBe(false));
  });

  it('locks semantic state and canonical HTTPS routing', () => {
    expect(matchesSchema(publicEvent({ lifecycleStatus: 'cancelled' }), schema)).toBe(false);
    expect(matchesSchema(publicEvent({ registrationCapability: 'tickets' }), schema)).toBe(false);
    expect(matchesSchema(publicEvent({ canonicalUrl: 'https://other.example.test/event/1' }), schema)).toBe(false);
    expect(matchesSchema(publicEvent({ image: { url: 'http://images.example.test/event.jpg' } }), schema)).toBe(false);
  });

  it('uses one generic unavailable response with no disclosure fields', () => {
    const unavailable = {
      contractVersion: '1',
      error: { code: 'EVENT_UNAVAILABLE' },
    };
    expect(matchesSchema(unavailable, schema)).toBe(true);

    for (const disclosure of [
      { reason: 'PRIVATE' },
      { eventId: '64f1234567890abcdef12345' },
      { cityId: 'oakland' },
      { exists: true },
    ]) {
      expect(matchesSchema({ ...unavailable, error: { ...unavailable.error, ...disclosure } }, schema)).toBe(false);
    }
  });
});
