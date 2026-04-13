class ExternalRoomSyncService {
    constructor(req) {
        this.req = req;
    }

    async dryRunSyncReservation(event, options = {}) {
        const provider = options.provider || process.env.RESERVATION_SYNC_PROVIDER || 'none';
        const enabled = process.env.RESERVATION_SYNC_DRY_RUN === 'true';
        if (!enabled) {
            return { enabled: false, status: 'skipped', provider, reason: 'Dry-run sync disabled' };
        }

        const hasConflict = Boolean(event?.reservation?.conflictSummary?.hasConflict);
        return {
            enabled: true,
            status: hasConflict ? 'conflict' : 'ok',
            provider,
            externalResourceId: String(event?.reservation?.resourceId || event?.classroom_id || ''),
            checkedAt: new Date(),
            recommendation: hasConflict ? 'manual_review' : 'safe_to_sync'
        };
    }
}

module.exports = ExternalRoomSyncService;
