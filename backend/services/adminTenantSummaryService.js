/**
 * Read-only aggregates for community admin dashboard home (institution-scoped).
 * Uses getModels(req, ...) per backend best practices.
 */

const getModels = require('./getModelService');

/**
 * @param {import('express').Request} req
 * @returns {Promise<{
 *   communityGroupCount: number,
 *   upcomingEventsCount: number,
 *   programsCount: number,
 *   userCount: number
 * }>}
 */
async function getAdminTenantSummary(req) {
    const { Org, Event, Domain, User } = getModels(req, 'Org', 'Event', 'Domain', 'User');

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [communityGroupCount, upcomingEventsCount, programsCount, userCount] = await Promise.all([
        Org.countDocuments({}),
        Event.countDocuments({ start_time: { $gte: startOfToday } }),
        Domain.countDocuments({}),
        User.countDocuments({}),
    ]);

    return {
        communityGroupCount,
        upcomingEventsCount,
        programsCount,
        userCount,
    };
}

module.exports = {
    getAdminTenantSummary,
};
