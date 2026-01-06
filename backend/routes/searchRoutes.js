const express = require('express');
const { verifyToken, verifyTokenOptional } = require('../middlewares/verifyToken');
const { sortByAvailability } = require('../helpers.js');
const multer = require('multer');
const path = require('path');
const s3 = require('../aws-config');
const mongoose = require('mongoose');
const { clean } = require('../services/profanityFilterService');
const getModels = require('../services/getModelService');
const router = express.Router();

router.get('/search', verifyTokenOptional, async (req, res) => {
    const { Classroom, User, Schedule } = getModels(req, 'Classroom', 'User', 'Schedule');
    const query = req.query.query;
    const attributes = req.query.attributes ? req.query.attributes : []; // Ensure attributes is an array
    const sort = req.query.sort;
    const fullObjects = req.query.fullObjects === 'true'; // New parameter to return full objects
    const userId = req.user ? req.user.userId : null;
    let user;
    if (userId) {
        try {
            user = await User.findOne({ _id: userId });
        } catch (error) {
            console.log('invalid user')
        }
    }

    try {
        // Define the base query with projection to only include the name field
        let findQuery = Classroom.find(
            { name: { $regex: query, $options: 'i' }, attributes: { $all: attributes } },
            { name: 1 } // Project only the name field
        );

        if (attributes.length === 0) {
            findQuery = Classroom.find(
                { name: { $regex: query, $options: 'i' } },
                { name: 1 } // Project only the name field
            );
        }

        if (sort === "availability") {
            findQuery = Classroom.aggregate([
                {
                    $match: {
                        name: { $regex: query, $options: 'i' } // Filters classrooms by name using regex
                    }
                },
                {
                    $lookup: {
                        from: "schedules", // Assumes "schedules" is the collection name
                        localField: "_id", // Field in the 'classroom' documents
                        foreignField: "classroom_id", // Corresponding field in 'schedule' documents
                        as: "schedule_info" // Temporarily holds the entire joined schedule documents
                    }
                },
                {
                    $unwind: "$schedule_info" // Unwinds the schedule_info to handle multiple documents if necessary
                },
                {
                    $project: {
                        name: 1, // Includes classroom name in the output
                        weekly_schedule: "$schedule_info.weekly_schedule" // Projects only the weekly_schedule part from each schedule_info
                    }
                }
            ]);
        }

        console.log({ name: { $regex: query, $options: 'i' }, attributes: { $all: attributes } }, { name: 1 });


        // Conditionally add sorting if required
        findQuery = findQuery.sort('name'); // Sort by name in ascending order

        // Execute the query
        let classrooms = await findQuery;

        if (sort === "availability") {
            classrooms = sortByAvailability(classrooms);
            // console.log(classrooms);
        }

        let sortedClassrooms = [];

        if (userId && user) {
            const savedSet = new Set(user.saved); // Convert saved items to a Set for efficient lookups

            // Split classrooms into saved and not saved
            const { saved, notSaved } = classrooms.reduce((acc, classroom) => {
                if (savedSet.has(classroom._id.toString())) {
                    acc.saved.push(classroom);
                } else {
                    acc.notSaved.push(classroom);
                }
                return acc;
            }, { saved: [], notSaved: [] });

            // Concatenate saved items in front of not saved items
            sortedClassrooms = saved.concat(notSaved);
        } else {
            sortedClassrooms = classrooms; // No user or saved info, use original order
        }

        if (fullObjects) {
            // Return full classroom objects with schedule data
            const fullRoomData = await Promise.all(
                sortedClassrooms.map(async (classroom) => {
                    try {
                        // Get full classroom data
                        const fullRoom = await Classroom.findById(classroom._id);
                        // Get schedule data
                        const schedule = await Schedule.findOne({ classroom_id: classroom._id });
                        
                        return {
                            ...fullRoom.toObject(),
                            schedule: schedule ? schedule.toObject() : null
                        };
                    } catch (error) {
                        console.error(`Error fetching full data for room ${classroom._id}:`, error);
                        return {
                            _id: classroom._id,
                            name: classroom.name || 'Unknown Room',
                            schedule: null
                        };
                    }
                })
            );
            
            console.log(`GET: /search?query=${query}&attributes=${attributes}&sort=${sort}&fullObjects=true - Returning ${fullRoomData.length} full objects`);
            res.json({ success: true, message: "Rooms found", data: fullRoomData });
        } else {
            // Extract only the names from the result set (original behavior)
            const names = sortedClassrooms.map(classroom => classroom.name);
            
            console.log(`GET: /search?query=${query}&attributes=${attributes}&sort=${sort}`);
            res.json({ success: true, message: "Rooms found", data: names });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error searching for rooms', error: error.message });
        console.error(error);
    }
});

// Search rooms by name and return full room objects
router.get('/search-rooms', verifyTokenOptional, async (req, res) => {
    const { Classroom, User } = getModels(req, 'Classroom', 'User');
    const { query, limit = 20, page = 1 } = req.query;
    const userId = req.user ? req.user.userId : null;

    try {
        if (!query || query.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }

        let user = null;
        if (userId) {
            try {
                user = await User.findOne({ _id: userId });
            } catch (error) {
                console.log('Invalid user ID:', error);
            }
        }

        // Build search query
        const searchQuery = {
            $or: [
                { name: { $regex: query.trim(), $options: 'i' } },
                { attributes: { $regex: query.trim(), $options: 'i' } }
            ]
        };

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Execute search with pagination
        const [rooms, total] = await Promise.all([
            Classroom.find(searchQuery)
                .sort({ name: 1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Classroom.countDocuments(searchQuery)
        ]);

        // Sort results based on user's saved rooms
        let sortedRooms = rooms;
        if (user && user.saved && user.saved.length > 0) {
            const savedSet = new Set(user.saved.map(id => id.toString()));

            // Split rooms into saved and not saved
            const { saved, notSaved } = rooms.reduce((acc, room) => {
                if (savedSet.has(room._id.toString())) {
                    acc.saved.push(room);
                } else {
                    acc.notSaved.push(room);
                }
                return acc;
            }, { saved: [], notSaved: [] });

            // Concatenate saved items in front of not saved items
            sortedRooms = saved.concat(notSaved);
        }

        console.log(`GET: /search-rooms?query=${query}&limit=${limit}&page=${page} - Found ${sortedRooms.length} rooms`);

        res.json({
            success: true,
            message: 'Rooms found',
            rooms: sortedRooms,
            pagination: {
                total,
                totalPages: Math.ceil(total / parseInt(limit)),
                currentPage: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('GET: /search-rooms failed', error);
        res.status(500).json({
            success: false,
            message: 'Error searching for rooms',
            error: error.message
        });
    }
});

router.get('/all-purpose-search', verifyTokenOptional, async (req, res) => {
    const { Classroom, User, Schedule, Search } = getModels(req, 'Classroom', 'User', 'Schedule', 'Search');
    const query = req.query.query;
    const attributes = req.query.attributes ? req.query.attributes : []; // Ensure attributes is an array
    const sort = req.query.sort;
    const returnIds = req.query.returnIds || false; // Return room IDs instead of names
    const userId = req.user ? req.user.userId : null;
    let user;

    // Handle timePeriod - it might already be an object (from Express query parsing) or a JSON string
    let timePeriod = null;
    if (req.query.timePeriod) {
        if (typeof req.query.timePeriod === 'string') {
            try {
                timePeriod = JSON.parse(req.query.timePeriod);
            } catch (e) {
                console.error('Error parsing timePeriod:', e);
                timePeriod = null;
            }
        } else {
            // Already an object from Express query parsing
            timePeriod = req.query.timePeriod;
        }
    }
    
    console.log(`GET: /all-purpose-search?query=${query}&attributes=${attributes}&sort=${sort}&time=${timePeriod}`);
    console.log(JSON.stringify(req.query));
    const createTimePeriodQuery = (queryObject) => {
        let conditions = [];
        Object.entries(queryObject).forEach(([day, periods]) => {
            if (periods.length > 0) {
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

    if (userId) {
        try {
            user = await User.findOne({ _id: userId });
        } catch (error) {
            console.log('invalid user')
        }
    }

    try {
        // Define the base query with projection to only include the name field
        let findQuery = Classroom.find(
            { name: { $regex: query, $options: 'i' }, attributes: { $all: attributes }, mainSearch: { $ne: false } },
            { name: 1 } // Project only the name field
        );

        if (attributes.length === 0) {
            findQuery = Classroom.find(
                { name: { $regex: query, $options: 'i' }, mainSearch: { $ne: false } },
                { name: 1 } // Project only the name field
            );
        }

        if (timePeriod) {
            const queryConditions = createTimePeriodQuery(timePeriod);
            const mongoQuery = { "$and": queryConditions };
            const rooms = await Schedule.find(mongoQuery);
            const roomIds = rooms.map(room => room.classroom_id); //add condition to findQuery
            findQuery = findQuery.where('_id').in(roomIds);
        }

        if (sort === "availability") {
            findQuery = Classroom.aggregate([
                {
                    $match: {
                        name: { $regex: query, $options: 'i' }, // Filters classrooms by name using regex
                        mainSearch: { $ne: false }
                    }
                },
                {
                    $lookup: {
                        from: "schedules",
                        localField: "_id",
                        foreignField: "classroom_id", // Corresponding field in 'schedule' documents
                        as: "schedule_info" // Temporarily holds the entire joined schedule documents
                    }
                },
                {
                    $unwind: "$schedule_info" // Unwinds the schedule_info to handle multiple documents if necessary
                },
                {
                    $project: {
                        _id: 1, // Include classroom ID in the output
                        name: 1, // Includes classroom name in the output
                        weekly_schedule: "$schedule_info.weekly_schedule" // Projects only the weekly_schedule part from each schedule_info
                    }
                }
            ]);
        }

        findQuery = findQuery.sort('name');

        let classrooms = await findQuery;

        if (sort === "availability") {
            classrooms = sortByAvailability(classrooms);
            // console.log(classrooms);
        }

        let sortedClassrooms = [];

        if (userId && user) {
            if (sort === "availability") {
                sortedClassrooms = classrooms;

            } else {
                const savedSet = new Set(user.saved); // Convert saved items to a Set for efficient lookups

                // Split classrooms into saved and not saved
                const { saved, notSaved } = classrooms.reduce((acc, classroom) => {
                    if (savedSet.has(classroom._id.toString())) {
                        acc.saved.push(classroom);
                    } else {
                        acc.notSaved.push(classroom);
                    }
                    return acc;
                }, { saved: [], notSaved: [] });

                // Concatenate saved items in front of not saved items
                sortedClassrooms = saved.concat(notSaved);
            }
        } else {
            sortedClassrooms = classrooms; // No user or saved info, use original order
        }

        // Extract names or IDs from the result set based on returnIds parameter
        const result = returnIds 
            ? sortedClassrooms.map(classroom => classroom._id.toString())
            : sortedClassrooms.map(classroom => classroom.name);

        //analytics
        const search = new Search({
            query: {
                query: query,
                attributes: attributes,
                timePeriod: timePeriod
            },
            user_id: userId ? userId : null,
        });

        search.save();
        res.json({ success: true, message: "Rooms found", data: result });


    } catch (error) {
        res.status(500).json({ success: false, message: 'Error searching for rooms', error: error.message });
        console.error(error);
    }
});



module.exports = router;
