import { getOrgRoleColor } from '../orgUtils';

describe('getOrgRoleColor', () => {
  test('returns color from role object when provided', () => {
    const color = getOrgRoleColor({ name: 'custom', color: '#123456' }, 0.5);
    expect(color).toBe('rgba(18, 52, 86, 0.5)');
  });

  test('resolves color from roles array for role string', () => {
    const color = getOrgRoleColor('moderator', 1, [
      { name: 'moderator', color: '#00FF00' },
    ]);
    expect(color).toBe('rgba(0, 255, 0, 1)');
  });

  test('falls back to default role palette and unknown fallback', () => {
    expect(getOrgRoleColor('owner', 0.8)).toBe('rgba(220, 38, 38, 0.8)');
    expect(getOrgRoleColor('admin', 0.8)).toBe('rgba(59, 130, 246, 0.8)');
    expect(getOrgRoleColor('member', 0.8)).toBe('rgba(107, 114, 128, 0.8)');
    expect(getOrgRoleColor('unknown', 0.8)).toBe('rgba(107, 114, 128, 0.8)');
  });
});
