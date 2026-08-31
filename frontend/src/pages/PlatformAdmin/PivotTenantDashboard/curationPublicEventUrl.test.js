import { curationPublicEventUrl } from './curationPublicEventUrl';

describe('curationPublicEventUrl', () => {
  it('builds the canonical production event page URL', () => {
    expect(curationPublicEventUrl(
      { _id: '64f1234567890abcdef12345' },
      { nodeEnv: 'production' },
    )).toBe('https://justgo.lol/events/64f1234567890abcdef12345');
  });

  it('supports id and safely rejects events without an identifier', () => {
    expect(curationPublicEventUrl(
      { id: 'event/id' },
      { origin: 'https://preview.example.test' },
    )).toBe('https://preview.example.test/events/event%2Fid');
    expect(curationPublicEventUrl({ name: 'No id' })).toBeNull();
  });
});
