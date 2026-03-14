/**
 * Auto-claim anonymous event registrations when a user signs up with matching email.
 * Runs as fire-and-forget so sign-up response is not delayed.
 */

const getModels = require('./getModelService');
const { resolveAnonymousEmail } = require('./eventAnnouncementService');

/**
 * Find and claim anonymous FormResponses for events with autoClaimMatchingEmail enabled
 * where the resolved email matches the new user's email.
 * @param {Object} req - Express request (for getModels multi-tenant)
 * @param {string} userId - New user's _id
 * @param {string} email - New user's email (trimmed, lowercase)
 */
async function autoClaimEventRegistrationsByEmail(req, userId, email) {
    if (!req || !userId || !email || typeof email !== 'string') return;
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail) return;

    try {
        const { Event, FormResponse, OrgManagementConfig } = getModels(req, 'Event', 'FormResponse', 'OrgManagementConfig');
        const config = await OrgManagementConfig.findOne().select('autoClaimEnabled').lean();
        if (!config?.autoClaimEnabled) return;

        const events = await Event.find({
            registrationFormId: { $exists: true, $ne: null }
        })
            .select('_id attendees registrationFormId autoClaimEmailQuestionId notificationEmailQuestionId')
            .lean();

        for (const event of events) {
            try {
                const anonymousResponses = await FormResponse.find({
                    event: event._id,
                    submittedBy: null
                })
                    .select('_id guestEmail guestName formSnapshot answers')
                    .lean();

                for (const fr of anonymousResponses) {
                    const resolvedEmail = resolveAnonymousEmail(fr, event);
                    if (!resolvedEmail || resolvedEmail !== normalizedEmail) continue;

                    const existingUserResponse = await FormResponse.findOne({
                        event: event._id,
                        submittedBy: userId
                    });
                    if (existingUserResponse) continue;

                    await FormResponse.updateOne(
                        { _id: fr._id },
                        { $set: { submittedBy: userId } }
                    );

                    const eventDoc = await Event.findById(event._id);
                    if (eventDoc && eventDoc.attendees) {
                        const alreadyInAttendees = eventDoc.attendees.some(
                            (a) => (a.userId && a.userId.toString()) === userId.toString()
                        );
                        if (!alreadyInAttendees) {
                            eventDoc.attendees.push({
                                userId,
                                registeredAt: new Date(),
                                guestCount: 1
                            });
                            await eventDoc.save();
                        }
                    }

                    console.log(`[auto-claim] Claimed event ${event._id} for user ${userId}`);
                }
            } catch (eventErr) {
                console.error(`[auto-claim] Error processing event ${event._id}:`, eventErr);
            }
        }
    } catch (err) {
        console.error('[auto-claim] autoClaimEventRegistrationsByEmail failed:', err);
    }
}

/**
 * Fire-and-forget: run auto-claim without blocking. Call after user creation.
 * @param {Object} req - Express request
 * @param {string} userId - New user _id
 * @param {string} email - New user email
 */
function runAutoClaimAsync(req, userId, email) {
    if (!req || !userId || !email) return;
    setImmediate(() => {
        autoClaimEventRegistrationsByEmail(req, userId, email).catch((err) => {
            console.error('[auto-claim] runAutoClaimAsync error:', err);
        });
    });
}

module.exports = {
    autoClaimEventRegistrationsByEmail,
    runAutoClaimAsync
};
