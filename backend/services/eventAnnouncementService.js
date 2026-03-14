/**
 * Service for event-specific org announcements.
 * Uses getModels(req, ...) for multi-tenant DB access.
 */

const getModels = require('./getModelService');
const mongoose = require('mongoose');
const NotificationService = require('./notificationService');
const { getResend } = require('./resendClient');
const { clean, isProfane } = require('./profanityFilterService');
const { getBaseUrl, buildEventAnnouncementEmail } = require('./orgInviteService');

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const PDF_MIME = 'application/pdf';

/** Sanitize attachment filename: strip path, limit length, ensure .pdf extension for display */
function sanitizeAttachmentFilename(name) {
    if (!name || typeof name !== 'string') return 'attachment.pdf';
    const base = name.replace(/^.*[/\\]/, '').trim().substring(0, 200);
    return base.toLowerCase().endsWith('.pdf') ? base : (base || 'attachment') + '.pdf';
}

function stripHtml(html) {
    if (!html || typeof html !== 'string') return '';
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/** Simple email validation for resolved guest/custom field values */
function isValidEmail(str) {
    if (!str || typeof str !== 'string') return false;
    const trimmed = str.trim().toLowerCase();
    if (!trimmed) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Resolve email for an anonymous FormResponse (submittedBy null).
 * 1. Use guestEmail if present and valid.
 * 2. Else if event.autoClaimEmailQuestionId or event.notificationEmailQuestionId is set, find that question in formSnapshot.questions, get the corresponding answer, validate as email.
 * 3. Else return null.
 * @param {Object} formResponse - FormResponse doc (or lean) with guestEmail, formSnapshot, answers
 * @param {Object} event - Event doc with optional autoClaimEmailQuestionId, notificationEmailQuestionId
 * @returns {string | null} Normalized email or null
 */
function resolveAnonymousEmail(formResponse, event) {
    const guestEmail = formResponse.guestEmail;
    if (guestEmail && isValidEmail(guestEmail)) {
        return String(guestEmail).trim().toLowerCase();
    }
    const questionId = event?.autoClaimEmailQuestionId || event?.notificationEmailQuestionId;
    if (!questionId) return null;
    const snapshot = formResponse.formSnapshot;
    const answers = formResponse.answers;
    if (!snapshot?.questions || !Array.isArray(answers)) return null;
    const idStr = questionId.toString();
    const idx = snapshot.questions.findIndex((q) => (q._id && q._id.toString()) === idStr);
    if (idx < 0 || idx >= answers.length) return null;
    const value = answers[idx];
    const str = value != null ? String(value).trim() : '';
    if (!str || !isValidEmail(str)) return null;
    return str.toLowerCase();
}

/**
 * Resolve display value for an anonymous FormResponse (used in lists).
 * 1. Use guestName if present and non-empty.
 * 2. Else if event.notificationEmailQuestionId is set, get answer from that question (any value - name, email, phone, etc.).
 * 3. Else return null (caller may use 'Guest').
 * @param {Object} formResponse - FormResponse with guestName, formSnapshot, answers
 * @param {Object} event - Event with optional notificationEmailQuestionId
 * @returns {string | null}
 */
function resolveAnonymousName(formResponse, event) {
    const guestName = formResponse.guestName;
    if (guestName && String(guestName).trim()) {
        return String(guestName).trim();
    }
    const questionId = event?.notificationEmailQuestionId;
    if (!questionId) return null;
    const snapshot = formResponse.formSnapshot;
    const answers = formResponse.answers;
    if (!snapshot?.questions || !Array.isArray(answers)) return null;
    const idStr = questionId.toString();
    const idx = snapshot.questions.findIndex((q) => (q._id && q._id.toString()) === idStr);
    if (idx < 0 || idx >= answers.length) return null;
    const value = answers[idx];
    const str = value != null ? String(value).trim() : '';
    return str || null;
}

/**
 * Returns attendee entries eligible to receive an event announcement per config:
 * - All registrants (attendees) are included.
 * - If includeCheckedIn is false, only currently checked-in attendees are included.
 * @param {Object} event - Event doc with attendees (with userId, checkedIn)
 * @param {Object} config - messaging.eventAnnouncements config (includeCheckedIn)
 * @param {*} excludeUserId - User ID to exclude (e.g. author)
 * @returns {Array} Eligible attendee subdocs (with populated userId when present)
 */
function getEligibleAttendees(event, config, excludeUserId) {
    const includeCheckedIn = config?.includeCheckedIn !== false;
    const seen = new Set();
    const eligible = [];
    (event.attendees || []).forEach((a) => {
        const uid = a.userId?._id || a.userId;
        const formResponseIdVal = a.formResponseId?._id || a.formResponseId;
        if (uid) {
            const idStr = uid.toString();
            if (idStr === (excludeUserId && excludeUserId.toString())) return;
            if (seen.has(idStr)) return;
            const isCheckedIn = a.checkedIn === true;
            if (includeCheckedIn || isCheckedIn) {
                seen.add(idStr);
                eligible.push(a);
            }
        } else if (formResponseIdVal) {
            const idStr = `anon-${formResponseIdVal.toString()}`;
            if (seen.has(idStr)) return;
            const isCheckedIn = a.checkedIn === true;
            if (includeCheckedIn || isCheckedIn) {
                seen.add(idStr);
                eligible.push(a);
            }
        }
    });
    return eligible;
}

/**
 * Returns true if the organizer is allowed to send an announcement for this event (based on allowAnnouncementsDaysBeforeEvent).
 * @param {Object} event - Event doc with start_time
 * @param {Object} config - messaging.eventAnnouncements config (allowAnnouncementsDaysBeforeEvent)
 * @returns {{ allowed: boolean, message?: string }}
 */
function canSendAnnouncementForEvent(event, config) {
    const daysBefore = config?.allowAnnouncementsDaysBeforeEvent;
    if (daysBefore == null || daysBefore <= 0) return { allowed: true };
    const eventStart = event.start_time ? new Date(event.start_time) : null;
    if (!eventStart) return { allowed: true };
    const cutoff = new Date(eventStart.getTime() - daysBefore * 24 * 60 * 60 * 1000);
    const now = new Date();
    if (now >= cutoff) return { allowed: true };
    return {
        allowed: false,
        message: `Announcements are allowed starting ${daysBefore} day${daysBefore !== 1 ? 's' : ''} before the event (${eventStart.toLocaleDateString()}).`
    };
}

/**
 * Send an event-specific announcement. Creates OrgMessage with eventId, notifies attendees (in-app/push), and sends email.
 * @param {Object} req - Express request (must have req.user.userId, req.db)
 * @param {string} orgId - Organization ID
 * @param {string} eventId - Event ID (must be org-hosted by this org)
 * @param {string} content - Message content (HTML or plain text)
 * @param {Object} [options] - Optional: { subject?: string, excludeUserIds: string[], excludeEmails?: string[], channels: { inApp?: boolean, email?: boolean } }
 * @returns {Promise<{ message: Object }>} Created OrgMessage (with authorId populated)
 */
async function sendEventAnnouncement(req, orgId, eventId, content, options = {}) {
    const { OrgMessage, Org, Event, OrgMember, OrgManagementConfig, User, Notification, FormResponse } = getModels(
        req, 'OrgMessage', 'Org', 'Event', 'OrgMember', 'OrgManagementConfig', 'User', 'Notification', 'FormResponse'
    );
    const userId = req.user.userId;

    const org = await Org.findById(orgId);
    if (!org) {
        const err = new Error('Organization not found');
        err.statusCode = 404;
        throw err;
    }

    if (!org.messageSettings || !org.messageSettings.enabled) {
        const err = new Error('Messaging is not enabled for this organization');
        err.statusCode = 403;
        throw err;
    }

    const systemConfig = await OrgManagementConfig.findOne();
    const eventAnnouncementsEnabled = systemConfig?.messaging?.eventAnnouncements?.enabled !== false;
    if (!eventAnnouncementsEnabled) {
        const err = new Error('Event-specific announcements are not enabled');
        err.statusCode = 403;
        err.code = 'EVENT_ANNOUNCEMENTS_DISABLED';
        throw err;
    }

    if (org.approvalStatus === 'pending') {
        const allowedActions = systemConfig?.orgApproval?.pendingOrgLimits?.allowedActions || [];
        if (!allowedActions.includes('post_messages')) {
            const err = new Error('Your organization is pending approval and cannot post messages yet.');
            err.statusCode = 403;
            err.code = 'ORG_PENDING_APPROVAL';
            throw err;
        }
    }

    const member = await OrgMember.findOne({ org_id: orgId, user_id: userId, status: 'active' });
    if (!member) {
        const err = new Error('You must be a member of this organization to post messages');
        err.statusCode = 403;
        throw err;
    }

    const postingPermissions = org.messageSettings.postingPermissions || ['owner', 'admin', 'officer'];
    const canPost = !postingPermissions.length || postingPermissions.includes(member.role);
    if (!canPost) {
        const err = new Error('You do not have permission to post messages');
        err.statusCode = 403;
        throw err;
    }

    const event = await Event.findOne({
        _id: eventId,
        hostingId: orgId,
        hostingType: 'Org',
        isDeleted: false
    }).populate('attendees.userId', 'name email');

    if (!event) {
        const err = new Error('Event not found');
        err.statusCode = 404;
        throw err;
    }

    const eventAnnouncementConfig = systemConfig?.messaging?.eventAnnouncements;
    const sendCheck = canSendAnnouncementForEvent(event, eventAnnouncementConfig);
    if (!sendCheck.allowed) {
        const err = new Error(sendCheck.message || 'Announcements are not yet allowed for this event');
        err.statusCode = 403;
        err.code = 'ANNOUNCEMENTS_NOT_YET_ALLOWED';
        throw err;
    }

    if (!content || !String(content).trim()) {
        const err = new Error('Message content is required');
        err.statusCode = 400;
        throw err;
    }

    const maxLimit = systemConfig?.messaging?.maxCharacterLimit || 2000;
    const minLimit = systemConfig?.messaging?.minCharacterLimit || 100;
    const orgLimit = org.messageSettings.characterLimit || 500;
    const characterLimit = Math.min(orgLimit, maxLimit);

    if (content.length > characterLimit) {
        const err = new Error(`Message exceeds character limit of ${characterLimit}`);
        err.statusCode = 400;
        throw err;
    }

    if (content.length < minLimit) {
        const err = new Error(`Message must be at least ${minLimit} characters`);
        err.statusCode = 400;
        throw err;
    }

    const requireProfanityFilter = systemConfig?.messaging?.requireProfanityFilter !== false;
    if (requireProfanityFilter && isProfane(content)) {
        const err = new Error('Message contains inappropriate language');
        err.statusCode = 400;
        throw err;
    }

    const cleanContent = requireProfanityFilter ? clean(content) : content;
    const messageVisibility = org.messageSettings.visibility || 'members_and_followers';

    const subjectTrimmed = options.subject != null ? String(options.subject).trim() : '';
    const subjectToStore = subjectTrimmed.length > 0 ? subjectTrimmed.substring(0, 200) : null;

    const sendAsOrg = options.sendAsOrg === true;
    const message = new OrgMessage({
        orgId,
        authorId: userId,
        content: cleanContent,
        visibility: messageVisibility,
        mentionedEvents: [],
        links: [],
        parentMessageId: null,
        eventId,
        subject: subjectToStore,
        sendAsOrg,
        likes: [],
        likeCount: 0,
        replyCount: 0
    });

    await message.save();
    await message.populate('authorId', 'name username picture');

    const authorName = sendAsOrg ? (org.org_name || 'Organization') : (message.authorId?.name || message.authorId?.username || 'Someone');
    const messagePreview = stripHtml(cleanContent).substring(0, 100);
    const notificationSettings = systemConfig?.messaging?.notificationSettings;
    const defaultInApp = notificationSettings?.notifyOnEventAnnouncement !== false;
    const defaultEmail = notificationSettings?.eventAnnouncementEmail !== false;
    const channels = options.channels || {};
    const sendInApp = channels.inApp !== undefined ? channels.inApp : defaultInApp;
    const sendEmail = channels.email !== undefined ? channels.email : defaultEmail;
    const excludeUserIds = new Set((options.excludeUserIds || []).map(id => String(id)));

    const eligibleAttendees = getEligibleAttendees(event, eventAnnouncementConfig, userId);

    const recipients = [];
    const attendeesWithEmail = [];
    const recipientIds = new Set();

    const formResponseIdsInAttendees = new Set(
        (event.attendees || []).filter(a => a.formResponseId).map(a => (a.formResponseId?._id || a.formResponseId).toString())
    );

    eligibleAttendees.forEach((a) => {
        const uid = a.userId?._id || a.userId;
        const formResponseIdVal = a.formResponseId?._id || a.formResponseId;
        if (uid) {
            const idStr = uid.toString();
            if (excludeUserIds.has(idStr)) return;
            if (recipientIds.has(idStr)) return;
            recipientIds.add(idStr);
            recipients.push({ id: uid, model: 'User' });
            const email = a.userId?.email || (a.userId && a.userId.email);
            if (email) {
                attendeesWithEmail.push({ userId: uid, email: String(email).trim().toLowerCase() });
            }
        } else if (formResponseIdVal) {
            const idStr = `anon-${formResponseIdVal.toString()}`;
            if (recipientIds.has(idStr)) return;
            recipientIds.add(idStr);
            const email = (a.guestEmail && isValidEmail(a.guestEmail)) ? String(a.guestEmail).trim().toLowerCase() : null;
            if (email) {
                attendeesWithEmail.push({ userId: null, email });
            }
        }
    });

    // Include form-based registrants so announcements reach everyone who registered via the form
    if (event.registrationFormId) {
        const eventObjectId = mongoose.Types.ObjectId.isValid(eventId) ? new mongoose.Types.ObjectId(eventId) : eventId;
        const formResponses = await FormResponse.find({ event: eventObjectId })
            .populate('submittedBy', 'name email')
            .select('submittedBy')
            .lean();
        (formResponses || []).forEach((fr) => {
            const uid = fr.submittedBy?._id || fr.submittedBy;
            if (!uid) return;
            const idStr = uid.toString();
            if (idStr === userId.toString()) return;
            if (excludeUserIds.has(idStr)) return;
            if (recipientIds.has(idStr)) return;
            recipientIds.add(idStr);
            recipients.push({ id: uid, model: 'User' });
            const email = fr.submittedBy?.email;
            if (email) {
                attendeesWithEmail.push({ userId: uid, email: String(email).trim().toLowerCase() });
            }
        });
    }

    // Include anonymous form respondents in email only (when config allows and email can be resolved)
    const includeAnonymousInEmail = eventAnnouncementConfig?.includeAnonymousInEmail !== false;
    const includeCheckedIn = eventAnnouncementConfig?.includeCheckedIn !== false;
    if (event.registrationFormId && includeAnonymousInEmail) {
        if (includeCheckedIn) {
            const eventObjectId = mongoose.Types.ObjectId.isValid(eventId) ? new mongoose.Types.ObjectId(eventId) : eventId;
            const excludeIds = Array.from(formResponseIdsInAttendees).map(id => new mongoose.Types.ObjectId(id));
            const anonymousQuery = { event: eventObjectId, submittedBy: null };
            if (excludeIds.length > 0) {
                anonymousQuery._id = { $nin: excludeIds };
            }
            const anonymousResponses = await FormResponse.find(anonymousQuery)
                .select('guestEmail guestName formSnapshot answers')
                .lean();
            const emailSet = new Set(attendeesWithEmail.map(({ email }) => email));
            (anonymousResponses || []).forEach((fr) => {
                const email = resolveAnonymousEmail(fr, event);
                if (!email || emailSet.has(email)) return;
                emailSet.add(email);
                attendeesWithEmail.push({ userId: null, email });
            });
        }
    }

    // Exclude anonymous by email when organizer unchecked them in the recipient list
    const excludeEmails = new Set((options.excludeEmails || []).map(e => String(e).trim().toLowerCase()));
    if (excludeEmails.size > 0) {
        for (let i = attendeesWithEmail.length - 1; i >= 0; i--) {
            if (attendeesWithEmail[i].userId === null && excludeEmails.has(attendeesWithEmail[i].email)) {
                attendeesWithEmail.splice(i, 1);
            }
        }
    }

    // Include organizer-supplied additional emails (e.g. manually added, max 20). Email-only; dedupe with existing.
    const additionalEmails = (options.additionalEmails || []).slice(0, 20).map(e => String(e).trim().toLowerCase()).filter(isValidEmail);
    const existingEmailSet = new Set(attendeesWithEmail.map(({ email }) => email));
    additionalEmails.forEach((email) => {
        if (!existingEmailSet.has(email)) {
            existingEmailSet.add(email);
            attendeesWithEmail.push({ userId: null, email });
        }
    });

    // In development, send all announcement emails and in-app notifications only to james@meridian.study
    const isDev = process.env.NODE_ENV === 'development';
    const DEV_ANNOUNCEMENT_EMAIL = 'james@activeherb.com';
    if (isDev && (recipients.length > 0 || attendeesWithEmail.length > 0)) {
        const devUser = await User.findOne({ email: new RegExp(`^${DEV_ANNOUNCEMENT_EMAIL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).select('_id').lean();
        if (devUser) {
            recipients.length = 0;
            recipients.push({ id: devUser._id, model: 'User' });
            attendeesWithEmail.length = 0;
            attendeesWithEmail.push({ userId: devUser._id, email: DEV_ANNOUNCEMENT_EMAIL.toLowerCase() });
            console.log('[eventAnnouncement] Development: redirecting all announcement delivery to', DEV_ANNOUNCEMENT_EMAIL);
        } else {
            console.warn('[eventAnnouncement] Development: dev user not found for', DEV_ANNOUNCEMENT_EMAIL, '- skipping delivery');
            recipients.length = 0;
            attendeesWithEmail.length = 0;
        }
    }

    const eventAnnouncementEmail = notificationSettings?.eventAnnouncementEmail !== false;

    if (sendInApp && recipients.length > 0) {
        try {
            const notificationService = NotificationService.withModels({ Notification, User });
            await notificationService.createBatchTemplateNotification(recipients, 'org_event_announcement', {
                orgName: org.org_name,
                eventName: event.name,
                messagePreview,
                orgId,
                eventId,
                messageId: message._id
            });
        } catch (notifError) {
            console.error('Error sending event announcement notifications:', notifError);
        }
    }

    if (sendEmail && eventAnnouncementEmail && attendeesWithEmail.length > 0) {
        let resendAttachments = [];
        const rawAttachments = options.attachments;
        if (rawAttachments && Array.isArray(rawAttachments) && rawAttachments.length > 0) {
            if (rawAttachments.length > MAX_ATTACHMENTS) {
                const err = new Error(`Maximum ${MAX_ATTACHMENTS} attachments allowed`);
                err.statusCode = 400;
                throw err;
            }
            for (let i = 0; i < rawAttachments.length; i++) {
                const a = rawAttachments[i];
                if (!a || !Buffer.isBuffer(a.content) || typeof a.filename !== 'string') {
                    const err = new Error('Each attachment must have filename and content (Buffer)');
                    err.statusCode = 400;
                    throw err;
                }
                if (a.content.length > MAX_ATTACHMENT_SIZE_BYTES) {
                    const err = new Error(`Attachment "${a.filename}" exceeds ${MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)}MB limit`);
                    err.statusCode = 400;
                    throw err;
                }
                resendAttachments.push({
                    filename: sanitizeAttachmentFilename(a.filename),
                    content: a.content,
                    content_type: PDF_MIME
                });
            }
        }

        const baseUrl = getBaseUrl(req);
        const announcementParam = message._id ? `&announcement=${encodeURIComponent(message._id.toString())}` : '';
        const eventUrl = `${baseUrl}/event/${encodeURIComponent(eventId)}?source=email${announcementParam}`;
        const rawAuthorPicture = sendAsOrg ? org.org_profile_image : message.authorId?.picture;
        const authorPicture = rawAuthorPicture && String(rawAuthorPicture).trim()
            ? (rawAuthorPicture.startsWith('http') ? rawAuthorPicture : `${baseUrl}${rawAuthorPicture.startsWith('/') ? '' : '/'}${rawAuthorPicture}`)
            : null;
        const emailHTML = buildEventAnnouncementEmail({
            orgName: org.org_name,
            eventName: event.name,
            eventStartTime: event.start_time,
            authorName,
            authorPicture,
            messageHtml: cleanContent,
            eventUrl,
            platformName: 'Meridian',
            subject: subjectToStore,
            sendAsOrg
        });
        const resendClient = getResend();
        if (resendClient) {
            const emailSubject = subjectToStore || `Announcement for ${event.name} – ${org.org_name}`;
            const fromDisplay = String(org.org_name || 'Meridian').replace(/[<>"\\]/g, '').trim() || 'Meridian';
            const from = `${fromDisplay} <support@meridian.study>`;
            const uniqueEmails = [...new Set(attendeesWithEmail.map(({ email }) => email).filter(Boolean))];
            const sendPayload = {
                from,
                to: [],
                subject: emailSubject,
                html: emailHTML
            };
            if (resendAttachments.length > 0) {
                sendPayload.attachments = resendAttachments;
            }
            await Promise.allSettled(
                uniqueEmails.map((email) =>
                    resendClient.emails.send({
                        ...sendPayload,
                        to: [email]
                    })
                )
            );
        }
    }

    return { message };
}

/**
 * Get the list of attendees who would receive an event announcement (for UI recipient picker).
 * Excludes the current user (author). Returns unique recipients with name and email.
 * @param {Object} req - Express request
 * @param {string} orgId - Organization ID
 * @param {string} eventId - Event ID (org-hosted)
 * @returns {Promise<Array<{ userId: string, name: string, email: string | null }>>}
 */
async function getAnnouncementRecipients(req, orgId, eventId) {
    const { Org, Event, OrgMember, OrgManagementConfig, FormResponse } = getModels(req, 'Org', 'Event', 'OrgMember', 'OrgManagementConfig', 'FormResponse');
    const userId = req.user.userId;

    const org = await Org.findById(orgId);
    if (!org) {
        const err = new Error('Organization not found');
        err.statusCode = 404;
        throw err;
    }

    const systemConfig = await OrgManagementConfig.findOne();
    if (systemConfig?.messaging?.eventAnnouncements?.enabled === false) {
        const err = new Error('Event-specific announcements are not enabled');
        err.statusCode = 403;
        err.code = 'EVENT_ANNOUNCEMENTS_DISABLED';
        throw err;
    }

    const member = await OrgMember.findOne({ org_id: orgId, user_id: userId, status: 'active' });
    if (!member) {
        const err = new Error('You must be a member of this organization to send announcements');
        err.statusCode = 403;
        throw err;
    }

    const event = await Event.findOne({
        _id: eventId,
        hostingId: orgId,
        hostingType: 'Org',
        isDeleted: false
    }).populate('attendees.userId', 'name username email');

    if (!event) {
        const err = new Error('Event not found');
        err.statusCode = 404;
        throw err;
    }

    const eventAnnouncementConfig = systemConfig?.messaging?.eventAnnouncements;
    const sendCheck = canSendAnnouncementForEvent(event, eventAnnouncementConfig);
    if (!sendCheck.allowed) {
        const err = new Error(sendCheck.message || 'Announcements are not yet allowed for this event');
        err.statusCode = 403;
        err.code = 'ANNOUNCEMENTS_NOT_YET_ALLOWED';
        throw err;
    }

    const eventObjectId = mongoose.Types.ObjectId.isValid(eventId) ? new mongoose.Types.ObjectId(eventId) : eventId;
    const eligibleAttendees = getEligibleAttendees(event, eventAnnouncementConfig, userId);
    const seenIds = new Set();
    const list = [];
    const formResponseIdsInAttendees = new Set(
        (event.attendees || []).filter(a => a.formResponseId).map(a => (a.formResponseId?._id || a.formResponseId).toString())
    );

    eligibleAttendees.forEach((a) => {
        const uid = a.userId?._id || a.userId;
        const formResponseIdVal = a.formResponseId?._id || a.formResponseId;
        if (uid) {
            const idStr = uid.toString();
            if (seenIds.has(idStr)) return;
            seenIds.add(idStr);
            const u = a.userId;
            list.push({
                userId: idStr,
                name: u?.name || u?.username || 'Unknown',
                email: u?.email ? String(u.email).trim() : null
            });
        } else if (formResponseIdVal) {
            const idStr = `anon-${formResponseIdVal.toString()}`;
            if (seenIds.has(idStr)) return;
            seenIds.add(idStr);
            list.push({
                userId: idStr,
                isAnonymous: true,
                name: (a.guestName && String(a.guestName).trim()) ? String(a.guestName).trim() : 'Guest',
                email: (a.guestEmail && isValidEmail(a.guestEmail)) ? String(a.guestEmail).trim() : null
            });
        }
    });

    // Include form-based registrants (event.registrationFormId): FormResponse with event + submittedBy
    if (event.registrationFormId) {
        const formResponses = await FormResponse.find({ event: eventObjectId })
            .populate('submittedBy', 'name username email')
            .select('submittedBy')
            .lean();
        (formResponses || []).forEach((fr) => {
            const uid = fr.submittedBy?._id || fr.submittedBy;
            if (!uid) return;
            const idStr = uid.toString();
            if (idStr === userId.toString()) return;
            if (seenIds.has(idStr)) return;
            seenIds.add(idStr);
            const u = fr.submittedBy;
            list.push({
                userId: idStr,
                name: u?.name || u?.username || 'Unknown',
                email: u?.email ? String(u.email).trim() : null
            });
        });
    }

    // Option B: include anonymous with resolved email (email-only recipients)
    const includeAnonymousInEmail = eventAnnouncementConfig?.includeAnonymousInEmail !== false;
    const includeCheckedIn = eventAnnouncementConfig?.includeCheckedIn !== false;
    let anonymousWithNoEmailCount = 0;
    if (event.registrationFormId && includeAnonymousInEmail && includeCheckedIn) {
        const anonymousResponses = await FormResponse.find({
            event: eventObjectId,
            submittedBy: null,
            _id: { $nin: Array.from(formResponseIdsInAttendees).map(id => new mongoose.Types.ObjectId(id)) }
        })
            .select('_id guestEmail guestName formSnapshot answers')
            .lean();
        (anonymousResponses || []).forEach((fr) => {
            const email = resolveAnonymousEmail(fr, event);
            if (email) {
                list.push({
                    userId: `anon-${fr._id}`,
                    isAnonymous: true,
                    name: resolveAnonymousName(fr, event) || (fr.guestName && String(fr.guestName).trim()) || 'Guest',
                    email
                });
            } else {
                anonymousWithNoEmailCount += 1;
            }
        });
    }

    return { list, anonymousWithNoEmailCount };
}

module.exports = {
    sendEventAnnouncement,
    getAnnouncementRecipients,
    resolveAnonymousEmail,
    resolveAnonymousName
};
