const express = require('express');
const ratingSchema = require('../schemas/rating.js');
const userSchema = require('../schemas/user.js');
const classroomSchema = require('../schemas/classroom.js');
const scheduleSchema = require('../schemas/schedule.js');

const historySchema = require('../schemas/studyHistory.js');
const { verifyToken, verifyTokenOptional } = require('../middlewares/verifyToken');
const { sortByAvailability } = require('../helpers.js');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const { clean } = require('../services/profanityFilterService');
const getModels = require('../services/getModelService');
const { classroomBuildingName } = require('../utilities/classroomBuildingName');


const router = express.Router();


// Lightweight space availability summary for tenant-aware UI decisions
router.get('/spaces-summary', async (req, res) => {
    try {
        const { Classroom, Building } = getModels(req, 'Classroom', 'Building');
        const [roomsCount, buildingsCount] = await Promise.all([
            Classroom.countDocuments({}),
            Building.countDocuments({}),
        ]);

        res.json({
            success: true,
            data: {
                roomsCount,
                buildingsCount,
                hasRoomsOrBuildings: roomsCount > 0 || buildingsCount > 0,
            },
        });
    } catch (error) {
        console.error('GET /spaces-summary failed', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load spaces summary',
            error: error.message,
        });
    }
});

// Route to get featured content (rooms and events) for explore screen
router.get('/featured-all', async (req, res) => {
    try {
        const { Classroom, Event } = getModels(req, 'Classroom', 'Event');
        
        // Get 5 random rooms
        const rooms = await Classroom.aggregate([
            { $sample: { size: 5 } },
            {
                $lookup: {
                    from: 'buildings',
                    localField: 'building',
                    foreignField: '_id',
                    as: '__buildingDoc',
                },
            },
            {
                $addFields: {
                    building: {
                        $ifNull: [{ $arrayElemAt: ['$__buildingDoc.name', 0] }, ''],
                    },
                },
            },
            { $project: { __buildingDoc: 0 } },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    building: 1,
                    floor: 1,
                    capacity: 1,
                    image: 1,
                    attributes: 1,
                    average_rating: 1,
                    number_of_ratings: 1,
                },
            },
        ]);

        // Get 5 random events
        //populate hostingId, org or user
        const events = await Event.aggregate([
            { $match: { start_time: { $gte: new Date(), $lte: new Date(Date.now() + 2 * 7 * 24 * 60 * 60 * 1000) } }, },
            { $sample: { size: 5 } },
            // Lookup user host
            {
                $lookup: {
                    from: "users",
                    localField: "hostingId",
                    foreignField: "_id",
                    as: "userHost"
                }
            },
            // Lookup org host
            {
                $lookup: {
                    from: "orgs",
                    localField: "hostingId",
                    foreignField: "_id",
                    as: "orgHost"
                }
            },
            // Overwrite hostingId with the correct document based on hostingType
            {
                $addFields: {
                    hostingId: {
                        $cond: {
                            if: { $eq: ["$hostingType", "User"] },
                            then: { $arrayElemAt: ["$userHost", 0] },
                            else: { $arrayElemAt: ["$orgHost", 0] }
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    description: 1,
                    start_time: 1,
                    end_time: 1,
                    location: 1,
                    image: 1,
                    type: 1,
                    hostingId: {
                        name: 1,
                        org_name: 1,
                        image: 1,
                        org_profile_image: 1
                    },
                    hostingType: 1,
                    rsvp_count: 1,
                    max_capacity: 1
                }
            }
        ]);

        console.log(`GET: /featured-all - Returning ${rooms.length} rooms and ${events.length} events`);
        
        res.json({
            success: true,
            message: "Featured content retrieved",
            data: {
                rooms: rooms,
                events: events
            }
        });
    } catch (error) {
        console.error('Error retrieving featured content:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error retrieving featured content', 
            error: error.message 
        });
    }
});

// Helper to fetch and return an event doc for suggested action
async function fetchEventForSuggestion(Event, eventId, now) {
    const eventDoc = await Event.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(String(eventId)),
                start_time: { $gte: now },
                $or: [{ isDeleted: { $ne: true } }, { isDeleted: { $exists: false } }]
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: 'hostingId',
                foreignField: '_id',
                as: 'userHost'
            }
        },
        {
            $lookup: {
                from: 'orgs',
                localField: 'hostingId',
                foreignField: '_id',
                as: 'orgHost'
            }
        },
        {
            $addFields: {
                hostingId: {
                    $cond: {
                        if: { $eq: ['$hostingType', 'User'] },
                        then: { $arrayElemAt: ['$userHost', 0] },
                        else: { $arrayElemAt: ['$orgHost', 0] }
                    }
                }
            }
        },
        {
            $project: {
                _id: 1,
                name: 1,
                description: 1,
                start_time: 1,
                end_time: 1,
                location: 1,
                image: 1,
                type: 1,
                hostingId: { _id: 1, name: 1, org_name: 1, image: 1, org_profile_image: 1 },
                hostingType: 1,
                rsvp_count: 1,
                max_capacity: 1
            }
        }
    ]);
    return eventDoc && eventDoc.length > 0 ? eventDoc[0] : null;
}

// Suggested action: one item based on user's past analytics, or "hot right now" fallback
router.get('/suggested-action', verifyTokenOptional, async (req, res) => {
    const log = (msg, data) => console.log(`[suggested-action] ${msg}`, data !== undefined ? data : '');
    try {
        const { AnalyticsEvent, Event, Org } = getModels(req, 'AnalyticsEvent', 'Event', 'Org');
        const userId = req.user ? req.user.userId : null;
        const userIdObj = userId ? new mongoose.Types.ObjectId(userId) : null;
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        log('Evaluating suggestion', { userId: userId || 'guest', now: now.toISOString() });

        if (userIdObj) {
            const registeredEventIds = await AnalyticsEvent.distinct('properties.event_id', {
                user_id: userIdObj,
                event: 'event_registration',
                'properties.event_id': { $exists: true, $ne: null }
            });
            const registeredSet = new Set(registeredEventIds.map((id) => String(id)));

            // 1. Event management / workspace – org power users managing events (organizers/admins)
            log('Step 1: Checking event workspace usage (events user managed in last 30d)');
            const workspaceEvents = await AnalyticsEvent.aggregate([
                {
                    $match: {
                        user_id: userIdObj,
                        ts: { $gte: thirtyDaysAgo },
                        $or: [
                            { event: { $in: ['event_workspace_view', 'event_workspace_tab_view'] }, 'properties.event_id': { $exists: true, $ne: null } },
                            { event: 'screen_view', 'context.screen': 'Event Workspace', 'properties.event_id': { $exists: true, $ne: null } }
                        ]
                    }
                },
                { $group: { _id: '$properties.event_id', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]);
            log('Workspace events (by visit count)', workspaceEvents.map(r => ({ eventId: r._id, count: r.count })));
            for (const row of workspaceEvents) {
                const eventId = row._id;
                const item = await fetchEventForSuggestion(Event, eventId, now);
                if (item) {
                    const orgId = item.hostingType === 'Org' && item.hostingId?._id ? item.hostingId._id.toString() : null;
                    const orgName = item.hostingType === 'Org' && item.hostingId?.org_name ? item.hostingId.org_name : null;
                    log('→ SUGGEST: Event workspace (priority 1)', { eventId: item._id, name: item.name, orgId, orgName });
                    return res.json({
                        success: true,
                        data: {
                            type: 'event',
                            id: item._id.toString(),
                            item,
                            isHotRightNow: false,
                            destination: 'workspace',
                            orgId,
                            orgName,
                            suggestionReason: 'See how your event is doing'
                        }
                    });
                }
            }
            log('Step 1: No match (no workspace events found)');

            // 2. Org management – Events Management, Club Dashboard, Org Page (manage/browse orgs)
            log('Step 2: Checking org management screens (Events Management, Club Dashboard, Org Page)');
            const orgManagementScreens = ['Events Management', 'Club Dashboard', 'Org Page'];
            const orgFromScreens = await AnalyticsEvent.aggregate([
                {
                    $match: {
                        user_id: userIdObj,
                        ts: { $gte: thirtyDaysAgo },
                        event: 'screen_view',
                        'context.screen': { $in: orgManagementScreens },
                        'properties.org_id': { $exists: true, $ne: null }
                    }
                },
                { $group: { _id: '$properties.org_id', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ]);
            log('Org management screens (by visit count)', orgFromScreens.map(r => ({ orgId: r._id, count: r.count })));
            for (const row of orgFromScreens) {
                const orgId = row._id;
                const orgIdStr = orgId != null ? String(orgId) : '';
                if (!/^[a-fA-F0-9]{24}$/.test(orgIdStr)) {
                    log(`  Skipping org ${orgId}: not a valid ObjectId`);
                    continue;
                }
                const orgDoc = await Org.findById(orgIdStr).select('_id org_name org_profile_image').lean();
                if (orgDoc) {
                    log('→ SUGGEST: Org dashboard (priority 2)', { orgId: orgDoc._id, orgName: orgDoc.org_name });
                    return res.json({
                        success: true,
                        data: {
                            type: 'org',
                            id: orgDoc._id.toString(),
                            item: orgDoc,
                            isHotRightNow: false,
                            destination: 'dashboard',
                            suggestionReason: 'Pick up where you left off'
                        }
                    });
                }
            }
            log('Step 2: No match (no org management screens found)');

            // 3. Event view – viewed events not yet registered
            log('Step 3: Checking event views (events user viewed in last 30d, excluding registered)');
            const viewedEvents = await AnalyticsEvent.aggregate([
                {
                    $match: {
                        user_id: userIdObj,
                        ts: { $gte: thirtyDaysAgo },
                        event: 'event_view',
                        'properties.event_id': { $exists: true, $ne: null }
                    }
                },
                { $group: { _id: '$properties.event_id', views: { $sum: 1 } } },
                { $sort: { views: -1 } },
                { $limit: 20 }
            ]);
            log('Viewed events (by view count)', viewedEvents.map(r => ({ eventId: r._id, views: r.views })));
            for (const row of viewedEvents) {
                const eventId = row._id;
                if (registeredSet.has(String(eventId))) {
                    log(`  Skipping event ${eventId}: user already registered`);
                    continue;
                }
                const item = await fetchEventForSuggestion(Event, eventId, now);
                if (item) {
                    log('→ SUGGEST: Event view (priority 3)', { eventId: item._id, name: item.name });
                    return res.json({
                        success: true,
                        data: {
                            type: 'event',
                            id: item._id.toString(),
                            item,
                            isHotRightNow: false,
                            suggestionReason: 'You viewed this event'
                        }
                    });
                }
            }
            log('Step 3: No match (no unregistered viewed events found)');

            // 4. Org engagement – org_join, org_follow
            log('Step 4: Checking org engagement (org_join, org_follow in last 30d)');
            const orgEngagement = await AnalyticsEvent.aggregate([
                {
                    $match: {
                        user_id: userIdObj,
                        ts: { $gte: thirtyDaysAgo },
                        event: { $in: ['org_join', 'org_follow'] },
                        'properties.org_id': { $exists: true, $ne: null }
                    }
                },
                { $group: { _id: '$properties.org_id', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ]);
            log('Org engagement events', orgEngagement.map(r => ({ orgId: r._id, count: r.count })));
            for (const row of orgEngagement) {
                const orgId = row._id;
                const orgIdStr = orgId != null ? String(orgId) : '';
                if (!/^[a-fA-F0-9]{24}$/.test(orgIdStr)) {
                    log(`  Skipping org ${orgId}: not a valid ObjectId`);
                    continue;
                }
                const orgDoc = await Org.findById(orgIdStr).select('_id org_name org_profile_image').lean();
                if (orgDoc) {
                    log('→ SUGGEST: Org engagement (priority 4)', { orgId: orgDoc._id, orgName: orgDoc.org_name });
                    return res.json({
                        success: true,
                        data: {
                            type: 'org',
                            id: orgDoc._id.toString(),
                            item: orgDoc,
                            isHotRightNow: false,
                            suggestionReason: 'Check out your organization'
                        }
                    });
                }
            }
            log('Step 4: No match (no org engagement found)');
        } else {
            log('User not logged in: skipping personalized steps 1–4');
        }

        // 5. Hot right now fallback: 7-day views weighted by expected attendance (rsvp_count + max_capacity)
        log('Step 5: Hot right now fallback (7d views × attendance weight, max score wins)');
        const hotWithEvents = await Event.aggregate([
            {
                $match: {
                    start_time: { $gte: now },
                    $or: [{ isDeleted: { $ne: true } }, { isDeleted: { $exists: false } }]
                }
            },
            {
                $lookup: {
                    from: 'analytics_events',
                    let: { eventId: { $toString: '$_id' } },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: [{ $toString: '$properties.event_id' }, '$$eventId'] },
                                ts: { $gte: sevenDaysAgo },
                                event: 'event_view'
                            }
                        },
                        { $group: { _id: null, views: { $sum: 1 } } }
                    ],
                    as: 'viewStats'
                }
            },
            {
                $addFields: {
                    views: {
                        $let: {
                            vars: { first: { $arrayElemAt: ['$viewStats', 0] } },
                            in: { $ifNull: ['$$first.views', 0] }
                        }
                    },
                    rsvp: { $ifNull: ['$rsvp_count', 0] },
                    capacity: { $ifNull: ['$max_capacity', 0] }
                }
            },
            {
                $addFields: {
                    attendanceWeight: {
                        $add: [
                            1,
                            { $divide: [{ $add: ['$rsvp', '$capacity'] }, 50] }
                        ]
                    }
                }
            },
            {
                $addFields: {
                    hotScore: { $multiply: ['$views', '$attendanceWeight'] }
                }
            },
            { $sort: { hotScore: -1, rsvp_count: -1 } },
            { $limit: 1 },
            {
                $lookup: {
                    from: 'users',
                    localField: 'hostingId',
                    foreignField: '_id',
                    as: 'userHost'
                }
            },
            {
                $lookup: {
                    from: 'orgs',
                    localField: 'hostingId',
                    foreignField: '_id',
                    as: 'orgHost'
                }
            },
            {
                $addFields: {
                    hostingId: {
                        $cond: {
                            if: { $eq: ['$hostingType', 'User'] },
                            then: { $arrayElemAt: ['$userHost', 0] },
                            else: { $arrayElemAt: ['$orgHost', 0] }
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    description: 1,
                    start_time: 1,
                    end_time: 1,
                    location: 1,
                    image: 1,
                    type: 1,
                    hostingId: { _id: 1, name: 1, org_name: 1, image: 1, org_profile_image: 1 },
                    hostingType: 1,
                    rsvp_count: 1,
                    max_capacity: 1
                }
            }
        ]);

        if (hotWithEvents && hotWithEvents.length > 0) {
            const h = hotWithEvents[0];
            log('→ SUGGEST: Hot right now (priority 5)', { eventId: h._id, name: h.name, rsvp_count: h.rsvp_count, max_capacity: h.max_capacity });
            return res.json({
                success: true,
                data: {
                    type: 'event',
                    id: hotWithEvents[0]._id.toString(),
                    item: hotWithEvents[0],
                    isHotRightNow: true,
                    suggestionReason: 'Hot right now'
                }
            });
        }
        log('Step 5: No match (no upcoming events with view data)');

        // 6. Fallback: Event by rsvp_count
        log('Step 6: Fallback by rsvp_count (highest RSVPs)');
        const topByRsvp = await Event.aggregate([
            {
                $match: {
                    start_time: { $gte: now },
                    $or: [{ isDeleted: { $ne: true } }, { isDeleted: { $exists: false } }]
                }
            },
            { $sort: { rsvp_count: -1 } },
            { $limit: 1 },
            {
                $lookup: {
                    from: 'users',
                    localField: 'hostingId',
                    foreignField: '_id',
                    as: 'userHost'
                }
            },
            {
                $lookup: {
                    from: 'orgs',
                    localField: 'hostingId',
                    foreignField: '_id',
                    as: 'orgHost'
                }
            },
            {
                $addFields: {
                    hostingId: {
                        $cond: {
                            if: { $eq: ['$hostingType', 'User'] },
                            then: { $arrayElemAt: ['$userHost', 0] },
                            else: { $arrayElemAt: ['$orgHost', 0] }
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    description: 1,
                    start_time: 1,
                    end_time: 1,
                    location: 1,
                    image: 1,
                    type: 1,
                    hostingId: { _id: 1, name: 1, org_name: 1, image: 1, org_profile_image: 1 },
                    hostingType: 1,
                    rsvp_count: 1,
                    max_capacity: 1
                }
            }
        ]);
        if (topByRsvp && topByRsvp.length > 0) {
            log('→ SUGGEST: Top by RSVP (priority 6)', { eventId: topByRsvp[0]._id, name: topByRsvp[0].name, rsvp_count: topByRsvp[0].rsvp_count });
            return res.json({
                success: true,
                data: {
                    type: 'event',
                    id: topByRsvp[0]._id.toString(),
                    item: topByRsvp[0],
                    isHotRightNow: true,
                    suggestionReason: 'Popular right now'
                }
            });
        }
        log('Step 6: No match');

        log('→ No suggestion (no eligible events/orgs found)');
        return res.json({ success: true, data: null });
    } catch (error) {
        console.error('GET /suggested-action failed:', error);
        return res.status(500).json({ success: false, message: 'Error getting suggested action', error: error.message });
    }
});

// Route to get a specific classroom by name
router.get('/getroom/:id', async (req, res) => {
    const { Classroom, Schedule } = getModels(req, 'Classroom', 'Schedule');
    // const Classroom = req.db.model('Classroom', classroomSchema, "classrooms1");
    // const Schedule = req.db.model('Schedule', scheduleSchema, "schedules");

    try {
        const roomId = req.params.id;
        
        // Handle special case where "none" is passed as a room name
        if(roomId === "none"){
            // Return an empty Classroom object
            res.json({ success: true, message: "Empty room object returned",room: {name:null},  data: new Schedule() });
                console.log(`GET: /getroom/none`);
            return;
        }

        // Find the classroom and schedule
        const room = await Classroom.findOne({ _id: roomId }).populate('building', 'name');
        const schedule = await Schedule.findOne({ classroom_id: roomId });
        console.log(`GET: /getroom/${roomId}`);
        if (room) {
            // Return room with schedule (or empty schedule if none exists)
            res.json({ success: true, message: "Room found", room: room, data: schedule || new Schedule() });
        } else {
            res.status(404).json({ success: false, message: 'Room not found' });
        }
    } catch (error) {
        // Handle any errors that occur during the process
        res.status(500).json({ success: false, message: 'Error retrieving room', error: error.message });
    }
});

// Route to get all classroom names
router.get('/getrooms', async (req, res) => {
    const { Classroom } = getModels(req, 'Classroom');

    try {
        // Fetch all classrooms and only select their names
        const allRooms = await Classroom.find({}).select('name _id');
        const roomDict = allRooms.reduce((acc, room) => {
            acc[room.name] = room._id.toString(); // Convert ObjectId to string if necessary
            return acc;
        }, {});

        // Return the sorted list of classroom names
        res.json({ success: true, message: "All room names fetched", data: roomDict });
    } catch (error) {
        // Handle any errors that occur during the fetch
        res.status(500).json({ success: false, message: 'Error fetching room names', error: error.message });
    }
});

// Route to get top rated rooms (optimized for initial load)
router.get('/top-rated-rooms', async (req, res) => {
    const { Classroom, Schedule } = getModels(req, 'Classroom', 'Schedule');
    const { limit = 10 } = req.query;

    try {
        // Fetch exactly the number of top rated rooms needed, sorted by rating
        const topRooms = await Classroom.find({
            average_rating: { $exists: true, $ne: null },
            number_of_ratings: { $gt: 0 }
        })
        .sort({ 
            average_rating: -1,  // Highest rating first
            number_of_ratings: -1 // More ratings as tiebreaker
        })
        .limit(parseInt(limit))
        .select('_id name image building floor capacity attributes average_rating number_of_ratings')
        .populate('building', 'name')
        .lean();

        // Get room IDs to fetch schedules
        const roomIds = topRooms.map(room => room._id);

        // Batch fetch schedules for these rooms using getbatch-new logic
        const schedules = await Schedule.find({ 
            classroom_id: { $in: roomIds } 
        })
        .populate('classroom_id')
        .lean();

        // Combine rooms with their schedules
        const roomsWithSchedules = topRooms.map(room => {
            const schedule = schedules.find(s => 
                s.classroom_id && s.classroom_id._id.toString() === room._id.toString()
            );
            return {
                id: room._id.toString(),
                name: room.name || 'Unknown Room',
                image: room.image || null,
                building: classroomBuildingName(room),
                floor: room.floor || '',
                capacity: room.capacity || 0,
                attributes: room.attributes || [],
                average_rating: room.average_rating || 0,
                number_of_ratings: room.number_of_ratings || 0,
                schedule: schedule ? schedule.weekly_schedule : null
            };
        });

        console.log(`GET: /top-rated-rooms - Returning ${roomsWithSchedules.length} top rated rooms`);
        
        res.json({ 
            success: true, 
            message: "Top rated rooms fetched", 
            data: roomsWithSchedules
        });
    } catch (error) {
        console.error('Error fetching top rated rooms:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching top rated rooms', 
            error: error.message 
        });
    }
});

//route to calculate the number of classes in total
router.get('/total-classes', async (req, res) => {
    const { Schedule } = getModels(req, 'Schedule');
    try{
        const schedules = await Schedule.find({});
        const uniqueClassNames = new Set();
        
        schedules.forEach(schedule => {
            Object.keys(schedule.weekly_schedule).forEach(day => {
                schedule.weekly_schedule[day].forEach(classEntry => {
                    if (classEntry.class_name) {
                        uniqueClassNames.add(classEntry.class_name);
                    }
                });
            });
        });
        
        const totalUniqueClasses = uniqueClassNames.size;
        res.json({ success: true, message: "Total unique classes fetched", data: totalUniqueClasses });
    } catch(error){
        res.status(500).json({ success: false, message: "Error fetching total classes", error: error.message });
    }
});


// Route to get all currently free rooms with pagination support
router.get('/free-rooms', async (req, res) => {
    const { Schedule, Classroom } = getModels(req, 'Schedule', 'Classroom');
    
    try {
        const currentTime = new Date();
        const days = ['X', 'M', 'T', 'W', 'R', 'F', 'X']; // Sunday=0, Monday=1, etc.
        const day = days[currentTime.getDay()];
        const hour = currentTime.getHours();
        const minute = currentTime.getMinutes();
        const time = hour * 60 + minute; // Convert to minutes since midnight
        
        let query;
        console.log(day);
        
        // If it's weekend (Saturday or Sunday), return all rooms
        if (day === 'X') {
            query = {};
        } else {
            // Find rooms that don't have a class scheduled right now
            query = {
                [`weekly_schedule.${day}`]: {
                    $not: {
                        $elemMatch: { 
                            start_time: { $lt: time }, 
                            end_time: { $gt: time } 
                        }
                    }
                }
            };
        }

        // Get all free room IDs
        const freeSchedules = await Schedule.find(query);
        const freeRoomIds = freeSchedules.map(schedule => schedule.classroom_id);
        
        console.log(`GET: /free-rooms - Found ${freeRoomIds.length} free rooms at ${hour}:${minute.toString().padStart(2, '0')} on ${day}`);
        
        // Return the room IDs for pagination
        res.json({ 
            success: true, 
            message: "Free rooms found", 
            data: freeRoomIds,
            total: freeRoomIds.length,
            timestamp: currentTime.toISOString()
        });
    } catch (error) {
        console.error('Error finding free rooms:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error finding free rooms', 
            error: error.message 
        });
    }
});


// Route to find classrooms available during given free periods
router.post('/free', async (req, res) => {
    const freePeriods = req.body.query; // Assuming the input object is in the request body
    
    // Helper function to create MongoDB query conditions for given free periods
    const createTimePeriodQuery = (queryObject) => {
        let conditions = [];
        Object.entries(queryObject).forEach(([day, periods]) => {
            if(periods.length > 0){
                periods.forEach(period => {
                    const condition = {
                        [`weekly_schedule.${day}`]: {
                            "$not": {
                                "$elemMatch": {
                                    "start_time": { "$lt": period.end_time },
                                    "end_time": { "$gt": period.start_time }
                                }
                            }
                        }
                    };
                    conditions.push(condition);
                });
            }
        });
        return conditions;
    };

    const { Schedule, Classroom } = getModels(req, 'Schedule', 'Classroom');

    try {

        const queryConditions = createTimePeriodQuery(freePeriods);
        const mongoQuery = { "$and": queryConditions };

        // Query the database with constructed conditions
        const rooms = await Schedule.find(mongoQuery);
        const roomIds = rooms.map(room => room.classroom_id);

        // Fetch the names of the rooms that are free
        const names = await Classroom.find({ _id: { "$in": roomIds } }).select('name -_id');
        const roomNames = names.map(room => room.name);
        console.log(`POST: /free`, freePeriods);
        // Return the names of rooms that are free during the specified periods
        res.json({ success: true, message: "Rooms available during the specified periods", data: roomNames });
    } catch (error) {
        // Handle any errors during database query
        res.status(500).json({ success: false, message: 'Error finding free rooms', error: error.message });
    }
});

router.post('/getbatch', async (req, res) => {
    const queries = req.body.queries;
    const exhaustive = req.body.exhaustive; // Option to retrieve just schedule data or both schedule and room data

    console.log(`POST: /getbatch`, JSON.stringify(req.body.queries));

    const { Schedule } = getModels(req, 'Schedule');

    try {
        
        // Map the queries to their indices to preserve order later
        const indexedQueries = queries.map((query, index) => ({ query, index }));

        // Filter out 'none' queries and convert IDs to ObjectId
        const validQueries = indexedQueries.filter(item => item.query !== "none");
        const queryIds = validQueries.map(item => new mongoose.Types.ObjectId(item.query));

        // Build the aggregation pipeline
        const aggregatePipeline = [
            { $match: { classroom_id: { $in: queryIds } } }
        ];

        if (exhaustive) {
            aggregatePipeline.push({
                $lookup: {
                    from: 'classrooms1',
                    localField: 'classroom_id',
                    foreignField: '_id',
                    as: 'room'
                }
            });
            aggregatePipeline.push({ $unwind: { path: '$room', preserveNullAndEmptyArrays: true } });
        }

        // Execute the aggregation pipeline
        const aggregatedData = await Schedule.aggregate(aggregatePipeline);

        // Create a mapping from classroom_id to data for quick access
        const dataMap = {};
        aggregatedData.forEach(item => {
            dataMap[item.classroom_id.toString()] = item;
        });

        // Build the final results array
        const results = indexedQueries.map(({ query, index }) => {
            if (query === "none") {
                return { index, result: { data: new Schedule() } };
            }

            const data = dataMap[query];
            if (!data) {
                return null; // Or handle not found cases as needed
            }

            const result = { data };
            if (exhaustive) {
                result.room = data.room || "not found";
            }
            return { index, result };
        }).filter(item => item !== null);

        // Sort the results to maintain the original order
        results.sort((a, b) => a.index - b.index);

        // Extract the result objects
        const finalResults = results.map(item => item.result);

        // Send the response
        res.json({ success: true, message: "Rooms found", data: finalResults });
    } catch (error) {
        // Handle any errors
        return res.status(500).json({ success: false, message: 'Error retrieving data', error: error.message });
    }
});

router.post('/getbatch-new', async (req, res) => {
    const queries = req.body.queries;
    const exhaustive = req.body.exhaustive;

    console.log(`POST: /getbatch`, JSON.stringify(req.body.queries));

    const { Schedule } = getModels(req, 'Schedule');

    try {

        // Map queries to indices to preserve order
        const indexedQueries = queries.map((query, index) => ({ query, index }));

        // Filter out 'none' queries and convert IDs to ObjectId
        const validQueries = indexedQueries.filter(item => item.query !== "none");
        const queryIds = validQueries.map(item => new mongoose.Types.ObjectId(item.query));

        // Fetch schedules and populate the referenced classrooms
        let schedules = await Schedule.find({ classroom_id: { $in: queryIds } })
            .populate(
                exhaustive
                    ? { path: 'classroom_id', model: 'Classroom', populate: { path: 'building', select: 'name' } }
                    : ''
            )
            .lean();

        // Create a mapping from classroom_id to schedule data
        const dataMap = {};
        schedules.forEach(item => {
            dataMap[item.classroom_id._id.toString()] = item;
        });

        // Build the final results array
        const results = indexedQueries.map(({ query, index }) => {
            if (query === "none") {
                return { index, result: { data: new Schedule() } };
            }

            const data = dataMap[query];
            if (!data) {
                return null;
            }

            const result = { data };
            if (exhaustive) {
                result.room = data.classroom_id ? data.classroom_id : "not found";
            }
            return { index, result };
        }).filter(item => item !== null);

        // Sort the results to maintain original order
        results.sort((a, b) => a.index - b.index);

        // Extract the result objects
        const finalResults = results.map(item => item.result);

        // Send the response
        res.json({ success: true, message: "Rooms found", data: finalResults });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error retrieving data', error: error.message });
    }
});



router.get('/get-recommendation', verifyTokenOptional, async (req, res) => {
    const userId = req.user ? req.user.userId : null;
    // const { User, Schedule, Classroom } = getModels(req, 'User', 'Schedule', 'Classroom');
    const User = req.db.model('User', userSchema, "users");
    const Schedule = req.db.model('Schedule', scheduleSchema, "schedules");
    const Classroom = req.db.model('Classroom', classroomSchema, "classrooms1");

    try {
        let user;
        let randomClassroom;
        const currentTime = new Date();
        const days = ['X', 'M', 'T', 'W', 'R', 'F', 'X']; // You might need to handle weekends more explicitly
        const day = days[currentTime.getDay()];
        const hour = currentTime.getHours();
        const minute = currentTime.getMinutes();
        const time = hour * 60 + minute;
        console.log(`day: ${day}`);
        let query;
        if (userId) {
            console.log(`userId: ${userId}`);
            user = await User.findOne({ _id: userId });
            const savedClassrooms = user.saved.map(id => new mongoose.Types.ObjectId(id)); // Ensure ObjectId for classroom IDs
            // const savedClassrooms = user.saved; 
            console.log(`savedClassrooms: ${savedClassrooms}`);
            if (day === 'X') {
                query = {
                    classroom_id: { $in: savedClassrooms }
                };
            } else {
                query = {
                    [`weekly_schedule.${day}`]: {
                        $not:{
                            $elemMatch: { start_time: { $lt: time }, end_time: { $gt: time } }
                        }                    
                    },
                    classroom_id: { $in: savedClassrooms }
                };
            }

            randomClassroom = await Schedule.aggregate([
                { $match: query },
                { $sample: { size: 1 } }
            ]);

            if (randomClassroom && randomClassroom.length > 0) {
                randomClassroom = randomClassroom[0];
                randomClassroom = await Classroom.findOne({ _id: randomClassroom.classroom_id }).populate(
                    'building',
                    'name'
                );
                console.log(`GET: /get-recommendation/${userId}`);
                return res.status(200).json({ success: true, message: 'Recommendation found', data: randomClassroom });
            }
        }

        // If no user or no saved classrooms, return a random classroom that is free
        if (day === 'X') {
            query = {};  // Weekend fallback
        } else {
            query = {
                [`weekly_schedule.${day}`]: {
                    $not:{
                        $elemMatch: { start_time: { $lt: time }, end_time: { $gt: time } }
                    }
                }
            };
        }
        randomClassroom = await Schedule.aggregate([
            { $match: query },
            { $sample: { size: 1 } }
        ]);

        if (randomClassroom && randomClassroom.length > 0) {
            randomClassroom = randomClassroom[0];
            randomClassroom = await Classroom.findOne({ _id: randomClassroom.classroom_id }).populate(
                'building',
                'name'
            );
            console.log(`GET: /get-recommendation`);
            return res.status(200).json({ success: true, message: 'Recommendation found', data: randomClassroom });
        }

        console.log(`GET: /get-recommendation`);
        return res.status(404).json({ success: false, message: 'No recommendations found' });
    } catch (error) {
        console.log(`GET: /get-recommendation failed`, error);
        return res.status(500).json({ success: false, message: 'Error finding user', error: error.message });
    }
});

router.get("/get-history", verifyToken, async (req,res) => {
    const { History } = getModels(req, 'History');
    const userId = req.user.userId;
    try{
        //takes in user id, returns all study history objects associated with user
        const getHistory = await History.find({ user_id : userId });  
   
       if(getHistory){
        console.log(`GET: /get-history`);
        return res.status(200).json({success: true, message: 'History grabbed', data: getHistory});
       } else {
        return res.status(404).json({ success: false, message: 'Could not get history' });
       }

    } catch(error){
        console.log(`GET: /get-history failed`, error);
        return res.status(500).json({ success: false, message: 'Error finding user', error: error.message });
    }
});


router.delete("/delete-history",verifyToken, async (req,res)=>{
    const { History } = getModels(req, 'History');
    // takes in study history id and deletes object
    const histId = req.body.histId;
    try{
        const deleteHist = await History.deleteOne({ _id: histId});
        //check if successful, if success, return success status, if not, return 404
        //if deleted acount =0 then return 404
     
        if (deleteHist.deletedCount!==0){
            console.log(`DELETE: /delete-history`);
            return res.status(200).json({success: true, message: 'History sucessfully deleted', data: deleteHist});
        } else {
            return res.status(404).json({ success: false, message: 'Could not delete history' });
        }
    

    }catch(error){
        console.log(`DELETE: /delete-history failed`, error);
        return res.status(500).json({ success: false, message: 'Error finding user', error: error.message });
    }
});



module.exports = router;
