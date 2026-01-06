const express = require('express');
const router = express.Router();
const { isValid, formatISO, parseISO, setHours, startOfWeek, endOfWeek, setMinutes, setSeconds, setMilliseconds, eachHourOfInterval, eachDayOfInterval } = require('date-fns');
const { verifyToken, verifyTokenOptional } = require('../middlewares/verifyToken');
const getModels = require('../services/getModelService');


// Route to log a visit
router.post('/log-visit', async (req, res) => {
    try {
        const {Visit} = getModels(req, 'Visit');
        const visit = new Visit({ timestamp: new Date() });
        await visit.save();
        res.status(200).json({ message: 'Visit logged' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to log visit' });
    }
});

router.post('/log-repeated-visit', verifyTokenOptional, async (req, res) => {
    const { RepeatedVisit } = getModels(req, 'RepeatedVisit');
    const { hash } = req.body;
    try {
        console.log('Logging repeated visit');
        let repeatedVisit = await RepeatedVisit.findOne({hash: hash});
        if(!repeatedVisit){
            repeatedVisit = new RepeatedVisit({ visits: [new Date()], hash: hash, user_id: req.user ? req.user.userId : null });
        }
        repeatedVisit.user_id = req.user ? req.user.userId : null;
        repeatedVisit.visits.push(new Date());
        if(req.user && req.user.userId){
            repeatedVisit.user_id = req.user.userId;
        }
        await repeatedVisit.save();
        console.log('Repeated visit logged');
        res.status(200).json({ message: 'Visit logged' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to log visit' });
    }
});

router.get('/visits-by-day', async (req, res) => {
    const {Visit} = getModels(req, 'Visit');

    try {
        const { startDate, endDate } = req.query;

        // Validate the dates
        if (!startDate || !isValid(parseISO(startDate))) {
            return res.status(400).json({ error: 'Invalid startDate' });
        }

        const parsedStartDate = parseISO(startDate);
        const parsedEndDate = endDate && isValid(parseISO(endDate)) ? parseISO(endDate) : new Date();

        const startOfWeekDate = startOfWeek(parsedStartDate, { weekStartsOn: 0 }); // 1 = Monday
        const endOfWeekDate = endOfWeek(parsedStartDate, { weekStartsOn: 0 });        //print for debugging


        // Query visits within the week range and group by day
        const visitsByDay = await Visit.aggregate([
            {
                $match: {
                    timestamp: {
                        $gte: startOfWeekDate,
                        $lt: endOfWeekDate
                    }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$timestamp" },
                        month: { $month: "$timestamp" },
                        day: { $dayOfMonth: "$timestamp" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
            }
        ]);

        // Generate an array with all days within the week range
        const daysInRange = eachDayOfInterval({
            start: startOfWeekDate,
            end: endOfWeekDate,
        });

        // Format and pad the result
        const formattedResult = daysInRange.map((day) => {
            const formattedDate = formatISO(day, { representation: 'date' });

            // Find the matching day in the database result
            const visitForDay = visitsByDay.find(item =>
                item._id.year === day.getFullYear() &&
                item._id.month === day.getMonth() + 1 &&
                item._id.day === day.getDate()
            );

            // Return either the actual count or 0 if there was no visit for this day
            return {
                date: formattedDate,
                count: visitForDay ? visitForDay.count : 0
            };
        });

        res.json(formattedResult);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching visits by day' });
    }
});

// `/visits-by-hour` route: Fetches visits grouped by hour within the specified range and pads missing hours with 0 visits
router.get('/visits-by-hour', async (req, res) => {
    const {Visit} = getModels(req, 'Visit');

    try {
        const { startDate } = req.query;

        // Validate the startDate
        if (!startDate || !isValid(parseISO(startDate))) {
            return res.status(400).json({ error: 'Invalid startDate' });
        }

        const parsedDate = parseISO(startDate);

        // Define the start and end of the day explicitly using setHours, setMinutes, etc.
        const startOfDay = setMilliseconds(setSeconds(setMinutes(setHours(parsedDate, 0), 0), 0), 0); // 00:00 of the given day
        const endOfDay = setMilliseconds(setSeconds(setMinutes(setHours(parsedDate, 23), 59), 59), 999); // 23:59:59.999 of the same day
        // Query visits within the day range and group by hour
        const visitsByHour = await Visit.aggregate([
            {
                $match: {
                    timestamp: {
                        $gte: startOfDay,
                        $lte: endOfDay
                    }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$timestamp" },
                        month: { $month: "$timestamp" },
                        day: { $dayOfMonth: "$timestamp" },
                        hour: { $hour: "$timestamp" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: {
                    "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1
                }
            }
        ]);

        // Generate an array with all hours from 00:00 to 23:00
        const hoursInRange = eachHourOfInterval({
            start: startOfDay,
            end: endOfDay
        });

        // Format and pad the result
        const formattedResult = hoursInRange.map((hour) => {
            const formattedHour = `${hour.getFullYear()}-${String(hour.getMonth() + 1).padStart(2, '0')}-${String(hour.getDate()).padStart(2, '0')} ${String(hour.getHours()).padStart(2, '0')}:00`;

            // Find the matching hour in the database result
            const visitForHour = visitsByHour.find(item =>
                item._id.year === hour.getFullYear() &&
                item._id.month === hour.getMonth() + 1 &&
                item._id.day === hour.getDate() &&
                item._id.hour === hour.getHours()
            );

            // Return either the actual count or 0 if there was no visit for this hour
            return {
                hour: formattedHour,
                count: visitForHour ? visitForHour.count : 0
            };
        });

        res.json(formattedResult);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching visits by hour' });
    }
});


router.get('/visits-by-all', async (req, res) => {
    const {Visit} = getModels(req, 'Visit');

    try {
        // Query to get the earliest and latest visit dates for padding the result
        const firstVisit = await Visit.findOne().sort({ timestamp: 1 });
        const lastVisit = await Visit.findOne().sort({ timestamp: -1 });

        if (!firstVisit || !lastVisit) {
            return res.json([]); // No visits in the database
        }

        // Get the date range (from the first to the last visit)
        const startDate = new Date(firstVisit.timestamp);
        const endDate = new Date(lastVisit.timestamp);

        // Query to get all visits within the range, grouped by day
        const visitsByAll = await Visit.aggregate([
            {
                $group: {
                    _id: {
                        year: { $year: "$timestamp" },
                        month: { $month: "$timestamp" },
                        day: { $dayOfMonth: "$timestamp" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
            }
        ]);

        // Generate an array with all days in the date range
        const daysInRange = eachDayOfInterval({
            start: startDate,
            end: endDate,
        });

        // Format and pad the result
        const formattedResult = daysInRange.map((day) => {
            const formattedDate = formatISO(day, { representation: 'date' });

            // Find the matching day in the database result
            const visitForDay = visitsByAll.find(item =>
                item._id.year === day.getFullYear() &&
                item._id.month === day.getMonth() + 1 &&
                item._id.day === day.getDate()
            );

            // Return either the actual count or 0 if there was no visit for this day
            return {
                date: formattedDate,
                count: visitForDay ? visitForDay.count : 0
            };
        });

        res.json(formattedResult);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching all-time visits' });
    }
});

router.get('/users-by-day', async (req, res) => {
    const { User } = getModels(req, 'User');

    try {

        const { startDate, endDate } = req.query;

        // Validate the dates
        if (!startDate || !isValid(parseISO(startDate))) {
            return res.status(400).json({ error: 'Invalid startDate' });
        }

        const parsedStartDate = parseISO(startDate);
        const parsedEndDate = endDate && isValid(parseISO(endDate)) ? parseISO(endDate) : new Date();

        const startOfWeekDate = startOfWeek(parsedStartDate, { weekStartsOn: 0 }); // 0 = Sunday
        const endOfWeekDate = endOfWeek(parsedStartDate, { weekStartsOn: 0 });

        // Query users created within the week range and group by day
        const usersByDay = await User.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: startOfWeekDate,
                        $lt: endOfWeekDate
                    }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" },
                        day: { $dayOfMonth: "$createdAt" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
            }
        ]);

        // Generate an array with all days within the week range
        const daysInRange = eachDayOfInterval({
            start: startOfWeekDate,
            end: endOfWeekDate,
        });

        // Format and pad the result
        const formattedResult = daysInRange.map((day) => {
            const formattedDate = formatISO(day, { representation: 'date' });

            // Find the matching day in the database result
            const userForDay = usersByDay.find(item =>
                item._id.year === day.getFullYear() &&
                item._id.month === day.getMonth() + 1 &&
                item._id.day === day.getDate()
            );

            // Return either the actual count or 0 if there was no user created on this day
            return {
                date: formattedDate,
                count: userForDay ? userForDay.count : 0
            };
        });

        res.json(formattedResult);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching users by day' });
    }
});

router.get('/users-by-hour', async (req, res) => {
    const { User } = getModels(req, 'User');

    try {

        const { startDate } = req.query;

        // Validate the startDate
        if (!startDate || !isValid(parseISO(startDate))) {
            return res.status(400).json({ error: 'Invalid startDate' });
        }

        const parsedDate = parseISO(startDate);

        // Define the start and end of the day explicitly
        const startOfDay = setMilliseconds(setSeconds(setMinutes(setHours(parsedDate, 0), 0), 0), 0); // 00:00:00.000
        const endOfDay = setMilliseconds(setSeconds(setMinutes(setHours(parsedDate, 23), 59), 59), 999); // 23:59:59.999

        // Query users created within the day range and group by hour
        const usersByHour = await User.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: startOfDay,
                        $lte: endOfDay
                    }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" },
                        day: { $dayOfMonth: "$createdAt" },
                        hour: { $hour: "$createdAt" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: {
                    "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1
                }
            }
        ]);

        // Generate an array with all hours from 00:00 to 23:00
        const hoursInRange = eachHourOfInterval({
            start: startOfDay,
            end: endOfDay
        });

        // Format and pad the result
        const formattedResult = hoursInRange.map((hour) => {
            const formattedHour = `${hour.getFullYear()}-${String(hour.getMonth() + 1).padStart(2, '0')}-${String(hour.getDate()).padStart(2, '0')} ${String(hour.getHours()).padStart(2, '0')}:00`;

            // Find the matching hour in the database result
            const userForHour = usersByHour.find(item =>
                item._id.year === hour.getFullYear() &&
                item._id.month === hour.getMonth() + 1 &&
                item._id.day === hour.getDate() &&
                item._id.hour === hour.getHours()
            );

            // Return either the actual count or 0 if there was no user created in this hour
            return {
                hour: formattedHour,
                count: userForHour ? userForHour.count : 0
            };
        });

        res.json(formattedResult);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching users by hour' });
    }
});

router.get('/users-by-all', async (req, res) => {
    const { User } = getModels(req, 'User');

    try {
        // Get the earliest and latest user creation dates
        const firstUser = await User.findOne().sort({ createdAt: 1 });
        const lastUser = await User.findOne().sort({ createdAt: -1 });

        if (!firstUser || !lastUser) {
            return res.json([]); // No users in the database
        }

        // Define the date range
        const startDate = new Date(firstUser.createdAt);
        const endDate = new Date(lastUser.createdAt);

        // Query to get all users created within the range, grouped by day
        const usersByAll = await User.aggregate([
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" },
                        day: { $dayOfMonth: "$createdAt" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
            }
        ]);

        // Generate an array with all days in the date range
        const daysInRange = eachDayOfInterval({
            start: startDate,
            end: endDate,
        });

        // Format and pad the result
        const formattedResult = daysInRange.map((day) => {
            const formattedDate = formatISO(day, { representation: 'date' });

            // Find the matching day in the database result
            const userForDay = usersByAll.find(item =>
                item._id.year === day.getFullYear() &&
                item._id.month === day.getMonth() + 1 &&
                item._id.day === day.getDate()
            );

            // Return either the actual count or 0 if there was no user created on this day
            return {
                date: formattedDate,
                count: userForDay ? userForDay.count : 0
            };
        });

        res.json(formattedResult);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching all-time users' });
    }
});

router.post('/qr-scan', async (req, res) => {
    const { QR } = getModels(req, 'QR');

    try {
        const { name, repeat } = req.body;
        const qr = await QR.findOne({ name: name });
        
        if (!qr) {
            return res.status(404).json({ success: false, error: 'QR code not found' });
        }

        if (!qr.isActive) {
            return res.status(400).json({ success: false, error: 'QR code is inactive' });
        }

        // Collect scan data
        const scanData = {
            timestamp: new Date(),
            isRepeat: repeat || false,
            userAgent: req.headers['user-agent'] || '',
            ipAddress: req.ip || req.connection.remoteAddress || '',
            referrer: req.headers.referer || ''
        };

        // Update QR code statistics
        qr.scans++;
        qr.lastScanned = new Date();
        
        if (repeat) {
            qr.repeated++;
        } else {
            qr.uniqueScans++;
        }

        // Add scan to history
        qr.scanHistory.push(scanData);

        await qr.save();
        
        // Redirect to the configured URL
        res.json({ 
            success: true, 
            message: 'QR scan registered',
            redirectUrl: qr.redirectUrl
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'An error occurred while processing QR scan' });
    }
});

router.get('/searches-by-day', async (req, res) => {
    const { Search } = getModels(req, 'Search');

    try {
        const { startDate, endDate } = req.query;

        // Validate the dates
        if (!startDate || !isValid(parseISO(startDate))) {
            return res.status(400).json({ error: 'Invalid startDate' });
        }

        const parsedStartDate = parseISO(startDate);
        const parsedEndDate = endDate && isValid(parseISO(endDate)) ? parseISO(endDate) : new Date();

        const startOfWeekDate = startOfWeek(parsedStartDate, { weekStartsOn: 0 }); // 1 = Monday
        const endOfWeekDate = endOfWeek(parsedStartDate, { weekStartsOn: 0 });        //print for debugging


        // Query visits within the week range and group by day
        const visitsByDay = await Search.aggregate([
            {
                $match: {
                    timestamp: {
                        $gte: startOfWeekDate,
                        $lt: endOfWeekDate
                    }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$timestamp" },
                        month: { $month: "$timestamp" },
                        day: { $dayOfMonth: "$timestamp" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
            }
        ]);

        // Generate an array with all days within the week range
        const daysInRange = eachDayOfInterval({
            start: startOfWeekDate,
            end: endOfWeekDate,
        });

        // Format and pad the result
        const formattedResult = daysInRange.map((day) => {
            const formattedDate = formatISO(day, { representation: 'date' });

            // Find the matching day in the database result
            const visitForDay = visitsByDay.find(item =>
                item._id.year === day.getFullYear() &&
                item._id.month === day.getMonth() + 1 &&
                item._id.day === day.getDate()
            );

            // Return either the actual count or 0 if there was no visit for this day
            return {
                date: formattedDate,
                count: visitForDay ? visitForDay.count : 0
            };
        });

        res.json(formattedResult);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching visits by day' });
    }
});

// `/visits-by-hour` route: Fetches visits grouped by hour within the specified range and pads missing hours with 0 visits
router.get('/searches-by-hour', async (req, res) => {
    const { Search } = getModels(req, 'Search');
    try {
        const { startDate } = req.query;

        // Validate the startDate
        if (!startDate || !isValid(parseISO(startDate))) {
            return res.status(400).json({ error: 'Invalid startDate' });
        }

        const parsedDate = parseISO(startDate);

        // Define the start and end of the day explicitly using setHours, setMinutes, etc.
        const startOfDay = setMilliseconds(setSeconds(setMinutes(setHours(parsedDate, 0), 0), 0), 0); // 00:00 of the given day
        const endOfDay = setMilliseconds(setSeconds(setMinutes(setHours(parsedDate, 23), 59), 59), 999); // 23:59:59.999 of the same day
        // Query visits within the day range and group by hour
        const visitsByHour = await Search.aggregate([
            {
                $match: {
                    timestamp: {
                        $gte: startOfDay,
                        $lte: endOfDay
                    }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$timestamp" },
                        month: { $month: "$timestamp" },
                        day: { $dayOfMonth: "$timestamp" },
                        hour: { $hour: "$timestamp" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: {
                    "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1
                }
            }
        ]);

        // Generate an array with all hours from 00:00 to 23:00
        const hoursInRange = eachHourOfInterval({
            start: startOfDay,
            end: endOfDay
        });

        // Format and pad the result
        const formattedResult = hoursInRange.map((hour) => {
            const formattedHour = `${hour.getFullYear()}-${String(hour.getMonth() + 1).padStart(2, '0')}-${String(hour.getDate()).padStart(2, '0')} ${String(hour.getHours()).padStart(2, '0')}:00`;

            // Find the matching hour in the database result
            const visitForHour = visitsByHour.find(item =>
                item._id.year === hour.getFullYear() &&
                item._id.month === hour.getMonth() + 1 &&
                item._id.day === hour.getDate() &&
                item._id.hour === hour.getHours()
            );

            // Return either the actual count or 0 if there was no visit for this hour
            return {
                hour: formattedHour,
                count: visitForHour ? visitForHour.count : 0
            };
        });

        res.json(formattedResult);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching visits by hour' });
    }
});


router.get('/searches-by-all', async (req, res) => {
    const { Search } = getModels(req, 'Search');

    try {

        // Query to get the earliest and latest visit dates for padding the result
        const firstVisit = await Search.findOne().sort({ timestamp: 1 });
        const lastVisit = await Search.findOne().sort({ timestamp: -1 });

        if (!firstVisit || !lastVisit) {
            return res.json([]); // No visits in the database
        }

        // Get the date range (from the first to the last visit)
        const startDate = new Date(firstVisit.timestamp);
        const endDate = new Date(lastVisit.timestamp);

        // Query to get all visits within the range, grouped by day
        const visitsByAll = await Search.aggregate([
            {
                $group: {
                    _id: {
                        year: { $year: "$timestamp" },
                        month: { $month: "$timestamp" },
                        day: { $dayOfMonth: "$timestamp" }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
            }
        ]);

        // Generate an array with all days in the date range
        const daysInRange = eachDayOfInterval({
            start: startDate,
            end: endDate,
        });

        // Format and pad the result
        const formattedResult = daysInRange.map((day) => {
            const formattedDate = formatISO(day, { representation: 'date' });

            // Find the matching day in the database result
            const visitForDay = visitsByAll.find(item =>
                item._id.year === day.getFullYear() &&
                item._id.month === day.getMonth() + 1 &&
                item._id.day === day.getDate()
            );

            // Return either the actual count or 0 if there was no visit for this day
            return {
                date: formattedDate,
                count: visitForDay ? visitForDay.count : 0
            };
        });

        res.json(formattedResult);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching all-time visits' });
    }
});


// Repeated Visits Analytics (based on RepeatedVisit.visits array)
router.get('/repeated-visits-by-day', async (req, res) => {
    const { RepeatedVisit } = getModels(req, 'RepeatedVisit');

    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !isValid(parseISO(startDate))) {
            return res.status(400).json({ error: 'Invalid startDate' });
        }

        const parsedStartDate = parseISO(startDate);
        const parsedEndDate = endDate && isValid(parseISO(endDate)) ? parseISO(endDate) : new Date();

        const startOfWeekDate = startOfWeek(parsedStartDate, { weekStartsOn: 0 });
        const endOfWeekDate = endOfWeek(parsedStartDate, { weekStartsOn: 0 });

        const visitsByDay = await RepeatedVisit.aggregate([
            { $unwind: '$visits' },
            {
                $match: {
                    visits: {
                        $gte: startOfWeekDate,
                        $lt: endOfWeekDate,
                    },
                },
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$visits' },
                        month: { $month: '$visits' },
                        day: { $dayOfMonth: '$visits' },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
        ]);

        const daysInRange = eachDayOfInterval({ start: startOfWeekDate, end: endOfWeekDate });

        const formattedResult = daysInRange.map((day) => {
            const formattedDate = formatISO(day, { representation: 'date' });
            const visitForDay = visitsByDay.find((item) =>
                item._id.year === day.getFullYear() &&
                item._id.month === day.getMonth() + 1 &&
                item._id.day === day.getDate()
            );
            return { date: formattedDate, count: visitForDay ? visitForDay.count : 0 };
        });

        res.json(formattedResult);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching repeated visits by day' });
    }
});

router.get('/repeated-visits-by-hour', async (req, res) => {
    const { RepeatedVisit } = getModels(req, 'RepeatedVisit');

    try {
        const { startDate } = req.query;
        if (!startDate || !isValid(parseISO(startDate))) {
            return res.status(400).json({ error: 'Invalid startDate' });
        }

        const parsedDate = parseISO(startDate);
        const startOfDay = setMilliseconds(setSeconds(setMinutes(setHours(parsedDate, 0), 0), 0), 0);
        const endOfDay = setMilliseconds(setSeconds(setMinutes(setHours(parsedDate, 23), 59), 59), 999);

        const visitsByHour = await RepeatedVisit.aggregate([
            { $unwind: '$visits' },
            {
                $match: {
                    visits: {
                        $gte: startOfDay,
                        $lte: endOfDay,
                    },
                },
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$visits' },
                        month: { $month: '$visits' },
                        day: { $dayOfMonth: '$visits' },
                        hour: { $hour: '$visits' },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1, "_id.hour": 1 } },
        ]);

        const hoursInRange = eachHourOfInterval({ start: startOfDay, end: endOfDay });
        const formattedResult = hoursInRange.map((hour) => {
            const formattedHour = `${hour.getFullYear()}-${String(hour.getMonth() + 1).padStart(2, '0')}-${String(hour.getDate()).padStart(2, '0')} ${String(hour.getHours()).padStart(2, '0')}:00`;
            const visitForHour = visitsByHour.find((item) =>
                item._id.year === hour.getFullYear() &&
                item._id.month === hour.getMonth() + 1 &&
                item._id.day === hour.getDate() &&
                item._id.hour === hour.getHours()
            );
            return { hour: formattedHour, count: visitForHour ? visitForHour.count : 0 };
        });

        res.json(formattedResult);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching repeated visits by hour' });
    }
});

router.get('/repeated-visits-by-all', async (req, res) => {
    const { RepeatedVisit } = getModels(req, 'RepeatedVisit');
    try {
        const bounds = await RepeatedVisit.aggregate([
            { $unwind: '$visits' },
            {
                $group: {
                    _id: null,
                    minDate: { $min: '$visits' },
                    maxDate: { $max: '$visits' },
                },
            },
        ]);

        if (!bounds.length) {
            return res.json([]);
        }

        const startDate = new Date(bounds[0].minDate);
        const endDate = new Date(bounds[0].maxDate);

        const visitsByAll = await RepeatedVisit.aggregate([
            { $unwind: '$visits' },
            {
                $group: {
                    _id: {
                        year: { $year: '$visits' },
                        month: { $month: '$visits' },
                        day: { $dayOfMonth: '$visits' },
                    },
                    count: { $sum: 1 },
                },
            },
            { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
        ]);

        const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });
        const formattedResult = daysInRange.map((day) => {
            const formattedDate = formatISO(day, { representation: 'date' });
            const visitForDay = visitsByAll.find((item) =>
                item._id.year === day.getFullYear() &&
                item._id.month === day.getMonth() + 1 &&
                item._id.day === day.getDate()
            );
            return { date: formattedDate, count: visitForDay ? visitForDay.count : 0 };
        });

        res.json(formattedResult);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching all-time repeated visits' });
    }
});

// Summary KPI endpoint: current vs previous period
router.get('/summary', async (req, res) => {
    const { User } = getModels(req, 'User');
    const { Visit } = getModels(req, 'Visit');
    const { Search } = getModels(req, 'Search');
    const { RepeatedVisit } = getModels(req, 'RepeatedVisit');

    try {
        const { startDate, endDate, range } = req.query;
        const now = new Date();

        let start;
        let end;
        if (range === 'all') {
            // Determine earliest and latest activity across collections
            const [firstUser, lastUser] = await Promise.all([
                User.findOne().sort({ createdAt: 1 }),
                User.findOne().sort({ createdAt: -1 }),
            ]);
            const [firstVisit, lastVisit] = await Promise.all([
                Visit.findOne().sort({ timestamp: 1 }),
                Visit.findOne().sort({ timestamp: -1 }),
            ]);
            const [firstSearch, lastSearch] = await Promise.all([
                Search.findOne().sort({ timestamp: 1 }),
                Search.findOne().sort({ timestamp: -1 }),
            ]);
            const bounds = await RepeatedVisit.aggregate([
                { $unwind: '$visits' },
                { $group: { _id: null, minDate: { $min: '$visits' }, maxDate: { $max: '$visits' } } },
            ]);
            const repMin = bounds[0]?.minDate ? new Date(bounds[0].minDate) : null;
            const repMax = bounds[0]?.maxDate ? new Date(bounds[0].maxDate) : null;

            const candidatesStart = [firstUser?.createdAt, firstVisit?.timestamp, firstSearch?.timestamp, repMin].filter(Boolean).map(d => new Date(d));
            const candidatesEnd = [lastUser?.createdAt, lastVisit?.timestamp, lastSearch?.timestamp, repMax].filter(Boolean).map(d => new Date(d));

            if (candidatesStart.length === 0 || candidatesEnd.length === 0) {
                return res.json({
                    range: { start: null, end: null, previous: { start: null, end: null } },
                    totals: { totalUsers: 0 },
                    current: { newUsers: 0, visits: 0, searches: 0, uniqueVisitors: 0, repeatVisitEvents: 0, repeatRate: 0 },
                    previous: { newUsers: 0, visits: 0, searches: 0, uniqueVisitors: 0, repeatVisitEvents: 0, repeatRate: 0 },
                    deltas: { newUsers: 0, visits: 0, searches: 0, uniqueVisitors: 0, repeatVisitEvents: 0, repeatRate: 0 },
                });
            }

            start = new Date(Math.min.apply(null, candidatesStart.map(d => d.getTime())));
            end = new Date(Math.max.apply(null, candidatesEnd.map(d => d.getTime())));
        } else {
            start = startDate && isValid(parseISO(startDate))
                ? parseISO(startDate)
                : new Date(now.getFullYear(), now.getMonth(), 1);
            end = endDate && isValid(parseISO(endDate))
                ? parseISO(endDate)
                : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        }

        const periodMs = end.getTime() - start.getTime() + 1;
        const prevEnd = new Date(start.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - periodMs + 1);

        const countUsersInRange = async (rangeStart, rangeEnd) => (
            await User.countDocuments({ createdAt: { $gte: rangeStart, $lte: rangeEnd } })
        );
        const countVisitsInRange = async (rangeStart, rangeEnd) => (
            await Visit.countDocuments({ timestamp: { $gte: rangeStart, $lte: rangeEnd } })
        );
        const countSearchesInRange = async (rangeStart, rangeEnd) => (
            await Search.countDocuments({ timestamp: { $gte: rangeStart, $lte: rangeEnd } })
        );

        const totalUsersToDate = await User.countDocuments({ createdAt: { $lte: end } });

        const currentUsers = await countUsersInRange(start, end);
        const previousUsers = await countUsersInRange(prevStart, prevEnd);

        const currentVisits = await countVisitsInRange(start, end);
        const previousVisits = await countVisitsInRange(prevStart, prevEnd);

        const currentSearches = await countSearchesInRange(start, end);
        const previousSearches = await countSearchesInRange(prevStart, prevEnd);

        const currentVisitEventsAgg = await RepeatedVisit.aggregate([
            { $unwind: '$visits' },
            { $match: { visits: { $gte: start, $lte: end } } },
            { $count: 'count' },
        ]);
        const currentVisitEvents = currentVisitEventsAgg[0]?.count || 0;

        const currentUniqueVisitorsAgg = await RepeatedVisit.aggregate([
            { $unwind: '$visits' },
            { $match: { visits: { $gte: start, $lte: end } } },
            { $group: { _id: '$_id' } },
            { $count: 'count' },
        ]);
        const currentUniqueVisitors = currentUniqueVisitorsAgg[0]?.count || 0;

        const previousVisitEventsAgg = await RepeatedVisit.aggregate([
            { $unwind: '$visits' },
            { $match: { visits: { $gte: prevStart, $lte: prevEnd } } },
            { $count: 'count' },
        ]);
        const previousVisitEvents = previousVisitEventsAgg[0]?.count || 0;

        const previousUniqueVisitorsAgg = await RepeatedVisit.aggregate([
            { $unwind: '$visits' },
            { $match: { visits: { $gte: prevStart, $lte: prevEnd } } },
            { $group: { _id: '$_id' } },
            { $count: 'count' },
        ]);
        const previousUniqueVisitors = previousUniqueVisitorsAgg[0]?.count || 0;

        const currentRepeatVisitEvents = Math.max(currentVisitEvents - currentUniqueVisitors, 0);
        const previousRepeatVisitEvents = Math.max(previousVisitEvents - previousUniqueVisitors, 0);

        const currentRepeatRate = currentVisitEvents > 0 ? currentRepeatVisitEvents / currentVisitEvents : 0;
        const previousRepeatRate = previousVisitEvents > 0 ? previousRepeatVisitEvents / previousVisitEvents : 0;

        const delta = (curr, prev) => {
            if (prev === 0) return curr > 0 ? 1 : 0;
            return (curr - prev) / prev;
        };

        res.json({
            range: { start, end, previous: { start: prevStart, end: prevEnd } },
            totals: {
                totalUsers: totalUsersToDate,
            },
            current: {
                newUsers: currentUsers,
                visits: currentVisits,
                searches: currentSearches,
                uniqueVisitors: currentUniqueVisitors,
                repeatVisitEvents: currentRepeatVisitEvents,
                repeatRate: currentRepeatRate,
            },
            previous: {
                newUsers: previousUsers,
                visits: previousVisits,
                searches: previousSearches,
                uniqueVisitors: previousUniqueVisitors,
                repeatVisitEvents: previousRepeatVisitEvents,
                repeatRate: previousRepeatRate,
            },
            deltas: {
                newUsers: delta(currentUsers, previousUsers),
                visits: delta(currentVisits, previousVisits),
                searches: delta(currentSearches, previousSearches),
                uniqueVisitors: delta(currentUniqueVisitors, previousUniqueVisitors),
                repeatVisitEvents: delta(currentRepeatVisitEvents, previousRepeatVisitEvents),
                repeatRate: delta(currentRepeatRate, previousRepeatRate),
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching analytics summary' });
    }
});

module.exports = router;
