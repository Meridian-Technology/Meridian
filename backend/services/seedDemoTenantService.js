const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { getDemoModels } = require('./demoModelService');
const { DEMO_TENANT_KEY, assertDemoTenant } = require('../constants/demoTenant');

const MANIFEST_KEY = 'events-demo';
const DEFAULT_PREVIEW_EMAIL = 'preview@demo.meridian.study';
const BOOTSTRAP_ADMIN_EMAIL = 'admin@demo.meridian.study';

const FAKE_MEMBER_NAMES = [
    'Alex Rivera',
    'Jordan Kim',
    'Sam Okonkwo',
    'Taylor Brooks',
    'Morgan Lee',
    'Casey Nguyen',
    'Riley Patel',
    'Avery Chen',
    'Quinn Martinez',
    'Jamie Wilson',
];

const FAKE_ATTENDEE_NAMES = [
    'Chris Adams', 'Dana Foster', 'Eli Brooks', 'Frankie Cole', 'Gray Donovan',
    'Harper Ellis', 'Indigo Flynn', 'Jules Grant', 'Kai Hayes', 'Logan Irwin',
    'Marley James', 'Noel King', 'Oakley Lane', 'Parker Mills', 'Reese Nolan',
    'Sage Ortiz', 'Tatum Price', 'Uma Quinn', 'Vale Reed', 'Wren Shaw',
    'Xander Tate', 'Yael Underwood', 'Zion Vance', 'Amina Walsh', 'Blake Xu',
    'Cora Young', 'Devon Zhang', 'Emery Alvarez', 'Finley Baker', 'Gia Carter',
    'Hollis Diaz', 'Ivy Edwards', 'Jaden Fisher', 'Kendall Garcia', 'Lennox Hill',
    'Mika Ingram', 'Nico Jensen', 'Olive Klein', 'Phoenix Lopez', 'Rowan Moore',
    'Skyler Nash', 'Tegan Owens', 'Uri Perez', 'Vera Quinn', 'Weston Ross',
    'Ximena Stone', 'Yuri Torres', 'Zara Upton', 'Arlo Vega', 'Briar Wade',
    'Cade Xavier', 'Drew Yates', 'Eden Zimmer', 'Fallon Abbott', 'Glen Banks',
    'Haven Cross', 'Ira Dalton', 'Juno Ellis', 'Kira Finch', 'Lark Gibson',
    'Milo Harper', 'Nadia Ingram', 'Orion Jacobs', 'Piper Knox', 'Remy Lloyd',
    'Sloane Marsh', 'Theo Nash', 'Uma Olsen', 'Vance Porter', 'Willa Quinn',
    'Xena Rhodes', 'Yara Sutton', 'Zane Tucker', 'Ada Ulrich', 'Beau Vincent',
    'Cleo Walker', 'Dax Young', 'Ella Zamora', 'Felix Archer', 'Gemma Blair',
    'Hugo Crane', 'Isla Drake', 'Jude Ellis', 'Kira Flynn', 'Leo Grant',
    'Mae Holloway', 'Nate Irving', 'Opal Jensen', 'Paxton Kelly', 'Rhea Lawson',
    'Silas Mercer', 'Tia Navarro', 'Ulysses Ortiz', 'Violet Page', 'Wade Rivers',
    'Xyla Sanders', 'York Temple', 'Zelda Underhill', 'Aria Vaughn', 'Boden West',
    'Celia York', 'Dorian Zane', 'Elise Abbott', 'Ford Bennett', 'Greta Collins',
];

const AGENDA_ITEMS = [
    { title: 'Doors open & check-in', type: 'Setup', durationMin: 30 },
    { title: 'Welcome & opening remarks', type: 'Speaker', durationMin: 15 },
    { title: 'Community spotlight', type: 'Activity', durationMin: 45 },
    { title: 'Networking break', type: 'Break', durationMin: 20 },
    { title: 'Panel: Building campus community', type: 'Speaker', durationMin: 40 },
    { title: 'Activity stations', type: 'Activity', durationMin: 35 },
    { title: 'Closing & thank-yous', type: 'Speaker', durationMin: 15 },
    { title: 'Breakdown', type: 'Breakdown', durationMin: 20 },
];

function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date, days) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function randomPastDate(daysBack = 14) {
    const now = Date.now();
    const offset = Math.floor(Math.random() * daysBack * 24 * 60 * 60 * 1000);
    return new Date(now - offset);
}

function generatePreviewPassword() {
    return `Demo-${crypto.randomBytes(3).toString('hex')}`;
}

function formatManifestSummary(manifest) {
    if (!manifest) return null;
    return {
        manifestKey: MANIFEST_KEY,
        orgId: manifest.orgId?.toString(),
        eventId: manifest.eventId?.toString(),
        operatorUserId: manifest.operatorUserId?.toString(),
        seededAt: manifest.seededAt,
        version: manifest.version,
    };
}

async function removeBootstrapAdmin(db) {
    const { User } = getDemoModels(db);
    await User.deleteMany({ email: BOOTSTRAP_ADMIN_EMAIL });
}

async function createBootstrapAdmin(db) {
    const { User } = getDemoModels(db);
    await removeBootstrapAdmin(db);
    const password = generatePreviewPassword();
    const admin = new User({
        email: BOOTSTRAP_ADMIN_EMAIL,
        name: 'Demo Tenant Admin',
        username: `demo-admin-${crypto.randomBytes(3).toString('hex')}`,
        password,
        onboarded: true,
        roles: ['admin'],
        admin: true,
    });
    await admin.save();
    return {
        email: BOOTSTRAP_ADMIN_EMAIL,
        password,
        id: admin._id.toString(),
    };
}

async function listCredentialSummaries(db) {
    const { DemoCredential } = getDemoModels(db);
    const rows = await DemoCredential.find({}).sort({ createdAt: -1 }).lean();
    return rows.map((row) => ({
        id: row._id.toString(),
        email: row.email,
        label: row.label || '',
        status: row.revokedAt ? 'revoked' : (row.expiresAt && new Date(row.expiresAt) < new Date() ? 'expired' : 'active'),
        loginCount: row.loginCount || 0,
        lastLoginAt: row.lastLoginAt,
    }));
}

async function removePriorSeed(db, manifest) {
    if (!manifest) return;
    const {
        User, Org, OrgMember, Event, EventAgenda, EventAnalytics, EventJob, Task,
        DemoManifest, DemoCredential,
    } = getDemoModels(db);

    const eventId = manifest.eventId;
    const orgId = manifest.orgId;
    const userIds = [manifest.operatorUserId, ...(manifest.memberUserIds || [])];

    await Promise.all([
        Task.deleteMany({ $or: [{ orgId }, { eventId }] }),
        EventJob.deleteMany({ eventId }),
        EventAgenda.deleteMany({ eventId }),
        EventAnalytics.deleteMany({ eventId }),
        Event.deleteMany({ _id: eventId }),
        OrgMember.deleteMany({ org_id: orgId }),
        Org.deleteMany({ _id: orgId }),
        User.deleteMany({ _id: { $in: userIds } }),
        DemoCredential.deleteMany({}),
        DemoManifest.deleteMany({ key: MANIFEST_KEY }),
    ]);
    await removeBootstrapAdmin(db);
}

async function cleanupOrphanedDemoArtifacts(db) {
    const {
        User, Org, OrgMember, Event, EventAgenda, EventAnalytics, EventJob, Task,
        DemoManifest, DemoCredential,
    } = getDemoModels(db);

    const operator = await User.findOne({ email: 'events-demo-operator@internal.meridian' }).lean();
    const org = await Org.findOne({ org_name: 'Meridian Demo Collective' }).lean();
    const orgId = org?._id || operator?.clubAssociations?.[0];

    if (orgId) {
        const events = await Event.find({ hostingId: orgId }).select('_id').lean();
        const eventIds = events.map((event) => event._id);
        const memberUserIds = await OrgMember.find({ org_id: orgId }).distinct('user_id');

        await Promise.all([
            Task.deleteMany({ $or: [{ orgId }, { eventId: { $in: eventIds } }] }),
            EventJob.deleteMany({ eventId: { $in: eventIds } }),
            EventAgenda.deleteMany({ eventId: { $in: eventIds } }),
            EventAnalytics.deleteMany({ eventId: { $in: eventIds } }),
            Event.deleteMany({ _id: { $in: eventIds } }),
            OrgMember.deleteMany({ org_id: orgId }),
            Org.deleteMany({ _id: orgId }),
            User.deleteMany({ _id: { $in: memberUserIds } }),
        ]);
    }

    await Promise.all([
        User.deleteMany({
            $or: [
                { email: 'events-demo-operator@internal.meridian' },
                { email: BOOTSTRAP_ADMIN_EMAIL },
                { email: { $regex: /^demo-member-.*@internal\.meridian$/ } },
            ],
        }),
        DemoCredential.deleteMany({}),
        DemoManifest.deleteMany({ key: MANIFEST_KEY }),
    ]);
}

async function getDemoSeedStatus(db, tenantKey = DEMO_TENANT_KEY) {
    assertDemoTenant(tenantKey);
    const { DemoManifest } = getDemoModels(db);
    const manifest = await DemoManifest.findOne({ key: MANIFEST_KEY }).lean();
    return {
        seeded: Boolean(manifest),
        manifest: formatManifestSummary(manifest),
    };
}

async function runSeedDemoTenant(db, { reset = false, tenantKey = DEMO_TENANT_KEY } = {}) {
    assertDemoTenant(tenantKey);

    const models = getDemoModels(db);
    const {
        User, Org, OrgMember, Event, EventAgenda, EventAnalytics, EventJob, Task,
        DemoManifest, DemoCredential,
    } = models;

    const existingManifest = await DemoManifest.findOne({ key: MANIFEST_KEY });
    if (existingManifest && reset) {
        await removePriorSeed(db, existingManifest);
    } else if (existingManifest && !reset) {
        const credentials = await listCredentialSummaries(db);
        return {
            alreadySeeded: true,
            reset: false,
            tenant: tenantKey,
            manifest: formatManifestSummary(existingManifest),
            credentials,
            message: 'Demo seed already exists. Pass reset=true to replace and regenerate passwords.',
        };
    } else {
        await cleanupOrphanedDemoArtifacts(db);
    }

    const now = new Date();
    const eventStart = addDays(now, -1);
    eventStart.setHours(18, 0, 0, 0);
    const eventEnd = addDays(now, 1);
    eventEnd.setHours(22, 0, 0, 0);

    const operator = new User({
        email: 'events-demo-operator@internal.meridian',
        name: 'Demo Operator',
        username: `demo-operator-${crypto.randomBytes(3).toString('hex')}`,
        password: crypto.randomBytes(16).toString('hex'),
        onboarded: true,
        roles: ['user'],
    });
    await operator.save();

    const memberUsers = [];
    for (let i = 0; i < FAKE_MEMBER_NAMES.length; i += 1) {
        const name = FAKE_MEMBER_NAMES[i];
        const slug = slugify(name);
        const member = new User({
            email: `demo-member-${slug}@internal.meridian`,
            name,
            username: `demo-${slug}-${i}`,
            password: crypto.randomBytes(16).toString('hex'),
            onboarded: true,
            roles: ['user'],
        });
        await member.save();
        memberUsers.push(member);
    }

    const org = new Org({
        org_name: 'Meridian Demo Collective',
        org_description:
            'A sample student organization for exploring Meridian\'s event workspace. All data here is fictional and safe to browse.',
        org_profile_image: '/Logo.svg',
        org_banner_image: null,
        owner: operator._id,
        approvalStatus: 'approved',
        verified: true,
        verificationType: 'cultural',
        lifecycleStatus: 'active',
        orgTypeKey: 'default',
        weekly_meeting: {
            day: 'Wednesday',
            time: '6:00 PM',
            location: 'Student Union 201',
        },
        socialLinks: [
            { type: 'instagram', username: 'meridianstudy' },
            { type: 'website', url: 'https://meridian.study', title: 'Meridian' },
        ],
    });
    await org.save();

    const operatorMember = new OrgMember({
        org_id: org._id,
        user_id: operator._id,
        role: 'owner',
        roles: ['owner'],
        status: 'active',
        assignedBy: operator._id,
    });
    await operatorMember.save();

    for (const member of memberUsers) {
        const orgMember = new OrgMember({
            org_id: org._id,
            user_id: member._id,
            role: 'member',
            roles: ['member'],
            status: 'active',
            assignedBy: operator._id,
        });
        await orgMember.save();
        member.clubAssociations = [org._id];
        await member.save();
    }

    operator.clubAssociations = [org._id];
    await operator.save();

    const attendees = FAKE_ATTENDEE_NAMES.map((name, index) => {
        const checkedIn = index < Math.floor(FAKE_ATTENDEE_NAMES.length * 0.68);
        return {
            guestName: name,
            guestEmail: `${slugify(name)}@example.com`,
            registeredAt: randomPastDate(12),
            guestCount: 1,
            checkedIn,
            checkedInAt: checkedIn ? addMinutes(eventStart, 15 + (index % 90)) : undefined,
        };
    });

    const event = new Event({
        name: 'Spring Community Night',
        description:
            'An evening of connection, conversation, and community-building. Explore how Meridian helps org leaders plan, run, and wrap up campus events.',
        type: 'Social',
        location: 'Student Union Ballroom',
        expectedAttendance: 120,
        visibility: 'public',
        hostingId: org._id,
        hostingType: 'Org',
        start_time: eventStart,
        end_time: eventEnd,
        status: 'approved',
        image: null,
        registrationEnabled: true,
        registrationRequired: true,
        maxAttendees: 150,
        registrationCount: attendees.length,
        attendees,
        checkInEnabled: true,
        contact: operator.email,
    });
    await event.save();

    let agendaCursor = new Date(eventStart);
    const agendaItemDocs = AGENDA_ITEMS.map((item, index) => {
        const startTime = new Date(agendaCursor);
        const endTime = addMinutes(agendaCursor, item.durationMin);
        agendaCursor = endTime;
        return {
            id: `agenda-${index + 1}`,
            title: item.title,
            description: '',
            startTime,
            endTime,
            type: item.type,
            location: item.type === 'Break' ? 'Lobby' : 'Student Union Ballroom',
            isPublic: true,
            order: index,
        };
    });

    await EventAgenda.create({
        eventId: event._id,
        orgId: org._id,
        items: agendaItemDocs,
        publicNotes: 'Doors open 30 minutes before the program begins.',
        isPublished: true,
    });

    await EventAnalytics.create({
        eventId: event._id,
        views: 842,
        uniqueViews: 614,
        registrations: attendees.length,
        uniqueRegistrations: attendees.length,
        engagementRate: 0.73,
    });

    const setupJob = await EventJob.create({
        eventId: event._id,
        orgId: org._id,
        name: 'Check-in desk',
        description: 'Welcome attendees and manage check-in',
        requiredCount: 3,
        shiftStart: addMinutes(eventStart, -30),
        shiftEnd: addMinutes(eventStart, 45),
        assignments: memberUsers.slice(0, 2).map((member) => ({
            memberId: member._id,
            status: 'confirmed',
            assignedAt: randomPastDate(5),
        })),
    });

    await EventJob.create({
        eventId: event._id,
        orgId: org._id,
        name: 'Room setup',
        description: 'Tables, signage, and AV check',
        requiredCount: 4,
        shiftStart: addMinutes(eventStart, -90),
        shiftEnd: eventStart,
        assignments: [{
            memberId: memberUsers[2]._id,
            status: 'confirmed',
            assignedAt: randomPastDate(4),
        }],
    });

    const preEventTasks = [
        { title: 'Finalize run-of-show', status: 'done', priority: 'high' },
        { title: 'Send reminder announcement', status: 'in_progress', priority: 'high' },
        { title: 'Confirm volunteer shifts', status: 'in_progress', priority: 'medium' },
        { title: 'Print check-in QR codes', status: 'todo', priority: 'medium' },
        { title: 'Brief panel speakers', status: 'todo', priority: 'low' },
    ];

    const postEventTasks = [
        { title: 'Send thank-you to volunteers', status: 'todo', priority: 'high' },
        { title: 'Publish post-event feedback form', status: 'todo', priority: 'high' },
        { title: 'Complete post-mortem summary', status: 'todo', priority: 'medium' },
        { title: 'Archive event photos', status: 'todo', priority: 'low' },
    ];

    const taskPayloads = [
        ...preEventTasks.map((task, index) => ({
            ...task,
            boardRank: index,
            dueAt: addDays(eventStart, -3 + index),
            dueRule: { anchorType: 'event_start', offsetValue: 3 - index, offsetUnit: 'days', direction: 'before' },
        })),
        ...postEventTasks.map((task, index) => ({
            ...task,
            boardRank: index,
            dueAt: addDays(eventEnd, 1 + index),
            dueRule: { anchorType: 'event_end', offsetValue: 1 + index, offsetUnit: 'days', direction: 'after' },
        })),
    ];

    await Task.insertMany(taskPayloads.map((task) => ({
        orgId: org._id,
        eventId: event._id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        boardRank: task.boardRank,
        dueAt: task.dueAt,
        dueRule: task.dueRule,
        ownerUserId: operator._id,
        source: 'template_applied',
        userConfirmed: true,
    })));

    const previewPassword = generatePreviewPassword();
    const previewCredential = await DemoCredential.create({
        email: DEFAULT_PREVIEW_EMAIL,
        passwordHash: await bcrypt.hash(previewPassword, 12),
        label: 'Default preview credential',
        metadata: { seeded: true, purpose: 'events-demo' },
    });

    const bootstrapAdmin = await createBootstrapAdmin(db);

    const manifest = await DemoManifest.create({
        key: MANIFEST_KEY,
        orgId: org._id,
        eventId: event._id,
        operatorUserId: operator._id,
        memberUserIds: memberUsers.map((member) => member._id),
        seededAt: new Date(),
        version: 1,
    });

    return {
        alreadySeeded: false,
        reset,
        tenant: tenantKey,
        manifest: formatManifestSummary(manifest),
        summary: {
            registrations: attendees.length,
            checkedIn: attendees.filter((attendee) => attendee.checkedIn).length,
            agendaItems: agendaItemDocs.length,
            tasks: taskPayloads.length,
            eventJobs: 2,
            setupJobId: setupJob._id.toString(),
            eventWindow: {
                start: eventStart.toISOString(),
                end: eventEnd.toISOString(),
            },
        },
        previewCredential: {
            email: previewCredential.email,
            password: previewPassword,
            id: previewCredential._id.toString(),
        },
        bootstrapAdmin,
        credentials: await listCredentialSummaries(db),
    };
}

module.exports = {
    MANIFEST_KEY,
    DEFAULT_PREVIEW_EMAIL,
    BOOTSTRAP_ADMIN_EMAIL,
    getDemoSeedStatus,
    runSeedDemoTenant,
    listCredentialSummaries,
};
