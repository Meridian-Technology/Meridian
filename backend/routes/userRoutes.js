const express = require('express');
const { verifyToken, verifyTokenOptional, authorizeRoles } = require('../middlewares/verifyToken');
const { requireAdmin } = require('../middlewares/requireAdmin');
const getGlobalModels = require('../services/getGlobalModelService');
const mongoose = require('mongoose');
const cron = require('node-cron');
const axios = require('axios');
const { isProfane } = require('../services/profanityFilterService');
const StudyHistory = require('../schemas/studyHistory.js');
const { findNext } = require('../helpers.js');
const { sendDiscordMessage } = require('../services/discordWebookService');
const BadgeGrant = require('../schemas/badgeGrant');
const getModels = require('../services/getModelService');
const { uploadImageToS3, deleteAndUploadImageToS3 } = require('../services/imageUploadService');
const { sendRoomCheckinEvent } = require('../inngest/events');
const multer = require('multer');
const path = require('path');
const {
    sanitizeTenantOnboardingConfig,
    getPlatformOnboardingConfig,
    detectSignupOption,
    resolveOnboardingSteps,
    TENANT_TEMPLATE_LIBRARY,
} = require('../services/onboardingConfigService');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
    },
});


const router = express.Router();

async function loadResolvedOnboardingConfig(req, user) {
    const { TenantConfig } = getGlobalModels(req, 'TenantConfig');
    const { TenantOnboardingConfig } = getModels(req, 'TenantOnboardingConfig');
    const [platformDoc, tenantDoc] = await Promise.all([
        TenantConfig.findOne({ configKey: 'default' }).lean(),
        TenantOnboardingConfig.findOne({ configKey: 'default' }).lean(),
    ]);
    const platformConfig = getPlatformOnboardingConfig(platformDoc?.onboardingConfig || null);
    const tenantConfig = sanitizeTenantOnboardingConfig(tenantDoc || null);
    const signupOption = detectSignupOption(user);
    const steps = resolveOnboardingSteps(platformConfig, tenantConfig, signupOption);
    return {
        steps,
        signupOption,
        tenantConfig,
        platformConfig,
    };
}

async function applyOnboardingTemplateEffects(req, userId, templateSelections = {}) {
    const normalized = templateSelections && typeof templateSelections === 'object' ? templateSelections : {};
    const selectedOrgIds = Array.isArray(normalized.follow_orgs) ? normalized.follow_orgs : [];
    const selectedFriendUserIds = Array.isArray(normalized.add_friends) ? normalized.add_friends : [];
    const validOrgIds = selectedOrgIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const validFriendIdsInput = selectedFriendUserIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (validOrgIds.length > 0) {
        const { Org, OrgFollower } = getModels(req, 'Org', 'OrgFollower');
        const existing = await OrgFollower.find({
            user_id: userId,
            org_id: { $in: validOrgIds },
        }).select('org_id').lean();
        const existingSet = new Set(existing.map((row) => String(row.org_id)));
        const validOrgDocs = await Org.find({ _id: { $in: validOrgIds } }).select('_id').lean();
        const followersToCreate = validOrgDocs
            .map((org) => String(org._id))
            .filter((orgId) => !existingSet.has(orgId))
            .map((orgId) => ({
                user_id: userId,
                org_id: orgId,
            }));
        if (followersToCreate.length > 0) {
            await OrgFollower.insertMany(followersToCreate, { ordered: false });
        }
    }

    if (validFriendIdsInput.length > 0) {
        const { User, Friendship } = getModels(req, 'User', 'Friendship');
        const candidateUsers = await User.find({
            _id: { $in: validFriendIdsInput },
        }).select('_id').lean();
        const validFriendIds = candidateUsers
            .map((u) => String(u._id))
            .filter((id) => id !== String(userId));
        if (validFriendIds.length > 0) {
            const existing = await Friendship.find({
                $or: [
                    { requester: userId, recipient: { $in: validFriendIds } },
                    { requester: { $in: validFriendIds }, recipient: userId },
                ],
            }).select('requester recipient').lean();
            const existingPairs = new Set(
                existing.map((row) => [String(row.requester), String(row.recipient)].sort().join(':'))
            );
            const friendshipDocs = validFriendIds
                .filter((friendId) => !existingPairs.has([String(userId), friendId].sort().join(':')))
                .map((friendId) => ({
                    requester: userId,
                    recipient: friendId,
                    status: 'pending',
                }));
            if (friendshipDocs.length > 0) {
                await Friendship.insertMany(friendshipDocs, { ordered: false });
            }
        }
    }
}

function parseOnboardingResponses(rawResponses) {
    if (!rawResponses) return {};
    if (typeof rawResponses === 'object') return rawResponses;
    try {
        const parsed = JSON.parse(rawResponses);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function validateStepResponse(step, value) {
    const isEmpty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
    if (step.required && isEmpty) {
        return { valid: false, message: `Step "${step.title}" is required.` };
    }
    if (isEmpty) {
        return { valid: true };
    }

    if (step.type === 'short_text' || step.type === 'long_text') {
        if (typeof value !== 'string') {
            return { valid: false, message: `Step "${step.title}" must be text.` };
        }
    }

    if (step.type === 'number') {
        const n = Number(value);
        if (!Number.isFinite(n)) {
            return { valid: false, message: `Step "${step.title}" must be a number.` };
        }
    }

    if (step.type === 'single_select') {
        const validValues = new Set((step.options || []).map((option) => option.value));
        if (typeof value !== 'string' || !validValues.has(value)) {
            return { valid: false, message: `Step "${step.title}" has an invalid selection.` };
        }
    }

    if (step.type === 'multi_select') {
        const validValues = new Set((step.options || []).map((option) => option.value));
        if (!Array.isArray(value) || value.some((entry) => !validValues.has(entry))) {
            return { valid: false, message: `Step "${step.title}" has invalid selections.` };
        }
        if (step.maxSelections && value.length > step.maxSelections) {
            return { valid: false, message: `Step "${step.title}" exceeds max selections.` };
        }
    }

    if (step.type === 'template_follow_orgs' || step.type === 'template_add_friends') {
        if (!Array.isArray(value)) {
            return { valid: false, message: `Step "${step.title}" must be a list.` };
        }
    }

    return { valid: true };
}

router.get('/onboarding-config', verifyToken, async (req, res) => {
    const { User } = getModels(req, 'User');
    try {
        const user = await User.findById(req.user.userId).lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const resolved = await loadResolvedOnboardingConfig(req, user);
        return res.json({
            success: true,
            data: {
                steps: resolved.steps,
                signupOption: resolved.signupOption,
                templateLibrary: TENANT_TEMPLATE_LIBRARY,
            },
        });
    } catch (error) {
        console.error('GET /onboarding-config failed', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/onboarding-profile', verifyToken, async (req, res) => {
    const { User, Org, OrgFollower, Friendship } = getModels(req, 'User', 'Org', 'OrgFollower', 'Friendship');
    const type = String(req.query.type || '').trim().toLowerCase();
    const query = String(req.query.query || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 30);
    try {
        if (type === 'orgs') {
            const regex = query ? new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
            const orgQuery = regex ? { org_name: regex } : {};
            const orgs = await Org.find(orgQuery)
                .select('_id org_name org_profile_image org_description')
                .limit(limit)
                .lean();
            const followed = await OrgFollower.find({
                user_id: req.user.userId,
                org_id: { $in: orgs.map((org) => org._id) },
            }).select('org_id').lean();
            const followedSet = new Set(followed.map((row) => String(row.org_id)));
            return res.json({
                success: true,
                data: orgs.map((org) => ({
                    _id: org._id,
                    name: org.org_name,
                    description: org.org_description,
                    picture: org.org_profile_image,
                    isFollowing: followedSet.has(String(org._id)),
                })),
            });
        }

        if (type === 'users') {
            const userQuery = { _id: { $ne: req.user.userId } };
            if (query) {
                const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
                userQuery.$or = [{ username: regex }, { name: regex }];
            }
            const users = await User.find(userQuery)
                .select('_id username name picture')
                .limit(limit)
                .lean();
            const friendships = await Friendship.find({
                $or: [
                    { requester: req.user.userId, recipient: { $in: users.map((u) => u._id) } },
                    { requester: { $in: users.map((u) => u._id) }, recipient: req.user.userId },
                ],
            }).select('requester recipient status').lean();
            const relationMap = new Map();
            friendships.forEach((row) => {
                const other = String(row.requester) === String(req.user.userId) ? String(row.recipient) : String(row.requester);
                let status = row.status || 'pending';
                if (status === 'pending' && String(row.requester) !== String(req.user.userId)) {
                    status = 'pending_inbound';
                } else if (status === 'pending') {
                    status = 'pending_outbound';
                }
                relationMap.set(other, status);
            });
            return res.json({
                success: true,
                data: users.map((u) => ({
                    _id: u._id,
                    username: u.username,
                    name: u.name,
                    picture: u.picture,
                    friendshipStatus: relationMap.get(String(u._id)) || 'none',
                })),
            });
        }

        return res.status(400).json({ success: false, message: 'type must be "orgs" or "users".' });
    } catch (error) {
        console.error('GET /onboarding-profile failed', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/submit-onboarding', verifyToken, upload.single('picture'), async (req, res) => {
    const { User } = getModels(req, 'User');
    try {
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const responses = parseOnboardingResponses(req.body?.responses);
        const resolved = await loadResolvedOnboardingConfig(req, user);
        const errors = [];
        const normalizedResponses = {};
        const templateSelections = {};

        resolved.steps.forEach((step) => {
            const value = responses[step.key];
            const validation = validateStepResponse(step, value);
            if (!validation.valid) {
                errors.push(validation.message);
                return;
            }
            if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
                return;
            }
            if (step.type === 'number') {
                normalizedResponses[step.key] = Number(value);
            } else {
                normalizedResponses[step.key] = value;
            }
            if (step.type === 'template_follow_orgs' || step.type === 'template_add_friends') {
                templateSelections[step.templateKey] = Array.isArray(value) ? value : [];
            }
        });

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Onboarding submission has validation errors.',
                errors,
            });
        }

        const hasNameResponse = Object.prototype.hasOwnProperty.call(normalizedResponses, 'name');
        if (hasNameResponse && typeof normalizedResponses.name === 'string' && normalizedResponses.name.trim()) {
            user.name = normalizedResponses.name.trim();
        }

        const hasUsernameResponse = Object.prototype.hasOwnProperty.call(normalizedResponses, 'username');
        if (hasUsernameResponse && typeof normalizedResponses.username === 'string' && normalizedResponses.username.trim()) {
            user.username = normalizedResponses.username.trim();
        }

        if (req.file) {
            const fileExtension = path.extname(req.file.originalname || '.png');
            const timestamp = Date.now();
            const fileName = `${req.user.userId}-${timestamp}${fileExtension}`;
            if (user.picture) {
                user.picture = await deleteAndUploadImageToS3(req.file, 'users', user.picture, fileName);
            } else {
                user.picture = await uploadImageToS3(req.file, 'users', fileName);
            }
        }

        user.onboardingResponses = normalizedResponses;
        user.onboarded = true;
        user.onboardingCompletedAt = new Date();

        await applyOnboardingTemplateEffects(req, req.user.userId, templateSelections);
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Onboarding completed successfully.',
            data: {
                onboarded: true,
                onboardingResponses: normalizedResponses,
                picture: user.picture || null,
            },
        });
    } catch (error) {
        console.error('POST /submit-onboarding failed', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.get('/admin/tenant-onboarding-config', verifyToken, requireAdmin, async (req, res) => {
    try {
        const { TenantOnboardingConfig } = getModels(req, 'TenantOnboardingConfig');
        const doc = await TenantOnboardingConfig.findOne({ configKey: 'default' }).lean();
        const config = sanitizeTenantOnboardingConfig(doc || null);
        return res.json({
            success: true,
            data: {
                config,
                templateLibrary: TENANT_TEMPLATE_LIBRARY,
            },
        });
    } catch (error) {
        console.error('GET /admin/tenant-onboarding-config failed', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/admin/tenant-onboarding-config', verifyToken, requireAdmin, async (req, res) => {
    try {
        const incoming = req.body?.config;
        if (!incoming || typeof incoming !== 'object') {
            return res.status(400).json({ success: false, message: 'config object is required.' });
        }
        const config = sanitizeTenantOnboardingConfig(incoming);
        const { TenantOnboardingConfig } = getModels(req, 'TenantOnboardingConfig');
        const updatedBy = req.user.globalUserId || req.user.userId || null;
        const doc = await TenantOnboardingConfig.findOneAndUpdate(
            { configKey: 'default' },
            { $set: { steps: config.steps, updatedBy } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        ).lean();
        return res.json({
            success: true,
            data: {
                config: sanitizeTenantOnboardingConfig(doc || null),
                updatedAt: doc?.updatedAt || null,
                templateLibrary: TENANT_TEMPLATE_LIBRARY,
            },
        });
    } catch (error) {
        console.error('PUT /admin/tenant-onboarding-config failed', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.post("/update-user", verifyToken, async (req, res) => {
    const { User } = getModels(req, 'User');
    const { name, username, classroom, recommendation, onboarded } = req.body
    try {
        const user = await User.findById(req.user.userId);
        if (!user) {
            console.log(`POST: /update-user token is invalid`)
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        user.name = name ? name : user.name;
        user.username = username ? username : user.username;
        user.classroomPreferences = classroom ? classroom : user.classroomPreferences;
        user.recommendationPreferences = recommendation ? recommendation : user.recommendationPreferences;
        user.onboarded = onboarded ? onboarded : user.onboarded;

        await user.save();
        console.log(`POST: /update-user ${req.user.userId} successful`);
        return res.status(200).json({ success: true, message: 'User updated successfully' });
    } catch (error) {
    console.log(`POST: /update-user ${req.user.userId} failed`)
        return res.status(500).json({ success: false, message: error.message });
    }
});

// check if username is available
router.post("/check-username", verifyToken, async (req, res) => {
    const { User } = getModels(req, 'User');
    const { username } = req.body;
    const userId = req.user.userId;
    try {
        //check if username is taken, regardless of casing
        if (isProfane(username)) {
            console.log(`POST: /check-username ${username} is profane`)
            return res.status(200).json({ success: false, message: 'Username does not abide by community standards' });
        }
        const reqUser = await User.findById(userId);
        const user = await User.findOne({ username: { $regex: new RegExp(username, "i") } });
        if (user && user._id.toString() !== userId) {
            console.log(`POST: /check-username ${username} is taken`)
            return res.status(200).json({ success: false, message: 'Username is taken' });
        }
        console.log(`POST: /check-username ${username} is available`)
        return res.status(200).json({ success: true, message: 'Username is available' });
    } catch (error) {
        console.log(`POST: /check-username ${username} failed`)
        return res.status(500).json({ success: false, message: 'Internal server error', error });
    }
});

router.post("/check-in", verifyToken, async (req, res) => {
    const { Classroom, Schedule, StudyHistory } = getModels(req, 'Classroom', 'Schedule', 'StudyHistory');
    const { classroomId } = req.body;
    try {
        //check if user is checked in elsewhere in the checked_in array
        const classrooms = await Classroom.find({ checked_in: { $in: [req.user.userId] } });

        // const classrooms = await Classroom.find({ checkIns: req.user.userId });
        if (classrooms.length > 0) {
            console.log(`POST: /check-in ${req.user.userId} is already checked in`)
            return res.status(400).json({ success: false, message: 'User is already checked in' });
        }
        const classroom = await Classroom.findOne({ _id: classroomId });
        classroom.checked_in.push(req.user.userId);
        await classroom.save();
        if (req.user.userId !== "65f474445dca7aca4fb5acaf") {
            sendDiscordMessage(`User check-in`, `user ${req.user.userId} checked in to ${classroom.name}`, "normal");
        }
        //create history object, preempt end time using findnext
        const schedule = await Schedule.findOne({ classroom_id: classroomId });
        if (schedule) {
            let endTime = findNext(schedule.weekly_schedule); //time in minutes from midnight
            endTime = new Date(new Date().setHours(Math.floor(endTime / 60), endTime % 60, 0, 0));
            const history = new StudyHistory({
                user_id: req.user.userId,
                classroom_id: classroomId,
                start_time: new Date(),
                end_time: endTime
            });
            await history.save();
        }

        const io = req.app.get('io');
        if (io) {
            io.to(classroomId).emit('check-in', { classroomId, userId: req.user.userId });
        }

        // Send Inngest event to schedule auto-checkout after 2 hours
        // await sendRoomCheckinEvent(req.user.userId, classroomId, new Date());

        console.log(`POST: /check-in ${req.user.userId} into ${classroom.name} successful`);
        return res.status(200).json({ 
            success: true, 
            message: 'Checked in successfully - auto-checkout scheduled for 2 hours',
            data: {
                classroomId,
                classroomName: classroom.name,
                checkinTime: new Date().toISOString(),
                autoCheckoutTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2 hours from now
            }
        });
    } catch (error) {
        console.log(`POST: /check-in ${req.user.userId} failed`);
        console.log(error);
        return res.status(500).json({ success: false, message: 'Internal server error', error });
    }
});

router.get("/checked-in", verifyToken, async (req, res) => {
    const { Classroom } = getModels(req, 'Classroom');
    try {
        const classrooms = await Classroom.find({ checked_in: { $in: [req.user.userId] } });
        console.log(`GET: /checked-in ${req.user.userId} successful`)
        return res.status(200).json({ success: true, message: 'Checked in classrooms retrieved', classrooms });
    } catch (error) {
        console.log(`GET: /checked-in ${req.user.userId} failed`)
        return res.status(500).json({ success: false, message: 'Internal server error', error });
    }
});

router.post("/check-out", verifyToken, async (req, res) => {
    const { Classroom, Schedule, User, StudyHistory } = getModels(req, 'Classroom', 'Schedule', 'User', 'StudyHistory');
    const { classroomId } = req.body;
    try {
        const classroom = await Classroom.findOne({ _id: classroomId });
        classroom.checked_in = classroom.checked_in.filter(userId => userId !== req.user.userId);
        await classroom.save();
        const schedule = await Schedule.findOne({ classroom_id: classroomId });
        if (schedule) {
            //find latest history object
            const history = await StudyHistory.findOne({ user_id: req.user.userId, classroom_id: classroomId }).sort({ start_time: -1 });
            const endTime = new Date();
            //if time spent is less than 5 minutes, delete history object
            if (history) {
                const timeDiff = endTime - history.start_time;
                if (timeDiff < 300000) {
                    await history.deleteOne();
                } else {
                    //else update end time
                    history.end_time = endTime;
                    await history.save();
                    //update user stats
                    const user = await User.findOne({ _id: req.user.userId });
                    user.hours += timeDiff / 3600000;
                    //find if new classroom visited
                    const pastHistory = await StudyHistory.findOne({ user_id: req.user.userId, classroom_id: classroomId });
                    if (!pastHistory) {
                        user.visited.push(classroomId);
                    }
                }
            }
        }
        const io = req.app.get('io');
        if (io) {
            io.to(classroomId).emit('check-out', { classroomId, userId: req.user.userId });
        }
        console.log(`POST: /check-out ${req.user.userId} from ${classroom.name} successful`);
        if (req.user.userId !== "65f474445dca7aca4fb5acaf") {
            sendDiscordMessage(`User check-out`, `user ${req.user.userId} checked out of ${classroom.name}`, "normal");
        }
        return res.status(200).json({ success: true, message: 'Checked out successfully' });
    } catch (error) {
        console.log(`POST: /check-out ${req.user.userId} failed`);
        console.log(error);
        return res.status(500).json({ success: false, message: 'Internal server error', error });
    }
});

router.get("/get-developer", verifyToken, async (req, res) => {
    const { Developer } = getModels(req, 'Developer');
    try {
        const developer = await Developer.findOne({ user_id: req.user.userId });
        console.log(`GET: /get-developer ${req.user.userId} successful`);
        if (!developer) {
            return res.status(204).json({ success: false, message: 'Developer not found' });
        }
        return res.status(200).json({ success: true, message: 'Developer retrieved', developer });

    } catch (error) {
        console.log(`GET: /get-developer ${req.user.userId} failed`)
        return res.status(500).json({ success: false, message: 'Internal server error', error });
    }
});

router.post("/update-developer", verifyToken, async (req, res) => {
    const { Developer, User } = getModels(req, 'Developer', 'User');
    const { type, commitment, goals, skills } = req.body;
    try {
        const developer = await Developer.findOne({ userId: req.user.userId });
        const user = await User.findById(req.user.userId);

        if (!developer) {
            //craete developer
            const newDeveloper = new Developer({
                user_id: req.user.userId,
                name: user.name,
                type,
                commitment,
                goals,
                skills
            });
            await newDeveloper.save();
            user.developer = type;
            user.tags.push("developer");
            await user.save();
            console.log(`POST: /update-developer ${req.user.userId} successful`);
            return res.status(200).json({ success: true, message: 'Developer created successfully' });
        }
        developer.name = name ? name : developer.name;
        developer.type = type ? type : developer.type;
        developer.commitment = commitment ? commitment : developer.commitment;
        developer.goals = goals ? goals : developer.goals;
        developer.skills = skills ? skills : developer.skills;
        await developer.save();
        console.log(`POST: /update-developer ${req.user.userId} successful`);
        return res.status(200).json({ success: true, message: 'Developer updated successfully' });
    } catch (error) {
        console.log(`POST: /update-developer ${req.user.userId} failed`)
        return res.status(500).json({ success: false, message: 'Internal server error', error });
    }
});

router.get("/get-user", async (req, res) => {
    const { User } = getModels(req, 'User');
    const userId = req.query.userId;
    try {
        const user = await User.findById(userId);
        console.log(`GET: /get-user ${req.query.userId} successful`);
        return res.status(200).json({ success: true, message: 'User retrieved', user });
    } catch (error) {
        console.log(`GET: /get-user ${req.query.userId} failed`)
        return res.status(500).json({ success: false, message: 'Internal server error', error });
    }
});

//route to get mulitple users, specified in array
router.get("/get-users", async (req, res) => {
    const { User } = getModels(req, 'User');
    const userIds = req.query.userIds;
    try {
        const users = await User.find({ _id: { $in: userIds } });
        console.log(`GET: /get-users ${req.query.userId} successful`);
        return res.status(200).json({ success: true, message: 'Users retrieved', users });
    } catch (error) {
        console.log(`GET: /get-users ${req.query.userId} failed`)
        return res.status(500).json({ success: false, message: 'Internal server error', error });
    }
});

// Advanced user search with configurable filters
router.get("/search-users", verifyToken, async (req, res) => {
    const { User } = getModels(req, 'User');
    const { 
        query, 
        roles, 
        tags, 
        limit = 20, 
        skip = 0,
        sortBy = 'username',
        sortOrder = 'asc',
        excludeIds = []
    } = req.query;
    
    try {
        // Build the search query
        let searchQuery = {};
        
        // Text search on username, name, or email
        if (query) {
            // Escape regex special characters to prevent regex errors
            const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            searchQuery.$or = [
                { username: { $regex: new RegExp(escapedQuery, 'i') } },
                { name: { $regex: new RegExp(escapedQuery, 'i') } },
                { email: { $regex: new RegExp(escapedQuery, 'i') } }
            ];
        }
        
        // Filter by roles if provided
        if (roles) {
            const roleArray = Array.isArray(roles) ? roles : [roles];
            searchQuery.roles = { $in: roleArray };
        }
        
        // Filter by tags if provided
        if (tags) {
            const tagArray = Array.isArray(tags) ? tags : [tags];
            searchQuery.tags = { $in: tagArray };
        }
        
        // Exclude specific user IDs if provided
        if (excludeIds && excludeIds.length > 0) {
            let excludeArray;
            try {
                // Try to parse as JSON if it's a string
                excludeArray = typeof excludeIds === 'string' ? JSON.parse(excludeIds) : excludeIds;
                // Ensure it's an array
                excludeArray = Array.isArray(excludeArray) ? excludeArray : [excludeArray];
            } catch (error) {
                console.error('Error parsing excludeIds:', error);
                excludeArray = [excludeIds];
            }
            searchQuery._id = { $nin: excludeArray };
        }
        
        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
        
        // Execute the query with pagination
        const users = await User.find(searchQuery)
            .sort(sort)
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .select('-password -googleId'); // Exclude sensitive fields
        
        // Get total count for pagination
        const total = await User.countDocuments(searchQuery);
        
        console.log(`GET: /search-users successful`);
        return res.status(200).json({ 
            success: true, 
            message: 'Users found', 
            data: users,
            pagination: {
                total,
                limit: parseInt(limit),
                skip: parseInt(skip)
            }
        });
    } catch (error) {
        console.log(`GET: /search-users failed`, error);
        return res.status(500).json({ success: false, message: 'Internal server error', error });
    }
});

router.post('/create-badge-grant', verifyToken, requireAdmin, async (req, res) => {
    const { BadgeGrant } = getModels(req, 'BadgeGrant');
    try {
        const { badgeContent, badgeColor, daysValid } = req.body;

        // Input validation
        if (!badgeContent || !badgeColor || !daysValid) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const validFrom = new Date();
        const validTo = new Date();
        validTo.setDate(validTo.getDate() + daysValid);

        const badgeGrant = new BadgeGrant({
            badgeContent,
            badgeColor,
            validFrom,
            validTo,
        });

        await badgeGrant.save();

        res.status(201).json({
            message: 'Badge grant created successfully',
            hash: badgeGrant.hash,
            validFrom,
            validTo,
        });
    } catch (error) {
        console.error('Error creating badge grant:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/grant-badge', verifyToken, async (req, res) => {
    const { BadgeGrant, User } = getModels(req, 'BadgeGrant', 'User');
    try {
        const { hash } = req.body;
        const userId = req.user.userId;

        if (!hash) {
            return res.status(400).json({ error: 'Hash is required' });
        }

        const badgeGrant = await BadgeGrant.findOne({ hash });

        if (!badgeGrant) {
            return res.status(404).json({ error: 'Invalid badge grant' });
        }

        const currentDate = new Date();

        //check if the today's date is within the valid period
        if (currentDate < badgeGrant.validFrom || currentDate > badgeGrant.validTo) {
            return res.status(400).json({ error: 'Badge grant is not valid at this time' });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if(user.tags.includes(badgeGrant.badgeContent)){
            return res.status(406).json({ error: 'You\'ve already been granted this badge' });
        }

        // Append the badge to the user's badges array
        user.tags.push(badgeGrant.badgeContent);

        await user.save();
        console.log(`POST: /grant-badge ${req.user.userId} successful`);

        res.status(200).json({ message: 'Badge granted successfully', badges: user.badges, badge: {badgeContent:badgeGrant.badgeContent, badgeColor: badgeGrant.badgeColor} });
    } catch (error) {
        console.error('Error granting badge:', error);
        res.status(500).json({ error: error});
    }
});

router.post('/renew-badge-grant', verifyToken, requireAdmin, async (req,res) => {
    const { BadgeGrant } = getModels(req, 'BadgeGrant');
    try {
        const { badgeGrantId, daysValid } = req.body;

        if (!badgeGrantId || !daysValid) {
            return res.status(400).json({ error: 'Badge grant ID and days valid are required' });
        }

        const badgeGrant = await BadgeGrant.findById(badgeGrantId);
        if (!badgeGrant) {
            return res.status(404).json({ error: 'Badge grant not found' });
        }

        const validFrom = new Date();
        const validTo = new Date();
        validTo.setDate(validTo.getDate() + daysValid);

        badgeGrant.validFrom = validFrom;
        badgeGrant.validTo = validTo;

        await badgeGrant.save();

        res.status(200).json({
            message: 'Badge grant renewed successfully',
            validFrom,
            validTo,
        });
    } catch (error) {
        console.error('Error renewing badge grant:', error);
        res.status(500).json({ error: 'Server error' });
    }
})

router.get('/get-badge-grants', verifyToken, requireAdmin, async (req,res) => {
    const { User, BadgeGrant } = getModels(req, 'User', 'BadgeGrant');
    try{
        const user = await User.findById(req.user.userId);
        if(!user || !user.roles.includes('admin')){
            return res.status(403).json({
                success: false,
                message: 'You don\'t have permissions to view badge grants'
            })
        }
        const badgeGrants = await BadgeGrant.find({});
        return res.status(200).json({
            success:true,
            badgeGrants
        })
    } catch (error){
        console.error('Error getting badges:', error);
        res.status(500).json({erorr:error})
    }
});

router.get('/get-badge-grant/:hash', async (req,res) => {
    const { BadgeGrant } = getModels(req, 'BadgeGrant');
    try{
        const { hash } = req.params;
        const badgeGrant = await BadgeGrant.findOne({ hash });
        
        if(!badgeGrant){
            return res.status(404).json({
                success: false,
                message: 'Badge grant not found'
            })
        }
        
        return res.status(200).json({
            success: true,
            badgeGrant: {
                badgeContent: badgeGrant.badgeContent,
                badgeColor: badgeGrant.badgeColor,
                validFrom: badgeGrant.validFrom,
                validTo: badgeGrant.validTo
            }
        })
    } catch (error){
        console.error('Error getting badge grant:', error);
        res.status(500).json({error: error})
    }
});



router.post("/upload-user-image", verifyToken, upload.single('image'), async (req, res) =>{
    const { User } = getModels(req, 'User');
    const file = req.file;
    console.log('uploading user image');
    if(!file){
        console.log(`POST: /upload-user-image ${req.user.userId} no file uploaded`)
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    try{
        const user = await User.findById(req.user.userId);
        let imageUrl;
        if(!user.picture){
            // For new images, use user ID and timestamp in filename
            const fileExtension = path.extname(file.originalname);
            const timestamp = Date.now();
            const fileName = `${req.user.userId}-${timestamp}${fileExtension}`;
            imageUrl = await uploadImageToS3(file, "users", fileName);
            user.picture = imageUrl;
        } else {
            // For replacing existing images, use user ID and timestamp in filename
            const fileExtension = path.extname(file.originalname);
            const timestamp = Date.now();
            const fileName = `${req.user.userId}-${timestamp}${fileExtension}`;
            imageUrl = await deleteAndUploadImageToS3(file, "users", user.picture, fileName);
            user.picture = imageUrl;
        }
        await user.save();
        console.log(`POST: /upload-user-image ${req.user.userId} successful`);
        return res.status(200).json({ success: true, message: 'Image uploaded successfully', imageUrl });
    } catch(error){
        console.log(`POST: /upload-user-image ${req.user.userId} failed, ${error}`)
        return res.status(500).json({ success: false, message: 'Internal server error', error });
    }
});

//add or remove role from user

router.post('/manage-roles', verifyToken, requireAdmin, async (req,res) => {
    const { role, userId } = req.body;
    const { User } = getModels(req, 'User');
    try{
        console.log(`${userId}`);
        const user = await User.findById(userId);
        console.log('asd');
        if(!user){
            return res.status(404).json({
                success:false,
            })
        } else {
            const admin = await User.findById(req.user.userId);
            console.log(admin);
            if(!admin || !(admin.roles.includes('admin'))){
                console.log('POST: /manage-roles unauthorized');
                return res.status(403);
            } else {
                //update role
                if(user.roles.includes(role)){
                    //remove role
                    console.log('asd')
                    user.roles = user.roles.filter((i) => i !== role);
                    console.log(user.roles);
                    await user.save();
                    console.log(`POST: /manage-roles, successfully added ${role}`);

                    return res.status(200).json({
                        success:true,
                        message:'successfully renoved role from user'
                    })
                } else {
                    console.log('asd')
                    user.roles.push(role);
                    console.log(user);
                    const response = await user.save();
                    if(response){
                        console.log(response)
                    }
                    console.log('gothere')
                    console.log(`POST: /manage-roles, successfully added ${role}`);
                    return res.status(200).json({
                        success: true,
                        message: "successfuly aded new role to user"
                    })
                }
            }
        }
    } catch (error){
        console.log(error);
        return res.status(500).json({
            success:false,
            error
        })
    }
})

// Get user by username (for development testing)
router.post('/get-user-by-username', verifyToken, async (req, res) => {
    const { User } = getModels(req, 'User');
    const { username } = req.body;
    
    try {
        if (!username) {
            return res.status(400).json({
                success: false,
                message: 'Username is required'
            });
        }

        const user = await User.findOne({ username: { $regex: new RegExp(username, "i") } });
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Return minimal user info for security
        res.status(200).json({
            success: true,
            user: {
                _id: user._id,
                username: user.username,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Error getting user by username:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Register push notification token
router.post('/register-push-token', verifyToken, async (req, res) => {
    const { User } = getModels(req, 'User');
    const { pushToken } = req.body;
    
    try {
        if (!pushToken) {
            return res.status(400).json({
                success: false,
                message: 'Push token is required'
            });
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        user.pushToken = pushToken;
        await user.save();

        console.log(`POST: /register-push-token ${req.user.userId} successful`);
        return res.status(200).json({
            success: true,
            message: 'Push token registered successfully'
        });
    } catch (error) {
        console.log(`POST: /register-push-token ${req.user.userId} failed:`, error);
        return res.status(500).json({
            success: false,
            message: 'Error registering push token',
            error: error.message
        });
    }
});

/**
 * DELETE /delete-account
 * Permanently deletes the authenticated user's account and associated data.
 * Required for App Store Guideline 2.1 (account creation apps must offer account deletion).
 */
router.delete("/delete-account", verifyToken, async (req, res) => {
    const userId = req.user.userId;
    const models = getModels(req, 'User', 'Session', 'Friendship', 'StudyHistory', 'StudySession', 'AvailabilityPoll', 'OrgMember', 'OrgFollower', 'Rating', 'Notification', 'OrgInvite', 'OrgMemberApplication', 'Search', 'RepeatedVisit');
    const { User, Session, Friendship, StudyHistory, StudySession, AvailabilityPoll, OrgMember, OrgFollower, Rating, Notification, OrgInvite, OrgMemberApplication, Search, RepeatedVisit } = models;

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Delete sessions
        await Session.deleteMany({ userId });
        // Delete friendships (user as requester or recipient)
        await Friendship.deleteMany({ $or: [{ requester: userId }, { recipient: userId }] });
        // Delete study history
        await StudyHistory.deleteMany({ user_id: userId });
        // Delete study sessions created by user
        await StudySession.deleteMany({ creator: userId });
        // Delete availability polls created by user
        await AvailabilityPoll.deleteMany({ creatorType: 'User', creatorId: userId });
        // Delete org memberships
        await OrgMember.deleteMany({ user_id: userId });
        // Delete org follows
        await OrgFollower.deleteMany({ user_id: userId });
        // Delete ratings
        await Rating.deleteMany({ user_id: userId });
        // Delete notifications sent to user
        await Notification.deleteMany({ recipient: userId, recipientModel: 'User' });
        // Delete org invites for user
        await OrgInvite.deleteMany({ user_id: userId });
        // Delete org member applications
        await OrgMemberApplication.deleteMany({ user_id: userId });
        // Delete search history
        await Search.deleteMany({ user_id: userId });
        // Delete repeated visit records
        await RepeatedVisit.deleteMany({ user_id: userId });

        // Delete user document
        await User.findByIdAndDelete(userId);

        console.log(`DELETE: /delete-account - User ${userId} and associated data deleted`);
        return res.status(200).json({ success: true, message: 'Account deleted successfully' });
    } catch (error) {
        console.error('DELETE: /delete-account failed:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete account', error: error.message });
    }
});

module.exports = router;
