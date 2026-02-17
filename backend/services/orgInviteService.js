/**
 * Service for org invite flows.
 * Uses getModels(req, ...) for multi-tenant DB access.
 */

const getModels = require('./getModelService');
const NotificationService = require('./notificationService');
const { Resend } = require('resend');
const { checkAndAutoApproveOrg } = require('./orgApprovalService');

function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Build invite email HTML using same styling as org approval email (orgRoutes.js).
 * Panel-style layout: font-family sans-serif, max-width 600px, #6d8efa CTA buttons.
 */
function buildExistingUserInviteEmail({ orgName, orgDescription, role, roleDisplayName, inviterName, acceptUrl, declineUrl }) {
    const safeOrgName = escapeHtml(orgName);
    const safeDescription = escapeHtml((orgDescription || '').substring(0, 300) + (orgDescription && orgDescription.length > 300 ? '...' : ''));
    const safeRole = escapeHtml(roleDisplayName || role);
    const safeInviter = escapeHtml(inviterName);
    return `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1f2937;">Organization invitation</h2>
            <p><strong>${safeInviter}</strong> has invited you to join <strong>${safeOrgName}</strong> as <strong>${safeRole}</strong>.</p>
            <p><strong>About ${safeOrgName}</strong></p>
            <p>${safeDescription || 'Join this organization on Meridian to collaborate, manage events, and connect with members.'}</p>
            <p><strong>Your role</strong></p>
            <p>As ${safeRole}, you will have access to the organization's events, members, and resources based on your permissions.</p>
            <p><strong>What to do next</strong></p>
            <p>Click below to accept or decline this invitation. If you accept, you'll be added to the organization immediately.</p>
            <p>
                <a href="${acceptUrl}" style="display: inline-block; padding: 12px 24px; background: #6d8efa; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-right: 12px;">Accept invitation</a>
                <a href="${declineUrl}" style="display: inline-block; padding: 12px 24px; background: #6b7280; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Decline</a>
            </p>
            <p style="color: #6b7280; font-size: 14px;">This invitation will expire in 7 days. This is an automated message from Meridian.</p>
        </div>
    `;
}

function buildNewUserInviteEmail({ orgName, orgDescription, role, roleDisplayName, inviterName, signUpUrl }) {
    const safeOrgName = escapeHtml(orgName);
    const safeDescription = escapeHtml((orgDescription || '').substring(0, 300) + (orgDescription && orgDescription.length > 300 ? '...' : ''));
    const safeRole = escapeHtml(roleDisplayName || role);
    const safeInviter = escapeHtml(inviterName);
    return `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1f2937;">You're invited to join ${safeOrgName}</h2>
            <p><strong>${safeInviter}</strong> has invited you to join <strong>${safeOrgName}</strong> as <strong>${safeRole}</strong>.</p>
            <p><strong>About ${safeOrgName}</strong></p>
            <p>${safeDescription || 'Join this organization on Meridian to collaborate, manage events, and connect with members.'}</p>
            <p><strong>Your role</strong></p>
            <p>As ${safeRole}, you will have access to the organization's events, members, and resources based on your permissions.</p>
            <p><strong>Create an account to join</strong></p>
            <p>You don't have a Meridian account yet. Create a free account using the same email address this invite was sent to, and you'll automatically be added to ${safeOrgName}.</p>
            <p><a href="${signUpUrl}" style="display: inline-block; padding: 12px 24px; background: #6d8efa; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Create account & join</a></p>
            <p style="color: #6b7280; font-size: 14px;">Use the same email address when signing up. This invitation will expire in 7 days. This is an automated message from Meridian.</p>
        </div>
    `;
}

const resend = new Resend(process.env.RESEND_API_KEY);
const INVITE_EXPIRY_DAYS = 7;
const BATCH_MAX = 30;

function getBaseUrl(req) {
    return process.env.NODE_ENV === 'production'
        ? 'https://www.meridian.study'
        : 'http://localhost:3000';
}

/**
 * Create a single invite. Sends notification (if user exists) and email.
 * @returns {{ userExists: boolean, inviteId: string }}
 */
async function createInvite(req, orgId, email, role) {
    const { OrgInvite, User, Org, OrgMember } = getModels(req, 'OrgInvite', 'User', 'Org', 'OrgMember');
    const inviterId = req.user.userId;

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail) {
        throw new Error('Email is required');
    }

    const org = await Org.findById(orgId);
    if (!org) {
        throw new Error('Organization not found');
    }

    const roleExists = org.getRoleByName ? org.getRoleByName(role) : org.positions?.find(p => p.name === role);
    if (!roleExists) {
        throw new Error('Role not found');
    }

    const memberEmails = (await OrgMember.find({ org_id: orgId, status: 'active' })
        .populate('user_id', 'email'))
        .map(m => m.user_id?.email?.toLowerCase())
        .filter(Boolean);
    if (memberEmails.includes(normalizedEmail)) {
        throw new Error('User is already a member');
    }

    const existingInvite = await OrgInvite.findOne({
        org_id: orgId,
        email: normalizedEmail,
        status: 'pending'
    });
    if (existingInvite) {
        throw new Error('Invite already sent to this email');
    }

    const user = await User.findOne({ email: normalizedEmail });
    const userExists = !!user;

    const token = OrgInvite.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    const invite = new OrgInvite({
        org_id: orgId,
        email: normalizedEmail,
        user_id: user?._id || null,
        role,
        invited_by: inviterId,
        status: 'pending',
        token,
        expires_at: expiresAt
    });
    await invite.save();

    const inviter = await User.findById(inviterId).select('name username');
    const inviterName = inviter?.name || inviter?.username || 'Someone';

    const roleObj = roleExists;
    const roleDisplayName = roleObj?.displayName || role;

    const baseUrl = getBaseUrl(req);

    if (userExists) {
        const { Notification } = getModels(req, 'Notification');
        const notificationService = NotificationService.withModels({ Notification, User, Org });
        await notificationService.createSystemNotification(
            user._id,
            'User',
            'org_invitation',
            {
                orgName: org.org_name,
                role,
                invitationId: invite._id.toString(),
                metadata: { inviteId: invite._id.toString() }
            }
        );

        const inviteUrl = `${baseUrl}/org-invites?token=${token}`;
        const emailHTML = buildExistingUserInviteEmail({
            orgName: org.org_name,
            orgDescription: org.org_description,
            role,
            roleDisplayName,
            inviterName,
            acceptUrl: inviteUrl,
            declineUrl: inviteUrl
        });
        await resend.emails.send({
            from: 'Meridian <support@meridian.study>',
            to: [normalizedEmail],
            subject: `You're invited to join ${org.org_name}`,
            html: emailHTML
        });
    } else {
        const signUpUrl = `${baseUrl}/org-invites/landing/${token}`;
        const emailHTML = buildNewUserInviteEmail({
            orgName: org.org_name,
            orgDescription: org.org_description,
            role,
            roleDisplayName,
            inviterName,
            signUpUrl
        });
        await resend.emails.send({
            from: 'Meridian <support@meridian.study>',
            to: [normalizedEmail],
            subject: `You're invited to join ${org.org_name} on Meridian`,
            html: emailHTML
        });
    }

    return { userExists, inviteId: invite._id.toString() };
}

/**
 * Preview batch: filter members + invited, enrich with user info.
 * @returns {{ members: string[], invited: string[], toInvite: Array<{ email: string, user?: object, role: string }> }}
 */
async function batchPreview(req, orgId, emails) {
    const { OrgInvite, User, Org, OrgMember } = getModels(req, 'OrgInvite', 'User', 'Org', 'OrgMember');

    if (!Array.isArray(emails) || emails.length > BATCH_MAX) {
        throw new Error(`Emails must be an array with max ${BATCH_MAX} items`);
    }

    const normalized = [...new Set(emails.map(e => String(e).trim().toLowerCase()).filter(Boolean))];
    if (normalized.length === 0) {
        return { members: [], invited: [], toInvite: [] };
    }

    const org = await Org.findById(orgId);
    if (!org) {
        throw new Error('Organization not found');
    }

    const members = await OrgMember.find({ org_id: orgId, status: 'active' }).populate('user_id', 'email');
    const memberEmails = new Set(members.map(m => m.user_id?.email?.toLowerCase()).filter(Boolean));

    const pendingInvites = await OrgInvite.find({ org_id: orgId, status: 'pending' });
    const invitedEmails = new Set(pendingInvites.map(i => i.email?.toLowerCase()).filter(Boolean));

    const membersList = [];
    const invitedList = [];
    const toInviteMap = new Map();

    for (const email of normalized) {
        if (memberEmails.has(email)) {
            membersList.push(email);
        } else if (invitedEmails.has(email)) {
            invitedList.push(email);
        } else {
            toInviteMap.set(email, { email, role: 'member' });
        }
    }

    const toInviteEmails = Array.from(toInviteMap.keys());
    const users = await User.find({ email: { $in: toInviteEmails } }).select('_id username name email picture');
    const userByEmail = new Map(users.map(u => [u.email?.toLowerCase(), u]));

    const toInvite = toInviteEmails.map(email => {
        const user = userByEmail.get(email);
        return {
            email,
            user: user ? { _id: user._id, username: user.username, name: user.name, email: user.email, picture: user.picture } : null,
            role: 'member'
        };
    });

    return {
        members: membersList,
        invited: invitedList,
        toInvite
    };
}

/**
 * Create batch invites.
 * @returns {{ sent: number, skipped: number, errors: Array<{ email: string, message: string }> }}
 */
async function createBatchInvites(req, orgId, invites) {
    if (!Array.isArray(invites) || invites.length > BATCH_MAX) {
        throw new Error(`Invites must be an array with max ${BATCH_MAX} items`);
    }

    const result = { sent: 0, skipped: 0, errors: [] };

    for (const { email, role } of invites) {
        try {
            await createInvite(req, orgId, email, role || 'member');
            result.sent++;
        } catch (err) {
            if (err.message?.includes('already a member') || err.message?.includes('already sent')) {
                result.skipped++;
            } else {
                result.errors.push({ email: email || 'unknown', message: err.message });
            }
        }
    }

    return result;
}

/**
 * Accept an invite by ID (authenticated user).
 */
async function acceptInvite(req, inviteId) {
    const { OrgInvite, OrgMember, User, Org } = getModels(req, 'OrgInvite', 'OrgMember', 'User', 'Org');
    const userId = req.user.userId;

    const invite = await OrgInvite.findById(inviteId);
    if (!invite) {
        throw new Error('Invitation not found');
    }
    if (invite.status !== 'pending') {
        throw new Error('Invitation is no longer valid');
    }
    if (new Date() > invite.expires_at) {
        invite.status = 'expired';
        await invite.save();
        throw new Error('Invitation has expired');
    }

    const user = await User.findById(userId);
    if (!user) {
        throw new Error('User not found');
    }
    const userEmail = user.email?.toLowerCase();
    if (userEmail !== invite.email?.toLowerCase()) {
        throw new Error('This invitation was sent to a different email address');
    }

    const existingMember = await OrgMember.findOne({ org_id: invite.org_id, user_id: userId });
    if (existingMember) {
        invite.status = 'accepted';
        await invite.save();
        return { alreadyMember: true };
    }

    const member = new OrgMember({
        org_id: invite.org_id,
        user_id: userId,
        role: invite.role,
        status: 'active',
        assignedBy: invite.invited_by
    });
    await member.save();

    if (!user.clubAssociations?.some(c => c.toString() === invite.org_id)) {
        if (!user.clubAssociations) user.clubAssociations = [];
        user.clubAssociations.push(invite.org_id);
        await user.save();
    }

    invite.status = 'accepted';
    invite.user_id = userId;
    await invite.save();

    await checkAndAutoApproveOrg(req, invite.org_id);

    return { alreadyMember: false };
}

/**
 * Accept invite by token (for email links).
 */
async function acceptInviteByToken(req, token) {
    const { OrgInvite } = getModels(req, 'OrgInvite');
    const invite = await OrgInvite.findOne({ token, status: 'pending' });
    if (!invite) {
        throw new Error('Invitation not found or expired');
    }
    return acceptInvite(req, invite._id.toString());
}

/**
 * Decline an invite.
 */
async function declineInvite(req, inviteId) {
    const { OrgInvite, User } = getModels(req, 'OrgInvite', 'User');
    const userId = req.user.userId;

    const invite = await OrgInvite.findById(inviteId);
    if (!invite) {
        throw new Error('Invitation not found');
    }
    if (invite.status !== 'pending') {
        return;
    }

    const user = await User.findById(userId);
    const userEmail = user?.email?.toLowerCase();
    if (userEmail !== invite.email?.toLowerCase()) {
        throw new Error('This invitation was sent to a different email address');
    }

    invite.status = 'declined';
    await invite.save();
}

/**
 * Decline invite by token.
 */
async function declineInviteByToken(req, token) {
    const { OrgInvite } = getModels(req, 'OrgInvite');
    const invite = await OrgInvite.findOne({ token, status: 'pending' });
    if (!invite) {
        throw new Error('Invitation not found or expired');
    }
    return declineInvite(req, invite._id.toString());
}

/**
 * Get pending invites for the current user (by user_id or email).
 */
async function getPendingForUser(req) {
    const { OrgInvite, Org, User } = getModels(req, 'OrgInvite', 'Org', 'User');
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) return [];

    const invites = await OrgInvite.find({
        status: 'pending',
        expires_at: { $gt: new Date() },
        $or: [
            { user_id: userId },
            { email: user.email?.toLowerCase() }
        ]
    })
        .populate('org_id', 'org_name org_profile_image')
        .populate('invited_by', 'name username')
        .lean();

    return invites.map(inv => ({
        _id: inv._id,
        org: inv.org_id,
        role: inv.role,
        invitedBy: inv.invited_by
    }));
}

/**
 * Validate token for register page. Returns org name and inviter.
 */
async function validateToken(req, token) {
    const { OrgInvite } = getModels(req, 'OrgInvite');
    const invite = await OrgInvite.findOne({ token, status: 'pending' })
        .populate('org_id', 'org_name')
        .populate('invited_by', 'name username');
    if (!invite || new Date() > invite.expires_at) {
        return null;
    }
    return {
        orgName: invite.org_id?.org_name,
        inviterName: invite.invited_by?.name || invite.invited_by?.username,
        email: invite.email
    };
}

/**
 * List org invites (for admins).
 */
async function listOrgInvites(req, orgId) {
    const { OrgInvite } = getModels(req, 'OrgInvite');
    return OrgInvite.find({ org_id: orgId })
        .populate('invited_by', 'name username')
        .populate('user_id', 'name username email picture')
        .sort({ created_at: -1 })
        .lean();
}

module.exports = {
    createInvite,
    createBatchInvites,
    batchPreview,
    acceptInvite,
    acceptInviteByToken,
    declineInvite,
    declineInviteByToken,
    getPendingForUser,
    validateToken,
    listOrgInvites
};
