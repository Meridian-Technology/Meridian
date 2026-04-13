const getModels = require('./getModelService');

class ReservationMetricsService {
    constructor(req) {
        this.req = req;
        this.models = getModels(req, 'Event');
    }

    static toDateSafe(value, fallback) {
        const d = value ? new Date(value) : null;
        if (!d || Number.isNaN(d.getTime())) return fallback;
        return d;
    }

    async getMetrics({ orgId = null, startDate, endDate } = {}) {
        const { Event } = this.models;
        const now = new Date();
        const start = ReservationMetricsService.toDateSafe(startDate, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
        const end = ReservationMetricsService.toDateSafe(endDate, now);

        const match = {
            isDeleted: false,
            start_time: { $gte: start, $lte: end },
            'reservation.resourceId': { $ne: null }
        };
        if (orgId) {
            match.$or = [{ hostingId: orgId }, { 'collaboratorOrgs.orgId': orgId }];
        }

        const [summary] = await Event.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    totalReservations: { $sum: 1 },
                    conflicts: { $sum: { $cond: ['$reservation.conflictSummary.hasConflict', 1, 0] } },
                    unresolved: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        '$reservation.conflictSummary.hasConflict',
                                        { $ne: ['$reservation.resolutionStatus', 'resolved'] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    approvedReservations: { $sum: { $cond: [{ $eq: ['$reservation.state', 'approved'] }, 1, 0] } }
                }
            }
        ]);

        const byResource = await Event.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$reservation.resourceId',
                    reservations: { $sum: 1 },
                    conflicts: { $sum: { $cond: ['$reservation.conflictSummary.hasConflict', 1, 0] } }
                }
            },
            { $sort: { reservations: -1 } },
            { $limit: 100 }
        ]);

        return {
            window: { start, end },
            totalReservations: summary?.totalReservations || 0,
            conflicts: summary?.conflicts || 0,
            unresolved: summary?.unresolved || 0,
            approvedReservations: summary?.approvedReservations || 0,
            conflictRate: summary?.totalReservations ? (summary.conflicts / summary.totalReservations) : 0,
            byResource
        };
    }

    static toCsv(metrics = {}) {
        const rows = [
            ['metric', 'value'],
            ['totalReservations', metrics.totalReservations || 0],
            ['conflicts', metrics.conflicts || 0],
            ['unresolved', metrics.unresolved || 0],
            ['approvedReservations', metrics.approvedReservations || 0],
            ['conflictRate', metrics.conflictRate || 0]
        ];
        return rows.map((row) => row.join(',')).join('\n');
    }
}

module.exports = ReservationMetricsService;
