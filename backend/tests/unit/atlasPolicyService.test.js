const {
    assertLifecycleTransition,
    governanceRequirementsForOrg,
    assertOrgAllowsEventCreation,
    assertEventReservationReady,
    getReservationEscalation,
    getEffectivePolicyFromConfig,
    DEFAULT_ATLAS_POLICY
} = require('../../services/atlasPolicyService');

describe('atlasPolicyService', () => {
    const org = (overrides = {}) => ({
        lifecycleStatus: 'active',
        orgTypeKey: 'club',
        ...overrides
    });

    test('getEffectivePolicyFromConfig merges defaults when atlasPolicy missing', () => {
        const policy = getEffectivePolicyFromConfig({});
        expect(policy.lifecycle.defaultStatus).toBe(DEFAULT_ATLAS_POLICY.lifecycle.defaultStatus);
        expect(policy.orgTypes.length).toBeGreaterThan(0);
    });

    test('assertLifecycleTransition allows valid transition for officer', () => {
        const policy = getEffectivePolicyFromConfig({});
        expect(() =>
            assertLifecycleTransition(policy, org({ lifecycleStatus: 'active' }), 'sunset', {
                isPlatformAdmin: false,
                isOfficer: true
            })
        ).not.toThrow();
    });

    test('assertLifecycleTransition rejects invalid transition', () => {
        const policy = getEffectivePolicyFromConfig({});
        expect(() =>
            assertLifecycleTransition(policy, org({ lifecycleStatus: 'active' }), 'inactive', {
                isPlatformAdmin: false,
                isOfficer: true
            })
        ).toThrow();
    });

    test('governanceRequirementsForOrg resolves org type', () => {
        const policy = getEffectivePolicyFromConfig({
            atlasPolicy: {
                orgTypes: [
                    { key: 'club', requiredGovernanceKeys: ['constitution', 'member_list'] },
                    { key: 'default', requiredGovernanceKeys: ['constitution'] }
                ],
                defaultOrgTypeKey: 'default'
            }
        });
        const keys = governanceRequirementsForOrg(policy, org({ orgTypeKey: 'club' }));
        expect(keys).toContain('constitution');
        expect(keys).toContain('member_list');
    });

    test('assertOrgAllowsEventCreation blocks sunset when configured', () => {
        const policy = getEffectivePolicyFromConfig({});
        const r = assertOrgAllowsEventCreation(policy, org({ lifecycleStatus: 'sunset' }));
        expect(r.ok).toBe(false);
    });

    test('assertOrgAllowsEventCreation allows active', () => {
        const policy = getEffectivePolicyFromConfig({});
        const r = assertOrgAllowsEventCreation(policy, org({ lifecycleStatus: 'active' }));
        expect(r.ok).toBe(true);
    });

    test('assertEventReservationReady blocks unresolved reservation conflicts', () => {
        const r = assertEventReservationReady({
            classroom_id: '507f1f77bcf86cd799439011',
            reservation: {
                state: 'requested',
                conflictSummary: { hasConflict: true, reason: 'Overlapping booking' }
            }
        });
        expect(r.ok).toBe(false);
        expect(r.code).toBe('EVENT_RESERVATION_CONFLICT');
    });

    test('getReservationEscalation flags old conflicts as high severity', () => {
        const old = new Date(Date.now() - 30 * 60 * 60 * 1000);
        const out = getReservationEscalation({
            reservation: {
                conflictSummary: { hasConflict: true, reason: 'Overlapping booking' },
                detectedAt: old
            }
        }, { escalationThresholdHours: 24 });
        expect(out.escalated).toBe(true);
        expect(out.severity).toBe('high');
    });

    test('assertEventReservationReady allows approved reservation state', () => {
        const r = assertEventReservationReady({
            classroom_id: '507f1f77bcf86cd799439011',
            reservation: {
                state: 'approved',
                conflictSummary: { hasConflict: false, reason: '' }
            }
        });
        expect(r.ok).toBe(true);
    });
});
