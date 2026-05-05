#!/usr/bin/env node
/**
 * Seed script: creates a realistic org with events, members, analytics,
 * registrations, volunteer signups, equipment, and agenda data.
 *
 * Usage: node scripts/seed-event-demo.js
 *
 * Connects to local MongoDB at mongodb://localhost:27017/rpi
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const MONGO_URI = process.env.MONGO_URI_RPI || 'mongodb://localhost:27017/rpi';
const PLATFORM_URI = MONGO_URI.replace(/\/([^/]+)(\?|$)/, '/meridian_platform$2');

async function main() {
  const conn = await mongoose.createConnection(MONGO_URI).asPromise();
  const platformConn = await mongoose.createConnection(PLATFORM_URI).asPromise();
  console.log('Connected to rpi + platform databases');

  // ─── Schemas (minimal, strict:false lets us insert any shape) ───
  const flexSchema = new mongoose.Schema({}, { strict: false, timestamps: true, id: false });
  const flexSchemaNoTs = new mongoose.Schema({}, { strict: false, id: false });

  const User = conn.model('User', flexSchema, 'users');
  const Org = conn.model('Org', flexSchema, 'orgs');
  const OrgMember = conn.model('OrgMember', flexSchema, 'members');
  const Event = conn.model('Event', flexSchemaNoTs, 'events');
  const EventAnalytics = conn.model('EventAnalytics', flexSchemaNoTs, 'eventAnalytics');
  const EventAgenda = conn.model('EventAgenda', flexSchema, 'eventAgendas');
  const EventJob = conn.model('EventJob', flexSchema, 'eventRoles');
  const OrgEventRole = conn.model('OrgEventRole', flexSchema, 'orgEventRoles');
  const VolunteerSignup = conn.model('VolunteerSignup', flexSchema, 'volunteerSignups');
  const EventEquipment = conn.model('EventEquipment', flexSchema, 'eventEquipment');
  const OrgEquipment = conn.model('OrgEquipment', flexSchema, 'orgEquipment');
  const FormModel = conn.model('Form', flexSchemaNoTs, 'forms');
  const FormResponse = conn.model('FormResponse', flexSchemaNoTs, 'formResponses');
  const OrgFollower = conn.model('OrgFollower', flexSchemaNoTs, 'followers');
  const Classroom = conn.model('Classroom', flexSchemaNoTs, 'classrooms1');
  const Building = conn.model('Building', flexSchemaNoTs, 'buildings');

  const GlobalUser = platformConn.model('GlobalUser', flexSchema, 'globalusers');
  const TenantMembership = platformConn.model('TenantMembership', flexSchema, 'tenantmemberships');
  const Session = platformConn.model('Session', flexSchema, 'sessions');

  // ─── Clean previous seed data ───
  const seedMarker = { _seedDemo: true };
  for (const M of [User, Org, OrgMember, Event, EventAnalytics, EventAgenda,
    EventJob, OrgEventRole, VolunteerSignup, EventEquipment, OrgEquipment,
    FormModel, FormResponse, OrgFollower, Classroom, Building]) {
    await M.deleteMany(seedMarker);
  }
  await GlobalUser.deleteMany(seedMarker);
  await TenantMembership.deleteMany(seedMarker);
  await Session.deleteMany(seedMarker);
  console.log('Cleaned previous seed data');

  // ─── Buildings & Rooms ───
  const empacBuilding = await Building.create({
    ...seedMarker,
    name: 'EMPAC',
    code: 'EMPAC',
    address: '110 8th St, Troy, NY',
  });
  const unionBuilding = await Building.create({
    ...seedMarker,
    name: 'Rensselaer Union',
    code: 'UNION',
    address: '110 8th St, Troy, NY',
  });
  const empacRoom = await Classroom.create({
    ...seedMarker,
    name: 'EMPAC Concert Hall',
    building: empacBuilding._id,
    capacity: 1200,
    type: 'auditorium',
  });
  const unionRoom = await Classroom.create({
    ...seedMarker,
    name: 'McNeil Room',
    building: unionBuilding._id,
    capacity: 200,
    type: 'conference',
  });

  // ─── Users ───
  const hashedPw = await bcrypt.hash('password123', 10);

  const adminUser = await User.create({
    ...seedMarker,
    username: 'demo_admin',
    name: 'Jordan Rivera',
    email: 'demo@meridian.test',
    password: hashedPw,
    admin: true,
    roles: ['admin', 'developer'],
    onboarded: true,
    picture: '',
    clubAssociations: [],
  });

  const memberUsers = [];
  const memberData = [
    { username: 'alex_chen', name: 'Alex Chen', email: 'alex.chen@rpi.edu' },
    { username: 'priya_patel', name: 'Priya Patel', email: 'priya.patel@rpi.edu' },
    { username: 'marcus_johnson', name: 'Marcus Johnson', email: 'marcus.j@rpi.edu' },
    { username: 'sofia_rodriguez', name: 'Sofia Rodriguez', email: 'sofia.r@rpi.edu' },
    { username: 'liam_oconnor', name: 'Liam O\'Connor', email: 'liam.oc@rpi.edu' },
    { username: 'aisha_williams', name: 'Aisha Williams', email: 'aisha.w@rpi.edu' },
    { username: 'david_kim', name: 'David Kim', email: 'david.kim@rpi.edu' },
    { username: 'emma_davis', name: 'Emma Davis', email: 'emma.d@rpi.edu' },
    { username: 'noah_brown', name: 'Noah Brown', email: 'noah.b@rpi.edu' },
    { username: 'olivia_martinez', name: 'Olivia Martinez', email: 'olivia.m@rpi.edu' },
    { username: 'ethan_wright', name: 'Ethan Wright', email: 'ethan.w@rpi.edu' },
    { username: 'mia_thompson', name: 'Mia Thompson', email: 'mia.t@rpi.edu' },
    { username: 'james_garcia', name: 'James Garcia', email: 'james.g@rpi.edu' },
    { username: 'ava_anderson', name: 'Ava Anderson', email: 'ava.a@rpi.edu' },
    { username: 'ben_taylor', name: 'Benjamin Taylor', email: 'ben.t@rpi.edu' },
  ];

  for (const md of memberData) {
    const u = await User.create({
      ...seedMarker,
      ...md,
      password: hashedPw,
      onboarded: true,
      roles: ['user'],
      clubAssociations: [],
    });
    memberUsers.push(u);
  }
  console.log(`Created ${memberUsers.length + 1} users`);

  // ─── Organization ───
  const orgPositions = [
    {
      name: 'owner',
      displayName: 'President',
      permissions: ['manage_events', 'manage_members', 'manage_roles', 'view_analytics',
        'manage_settings', 'manage_announcements', 'manage_forms', 'manage_budgets',
        'view_events', 'create_events', 'edit_events', 'delete_events'],
      isDefault: false,
      canManageMembers: true,
      canManageRoles: true,
      canManageEvents: true,
      canViewAnalytics: true,
      order: 0,
      color: '#3B82F6',
    },
    {
      name: 'vice_president',
      displayName: 'Vice President',
      permissions: ['manage_events', 'manage_members', 'view_analytics', 'manage_announcements',
        'view_events', 'create_events', 'edit_events'],
      isDefault: false,
      canManageMembers: true,
      canManageRoles: false,
      canManageEvents: true,
      canViewAnalytics: true,
      order: 1,
      color: '#8B5CF6',
    },
    {
      name: 'events_coordinator',
      displayName: 'Events Coordinator',
      permissions: ['manage_events', 'view_analytics', 'view_events', 'create_events', 'edit_events'],
      isDefault: false,
      canManageMembers: false,
      canManageRoles: false,
      canManageEvents: true,
      canViewAnalytics: true,
      order: 2,
      color: '#EC4899',
    },
    {
      name: 'member',
      displayName: 'Member',
      permissions: ['view_events'],
      isDefault: true,
      canManageMembers: false,
      canManageRoles: false,
      canManageEvents: false,
      canViewAnalytics: false,
      order: 3,
      color: '#6B7280',
    },
  ];

  const org = await Org.create({
    ...seedMarker,
    org_name: 'RPI-Innovators-Hub',
    org_profile_image: 'https://ui-avatars.com/api/?name=RPI+Innovators+Hub&background=3B82F6&color=fff&size=200',
    org_banner_image: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&h=400&fit=crop',
    org_description: 'RPI Innovators Hub is a student-run organization dedicated to fostering innovation, entrepreneurship, and technology leadership on campus. We host hackathons, tech talks, startup showcases, and networking events that connect students with industry professionals and fellow innovators.',
    positions: orgPositions,
    owner: adminUser._id,
    verified: true,
    verifiedAt: new Date('2024-09-01'),
    verificationType: 'manual',
    verificationStatus: 'verified',
    approvalStatus: 'approved',
    approvedAt: new Date('2024-09-01'),
    lifecycleStatus: 'active',
    orgTypeKey: 'student_org',
    messageSettings: {
      enabled: true,
      visibility: 'members',
      postingPermissions: ['owner', 'vice_president', 'events_coordinator'],
      allowReplies: true,
      allowLikes: true,
      requireApproval: false,
      characterLimit: 1000,
    },
    socialLinks: [
      { type: 'instagram', username: 'rpi_innovators', order: 0 },
      { type: 'website', url: 'https://innovators.rpi.edu', title: 'Our Website', order: 1 },
    ],
    betaFeatureKeys: ['tasks'],
    taskBoardStatuses: [
      { key: 'backlog', label: 'Backlog', category: 'backlog', order: 0 },
      { key: 'todo', label: 'To Do', category: 'active', order: 1 },
      { key: 'in_progress', label: 'In Progress', category: 'active', order: 2 },
      { key: 'done', label: 'Done', category: 'done', order: 3 },
    ],
    isDeleted: false,
  });

  // Update admin's club associations
  await User.updateOne({ _id: adminUser._id }, { $set: { clubAssociations: [org._id] } });

  // ─── Org Members ───
  const roleAssignments = ['vice_president', 'events_coordinator', 'member', 'member',
    'member', 'member', 'member', 'member', 'member', 'member',
    'member', 'member', 'member', 'member', 'member'];

  const orgMembers = [];
  for (let i = 0; i < memberUsers.length; i++) {
    const member = await OrgMember.create({
      ...seedMarker,
      org_id: org._id,
      user_id: memberUsers[i]._id,
      role: roleAssignments[i],
      roles: [roleAssignments[i]],
      status: 'active',
      joinedAt: new Date(Date.now() - (180 - i * 10) * 86400000),
    });
    orgMembers.push(member);
    await User.updateOne({ _id: memberUsers[i]._id }, { $push: { clubAssociations: org._id } });
  }
  // Admin as owner member
  await OrgMember.create({
    ...seedMarker,
    org_id: org._id,
    user_id: adminUser._id,
    role: 'owner',
    roles: ['owner'],
    status: 'active',
    joinedAt: new Date('2024-09-01'),
  });
  console.log(`Created org "${org.org_name}" with ${orgMembers.length + 1} members`);

  // ─── Org followers ───
  for (let i = 0; i < 8; i++) {
    await OrgFollower.create({
      ...seedMarker,
      org_id: org._id,
      user_id: memberUsers[i]._id,
    });
  }

  // ─── Org Event Roles (reusable role templates) ───
  const eventRoleSetup = await OrgEventRole.create({
    ...seedMarker,
    orgId: org._id,
    name: 'Stage Manager',
    description: 'Oversees event logistics and manages the venue setup/teardown',
    isActive: true,
    createdBy: adminUser._id,
  });
  const eventRoleAV = await OrgEventRole.create({
    ...seedMarker,
    orgId: org._id,
    name: 'AV Technician',
    description: 'Handles audio/visual equipment and livestream',
    isActive: true,
    createdBy: adminUser._id,
  });
  const eventRoleGreeter = await OrgEventRole.create({
    ...seedMarker,
    orgId: org._id,
    name: 'Registration Desk',
    description: 'Manages check-in and welcomes attendees at the door',
    isActive: true,
    createdBy: adminUser._id,
  });

  // ─── Org Equipment ───
  const projector = await OrgEquipment.create({
    ...seedMarker,
    orgId: org._id,
    id: 'EQ-001',
    name: 'Portable Projector',
    quantity: 2,
    storageLocation: 'Union Room 3602',
    managedByRole: 'events_coordinator',
    createdBy: adminUser._id,
  });
  const speakers = await OrgEquipment.create({
    ...seedMarker,
    orgId: org._id,
    id: 'EQ-002',
    name: 'PA Speaker System',
    quantity: 1,
    storageLocation: 'Union Room 3602',
    managedByRole: 'events_coordinator',
    createdBy: adminUser._id,
  });
  const banners = await OrgEquipment.create({
    ...seedMarker,
    orgId: org._id,
    id: 'EQ-003',
    name: 'Event Banners & Signage Kit',
    quantity: 3,
    storageLocation: 'Union Room 3602',
    managedByRole: 'member',
    createdBy: adminUser._id,
  });

  // ─── Helper: create dates relative to now ───
  const now = new Date();
  const daysFromNow = (d) => new Date(now.getTime() + d * 86400000);
  const daysAgo = (d) => new Date(now.getTime() - d * 86400000);

  // ─── EVENTS ───

  // Event 1: Past - Spring Innovation Showcase (flagship event, lots of data)
  const event1 = await Event.create({
    ...seedMarker,
    name: 'Spring Innovation Showcase 2026',
    description: 'Our flagship spring event featuring student startup pitches, interactive technology demos, and a keynote by Dr. Sarah Mitchell from Google DeepMind on "The Future of AI in Education." Open to all RPI students, faculty, and invited guests from the Capital Region tech community.',
    type: 'showcase',
    hostingId: org._id,
    hostingType: 'Org',
    start_time: daysAgo(14),
    end_time: new Date(daysAgo(14).getTime() + 5 * 3600000),
    location: 'EMPAC Concert Hall',
    classroom_id: empacRoom._id,
    status: 'approved',
    visibility: 'public',
    expectedAttendance: 250,
    going: memberUsers.slice(0, 10).map(u => u._id),
    rsvpEnabled: true,
    rsvpRequired: false,
    checkInEnabled: true,
    checkInToken: 'showcase2026',
    isDeleted: false,
    createdAt: daysAgo(45),
    createdBy: adminUser._id,
    contact: 'innovators@rpi.edu',
    attendees: [],
  });

  // Helper: generate N attendees with realistic registration spread
  function generateAttendees(users, count, eventDate, spreadDays, checkedInPct) {
    const attendees = [];
    for (let i = 0; i < count; i++) {
      const u = users[i % users.length];
      const isCheckedIn = i < Math.floor(count * checkedInPct);
      attendees.push({
        userId: u._id,
        registeredAt: new Date(eventDate.getTime() - (spreadDays - (i / count) * spreadDays) * 86400000),
        guestCount: i % 7 === 0 ? 1 : 0,
        checkedIn: isCheckedIn,
        checkedInAt: isCheckedIn ? new Date(eventDate.getTime() + (i * 2 + 5) * 60000) : null,
      });
    }
    return attendees;
  }

  const event1Attendees = generateAttendees(memberUsers, 178, daysAgo(14), 30, 0.80);
  await Event.updateOne({ _id: event1._id }, { $set: { attendees: event1Attendees, registrationCount: 178 } });

  // Event 2: Past - Tech Talk: Building Scalable Systems
  const event2 = await Event.create({
    ...seedMarker,
    name: 'Tech Talk: Building Scalable Systems',
    description: 'A deep-dive technical talk by Ethan Brooks (RPI \'22, now SRE at Stripe) on designing distributed systems that handle millions of transactions. Includes Q&A and networking reception afterward.',
    type: 'talk',
    hostingId: org._id,
    hostingType: 'Org',
    start_time: daysAgo(28),
    end_time: new Date(daysAgo(28).getTime() + 2 * 3600000),
    location: 'McNeil Room, Rensselaer Union',
    classroom_id: unionRoom._id,
    status: 'approved',
    visibility: 'public',
    expectedAttendance: 80,
    going: memberUsers.slice(0, 6).map(u => u._id),
    rsvpEnabled: true,
    checkInEnabled: true,
    isDeleted: false,
    createdAt: daysAgo(60),
    createdBy: memberUsers[1]._id,
    attendees: generateAttendees(memberUsers, 62, daysAgo(28), 20, 0.87),
    registrationCount: 62,
  });

  // Event 3: Past - Startup Networking Mixer
  const event3 = await Event.create({
    ...seedMarker,
    name: 'Startup Networking Mixer',
    description: 'Casual networking evening connecting student founders with local angel investors, mentors from the RPI Lally School of Management, and alumni entrepreneurs. Light refreshments provided.',
    type: 'social',
    hostingId: org._id,
    hostingType: 'Org',
    start_time: daysAgo(7),
    end_time: new Date(daysAgo(7).getTime() + 3 * 3600000),
    location: 'McNeil Room, Rensselaer Union',
    classroom_id: unionRoom._id,
    status: 'approved',
    visibility: 'public',
    expectedAttendance: 60,
    going: memberUsers.slice(2, 9).map(u => u._id),
    rsvpEnabled: true,
    checkInEnabled: true,
    isDeleted: false,
    createdAt: daysAgo(21),
    createdBy: adminUser._id,
    attendees: generateAttendees(memberUsers, 47, daysAgo(7), 14, 0.91),
    registrationCount: 47,
  });

  // Event 4: Upcoming - HackRPI Kickoff Workshop
  const event4 = await Event.create({
    ...seedMarker,
    name: 'HackRPI Kickoff: Intro to Full-Stack Development',
    description: 'Beginner-friendly workshop to prepare for HackRPI 2026. Learn React, Node.js, and MongoDB basics while building a mini project from scratch. Laptops required, all skill levels welcome.',
    type: 'workshop',
    hostingId: org._id,
    hostingType: 'Org',
    start_time: daysFromNow(5),
    end_time: new Date(daysFromNow(5).getTime() + 3 * 3600000),
    location: 'EMPAC Concert Hall',
    classroom_id: empacRoom._id,
    status: 'approved',
    visibility: 'public',
    expectedAttendance: 120,
    going: memberUsers.slice(0, 5).map(u => u._id),
    rsvpEnabled: true,
    rsvpRequired: true,
    maxAttendees: 120,
    checkInEnabled: false,
    isDeleted: false,
    createdAt: daysAgo(10),
    createdBy: memberUsers[2]._id,
    attendees: generateAttendees(memberUsers, 34, daysFromNow(5), 10, 0),
    registrationCount: 34,
  });

  // Event 5: Upcoming - Annual Gala
  const event5 = await Event.create({
    ...seedMarker,
    name: 'Innovators Hub Annual Gala & Awards',
    description: 'Our end-of-year celebration recognizing outstanding members, successful projects, and community impact. Features dinner, awards ceremony, and a surprise keynote speaker. Semi-formal attire requested.',
    type: 'gala',
    hostingId: org._id,
    hostingType: 'Org',
    start_time: daysFromNow(21),
    end_time: new Date(daysFromNow(21).getTime() + 4 * 3600000),
    location: 'EMPAC Concert Hall',
    classroom_id: empacRoom._id,
    status: 'approved',
    visibility: 'public',
    expectedAttendance: 200,
    going: [],
    rsvpEnabled: true,
    rsvpRequired: true,
    maxAttendees: 200,
    isDeleted: false,
    createdAt: daysAgo(3),
    createdBy: adminUser._id,
    attendees: generateAttendees(memberUsers, 18, daysFromNow(21), 5, 0),
    registrationCount: 18,
  });

  // Event 6: Past - weekly study session (shows variety)
  const event6 = await Event.create({
    ...seedMarker,
    name: 'Weekly Code Review & Study Session',
    description: 'Open study and code review session. Bring your projects for peer feedback, pair programming, or just a productive study environment with fellow innovators.',
    type: 'study',
    hostingId: org._id,
    hostingType: 'Org',
    start_time: daysAgo(3),
    end_time: new Date(daysAgo(3).getTime() + 2 * 3600000),
    location: 'McNeil Room, Rensselaer Union',
    classroom_id: unionRoom._id,
    status: 'approved',
    visibility: 'internal',
    expectedAttendance: 20,
    going: memberUsers.slice(5, 10).map(u => u._id),
    isDeleted: false,
    createdAt: daysAgo(10),
    createdBy: memberUsers[0]._id,
    attendees: generateAttendees(memberUsers, 15, daysAgo(3), 7, 0.87),
    registrationCount: 15,
    isStudySession: true,
  });

  const allEvents = [event1, event2, event3, event4, event5, event6];
  console.log(`Created ${allEvents.length} events`);

  // ─── Event Analytics (with viewHistory for funnel) ───
  function generateViewHistory(eventDate, totalViews, uniqueLoggedIn, anonymousViews, users, daysSpread) {
    const history = [];
    const seenUsers = new Set();
    for (let i = 0; i < totalViews - anonymousViews; i++) {
      const u = users[i % users.length];
      const isUnique = !seenUsers.has(String(u._id));
      seenUsers.add(String(u._id));
      history.push({
        userId: u._id,
        isAnonymous: false,
        anonymousId: null,
        timestamp: new Date(eventDate.getTime() - Math.random() * daysSpread * 86400000),
        userAgent: 'Mozilla/5.0 Chrome/125',
        ipAddress: `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      });
    }
    for (let i = 0; i < anonymousViews; i++) {
      history.push({
        userId: null,
        isAnonymous: true,
        anonymousId: `anon-${i}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date(eventDate.getTime() - Math.random() * daysSpread * 86400000),
        userAgent: 'Mozilla/5.0 Chrome/125',
        ipAddress: `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      });
    }
    return history;
  }

  const analyticsEntries = [
    { eventId: event1._id, views: 2340, uniqueViews: 1180, anonymousViews: 870, uniqueAnonymousViews: 540, registrations: 178, uniqueRegistrations: 178, engagementRate: 45, eventDate: daysAgo(14), daysSpread: 30 },
    { eventId: event2._id, views: 680, uniqueViews: 410, anonymousViews: 195, uniqueAnonymousViews: 138, registrations: 62, uniqueRegistrations: 62, engagementRate: 38, eventDate: daysAgo(28), daysSpread: 20 },
    { eventId: event3._id, views: 520, uniqueViews: 320, anonymousViews: 145, uniqueAnonymousViews: 98, registrations: 47, uniqueRegistrations: 47, engagementRate: 35, eventDate: daysAgo(7), daysSpread: 14 },
    { eventId: event4._id, views: 390, uniqueViews: 268, anonymousViews: 92, uniqueAnonymousViews: 65, registrations: 34, uniqueRegistrations: 34, engagementRate: 31, eventDate: daysFromNow(5), daysSpread: 10 },
    { eventId: event5._id, views: 156, uniqueViews: 118, anonymousViews: 38, uniqueAnonymousViews: 30, registrations: 18, uniqueRegistrations: 18, engagementRate: 28, eventDate: daysFromNow(21), daysSpread: 5 },
    { eventId: event6._id, views: 112, uniqueViews: 74, anonymousViews: 22, uniqueAnonymousViews: 16, registrations: 15, uniqueRegistrations: 15, engagementRate: 22, eventDate: daysAgo(3), daysSpread: 7 },
  ];
  for (const a of analyticsEntries) {
    const viewHistory = generateViewHistory(a.eventDate, a.views, a.uniqueViews, a.anonymousViews, memberUsers, a.daysSpread);
    await EventAnalytics.create({
      ...seedMarker,
      eventId: a.eventId,
      views: a.views,
      uniqueViews: a.uniqueViews,
      anonymousViews: a.anonymousViews,
      uniqueAnonymousViews: a.uniqueAnonymousViews,
      registrations: a.registrations,
      uniqueRegistrations: a.uniqueRegistrations,
      engagementRate: a.engagementRate,
      rsvps: a.registrations,
      uniqueRsvps: a.uniqueRegistrations,
      viewHistory,
      rsvpHistory: [],
    });
  }
  console.log('Created event analytics with viewHistory');

  // ─── Platform Analytics Events (analytics_events collection for funnel) ───
  const AnalyticsEvent = conn.model('AnalyticsEvent', flexSchemaNoTs, 'analytics_events');
  await AnalyticsEvent.deleteMany(seedMarker);

  async function seedPlatformAnalytics(eventDoc, uniqueViewers, formOpens, registrations, checkins) {
    const evId = String(eventDoc._id);
    const eventStart = eventDoc.start_time || daysAgo(14);
    const entries = [];

    // Generate synthetic user ObjectIds so unique counts are accurate
    const syntheticUserIds = [];
    for (let i = 0; i < Math.max(uniqueViewers, formOpens, registrations, checkins); i++) {
      if (i < memberUsers.length) {
        syntheticUserIds.push(memberUsers[i]._id);
      } else {
        syntheticUserIds.push(new mongoose.Types.ObjectId());
      }
    }

    const sources = ['direct', 'explore', 'org_page', 'direct', 'explore'];
    const referrers = ['events-dashboard', 'club-dashboard/RPI-Innovators-Hub', ''];

    // event_view entries (one per unique viewer)
    for (let i = 0; i < uniqueViewers; i++) {
      entries.push({
        ...seedMarker,
        event: 'event_view',
        user_id: syntheticUserIds[i],
        anonymous_id: null,
        ts: new Date(eventStart.getTime() - Math.random() * 20 * 86400000),
        properties: { event_id: evId, source: sources[i % sources.length] },
        context: { referrer: referrers[i % referrers.length] },
      });
    }

    // event_registration_form_open entries (one per unique opener)
    for (let i = 0; i < formOpens; i++) {
      entries.push({
        ...seedMarker,
        event: 'event_registration_form_open',
        user_id: syntheticUserIds[i],
        anonymous_id: null,
        ts: new Date(eventStart.getTime() - Math.random() * 15 * 86400000),
        properties: { event_id: evId },
      });
    }

    // event_registration entries (one per unique registrant)
    for (let i = 0; i < registrations; i++) {
      entries.push({
        ...seedMarker,
        event: 'event_registration',
        user_id: syntheticUserIds[i],
        anonymous_id: null,
        ts: new Date(eventStart.getTime() - Math.random() * 10 * 86400000),
        properties: { event_id: evId },
      });
    }

    // event_checkin entries (one per unique check-in)
    for (let i = 0; i < checkins; i++) {
      entries.push({
        ...seedMarker,
        event: 'event_checkin',
        user_id: syntheticUserIds[i],
        anonymous_id: null,
        ts: new Date(eventStart.getTime() + i * 2 * 60000),
        properties: { event_id: evId },
      });
    }

    if (entries.length > 0) {
      await AnalyticsEvent.insertMany(entries);
    }
  }

  // Showcase: 312 unique viewers → 245 form opens → 178 registrations → 142 check-ins
  await seedPlatformAnalytics(event1, 312, 245, 178, 142);
  // Tech Talk: 156 viewers → 98 form opens → 62 registrations → 54 check-ins
  await seedPlatformAnalytics(event2, 156, 98, 62, 54);
  // Networking Mixer: 128 viewers → 82 form opens → 47 registrations → 43 check-ins
  await seedPlatformAnalytics(event3, 128, 82, 47, 43);
  // HackRPI: 94 viewers → 58 form opens → 34 registrations → 0 check-ins (upcoming)
  await seedPlatformAnalytics(event4, 94, 58, 34, 0);
  // Annual Gala: 52 viewers → 28 form opens → 18 registrations → 0 check-ins (upcoming)
  await seedPlatformAnalytics(event5, 52, 28, 18, 0);
  // Study Session: 38 viewers → 0 form opens → 15 registrations → 13 check-ins
  await seedPlatformAnalytics(event6, 38, 0, 15, 13);

  console.log('Created platform analytics events (funnel data)');

  // ─── Registration Forms & Responses (for showcase event) ───
  const regForm = await FormModel.create({
    ...seedMarker,
    title: 'Spring Innovation Showcase Registration',
    orgId: org._id,
    eventId: event1._id,
    fields: [
      { label: 'Full Name', type: 'text', required: true },
      { label: 'RPI Email', type: 'email', required: true },
      { label: 'Year', type: 'select', required: true, options: ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'] },
      { label: 'Dietary Restrictions', type: 'text', required: false },
      { label: 'What excites you most about innovation?', type: 'textarea', required: false },
    ],
    isActive: true,
  });
  await Event.updateOne({ _id: event1._id }, { $set: { registrationFormId: regForm._id } });

  const yearOptions = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'];
  const excitementAnswers = [
    'Building products that solve real problems',
    'The intersection of AI and creativity',
    'Meeting other students who are passionate about tech',
    'Learning from industry professionals',
    'The energy of hackathons and pitch competitions',
    'Exploring new technologies and frameworks',
    'The potential to create something impactful',
  ];
  const formResponseCount = 178;
  for (let i = 0; i < formResponseCount; i++) {
    const u = memberUsers[i % memberUsers.length];
    await FormResponse.create({
      ...seedMarker,
      form: regForm._id,
      event: event1._id,
      submittedBy: u._id,
      answers: [
        { label: 'Full Name', value: u.name },
        { label: 'RPI Email', value: u.email },
        { label: 'Year', value: yearOptions[i % yearOptions.length] },
        { label: 'Dietary Restrictions', value: i % 4 === 0 ? 'Vegetarian' : '' },
        { label: 'What excites you most about innovation?', value: excitementAnswers[i % excitementAnswers.length] },
      ],
      submittedAt: new Date(daysAgo(14).getTime() - (30 - i) * 86400000),
    });
  }
  console.log(`Created registration form + ${formResponseCount} responses`);

  // ─── Event Agenda (for showcase event) ───
  const showcaseAgenda = await EventAgenda.create({
    ...seedMarker,
    eventId: event1._id,
    orgId: org._id,
    items: [
      { id: 'a1', title: 'Registration & Welcome Coffee', type: 'Setup', startTime: daysAgo(14), endTime: new Date(daysAgo(14).getTime() + 30 * 60000), location: 'Main Lobby', isPublic: true, order: 0 },
      { id: 'a2', title: 'Opening Remarks', description: 'Welcome by Jordan Rivera, President', type: 'Speaker', startTime: new Date(daysAgo(14).getTime() + 30 * 60000), endTime: new Date(daysAgo(14).getTime() + 45 * 60000), location: 'Main Stage', isPublic: true, order: 1 },
      { id: 'a3', title: 'Keynote: The Future of AI in Education', description: 'Dr. Sarah Mitchell, Google DeepMind', type: 'Speaker', startTime: new Date(daysAgo(14).getTime() + 45 * 60000), endTime: new Date(daysAgo(14).getTime() + 105 * 60000), location: 'Main Stage', isPublic: true, order: 2 },
      { id: 'a4', title: 'Coffee Break & Demo Setup', type: 'Break', startTime: new Date(daysAgo(14).getTime() + 105 * 60000), endTime: new Date(daysAgo(14).getTime() + 120 * 60000), isPublic: true, order: 3 },
      { id: 'a5', title: 'Student Startup Pitches (Round 1)', description: '5 teams, 5 minutes each + Q&A', type: 'Activity', startTime: new Date(daysAgo(14).getTime() + 120 * 60000), endTime: new Date(daysAgo(14).getTime() + 180 * 60000), location: 'Main Stage', isPublic: true, order: 4 },
      { id: 'a6', title: 'Interactive Demo Fair', description: 'Hands-on demos from 12 student projects', type: 'Activity', startTime: new Date(daysAgo(14).getTime() + 180 * 60000), endTime: new Date(daysAgo(14).getTime() + 240 * 60000), location: 'Exhibition Hall', isPublic: true, order: 5 },
      { id: 'a7', title: 'Networking Reception & Awards', type: 'Activity', startTime: new Date(daysAgo(14).getTime() + 240 * 60000), endTime: new Date(daysAgo(14).getTime() + 300 * 60000), location: 'Lobby', isPublic: true, order: 6 },
    ],
    publicNotes: 'All attendees welcome. Refreshments provided.',
    internalNotes: 'AV setup must be complete by 8:30am. Catering arrives at 8:00am.',
    isPublished: true,
  });
  console.log('Created event agenda');

  // ─── Event Jobs (roles for showcase event) ───
  const jobStageManager = await EventJob.create({
    ...seedMarker,
    orgRoleId: eventRoleSetup._id,
    eventId: event1._id,
    orgId: org._id,
    name: 'Stage Manager',
    description: 'Coordinate speaker transitions, manage timing, and oversee AV cues',
    requiredCount: 2,
    shiftStart: daysAgo(14),
    shiftEnd: new Date(daysAgo(14).getTime() + 5 * 3600000),
    assignments: [
      { memberId: memberUsers[0]._id, status: 'confirmed', assignedAt: daysAgo(20), confirmedAt: daysAgo(18) },
      { memberId: memberUsers[1]._id, status: 'confirmed', assignedAt: daysAgo(20), confirmedAt: daysAgo(17) },
    ],
  });

  const jobAV = await EventJob.create({
    ...seedMarker,
    orgRoleId: eventRoleAV._id,
    eventId: event1._id,
    orgId: org._id,
    name: 'AV Technician',
    description: 'Set up projectors, microphones, and manage livestream',
    requiredCount: 2,
    shiftStart: new Date(daysAgo(14).getTime() - 1 * 3600000),
    shiftEnd: new Date(daysAgo(14).getTime() + 5 * 3600000),
    assignments: [
      { memberId: memberUsers[6]._id, status: 'confirmed', assignedAt: daysAgo(19), confirmedAt: daysAgo(16) },
    ],
  });

  const jobGreeter = await EventJob.create({
    ...seedMarker,
    orgRoleId: eventRoleGreeter._id,
    eventId: event1._id,
    orgId: org._id,
    name: 'Registration Desk',
    description: 'Welcome attendees, manage check-in process, hand out name badges',
    requiredCount: 3,
    shiftStart: daysAgo(14),
    shiftEnd: new Date(daysAgo(14).getTime() + 2 * 3600000),
    assignments: [
      { memberId: memberUsers[3]._id, status: 'confirmed', assignedAt: daysAgo(18), confirmedAt: daysAgo(15) },
      { memberId: memberUsers[4]._id, status: 'confirmed', assignedAt: daysAgo(18), confirmedAt: daysAgo(14) },
      { memberId: memberUsers[7]._id, status: 'assigned', assignedAt: daysAgo(16) },
    ],
  });
  console.log('Created event jobs (roles + assignments)');

  // ─── Volunteer Signups ───
  const volunteerData = [
    { memberId: memberUsers[0]._id, roleId: jobStageManager._id, checkedIn: true, checkedOut: true },
    { memberId: memberUsers[1]._id, roleId: jobStageManager._id, checkedIn: true, checkedOut: true },
    { memberId: memberUsers[6]._id, roleId: jobAV._id, checkedIn: true, checkedOut: true },
    { memberId: memberUsers[3]._id, roleId: jobGreeter._id, checkedIn: true, checkedOut: false },
    { memberId: memberUsers[4]._id, roleId: jobGreeter._id, checkedIn: true, checkedOut: false },
  ];
  for (const v of volunteerData) {
    await VolunteerSignup.create({
      ...seedMarker,
      eventId: event1._id,
      memberId: v.memberId,
      roleId: v.roleId,
      shiftStart: daysAgo(14),
      shiftEnd: new Date(daysAgo(14).getTime() + 5 * 3600000),
      status: 'approved',
      checkedIn: v.checkedIn,
      checkedInAt: v.checkedIn ? daysAgo(14) : null,
      checkedOut: v.checkedOut,
      checkedOutAt: v.checkedOut ? new Date(daysAgo(14).getTime() + 5 * 3600000) : null,
    });
  }
  console.log('Created volunteer signups');

  // ─── Event Equipment ───
  await EventEquipment.create({
    ...seedMarker,
    eventId: event1._id,
    orgId: org._id,
    items: [
      { equipmentId: 'EQ-001', name: 'Portable Projector', quantity: 2 },
      { equipmentId: 'EQ-002', name: 'PA Speaker System', quantity: 1 },
      { equipmentId: 'EQ-003', name: 'Event Banners & Signage Kit', quantity: 2 },
    ],
  });
  await EventEquipment.create({
    ...seedMarker,
    eventId: event4._id,
    orgId: org._id,
    items: [
      { equipmentId: 'EQ-001', name: 'Portable Projector', quantity: 1 },
    ],
  });
  console.log('Created event equipment allocations');

  // ─── Summary ───
  console.log('\n════════════════════════════════════════');
  console.log('  SEED COMPLETE');
  console.log('════════════════════════════════════════');
  console.log(`  Admin login: demo@meridian.test / password123`);
  console.log(`  Org slug:    ${org.org_name}`);
  console.log(`  Org ID:      ${org._id}`);
  console.log(`  Events:      ${allEvents.length}`);
  console.log(`  Members:     ${memberUsers.length + 1}`);
  console.log(`  Dashboard:   http://localhost:3000/club-dashboard/${org.org_name}`);
  console.log('════════════════════════════════════════\n');

  await conn.close();
  await platformConn.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
