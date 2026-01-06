const getModels = require('./getModelService');
const FeedbackService = require('./feedbackService');

class StudySessionService {
    constructor(req) {
        this.req = req;
        this.models = getModels(req, 'StudySession', 'Event', 'User', 'Classroom', 'Schedule', 'AvailabilityPoll', 'Notification');
        this.feedbackService = new FeedbackService(req);
    }

    // Get current semester end date
    getCurrentSemesterEnd() {
        const now = new Date();
        const currentYear = now.getFullYear();
        const month = now.getMonth();
        
        // Spring semester (Jan-May) vs Fall semester (Aug-Dec)
        if (month < 6) {
            return new Date(currentYear, 4, 31, 23, 59, 59); // End of May
        } else {
            return new Date(currentYear, 11, 31, 23, 59, 59); // End of December
        }
    }

    // Create study session with related event
    async createStudySession(sessionData, userId) {
        const { StudySession, Event } = this.models;
        
        // Validate semester end for recurring sessions
        if (sessionData.isRecurring) {
            const semesterEnd = this.getCurrentSemesterEnd();
            sessionData.recurrencePattern.semesterEnd = semesterEnd;
            
            if (new Date(sessionData.startTime) > semesterEnd) {
                throw new Error('Cannot create recurring session that starts after semester end');
            }
        }

        // Create the event first
        const eventData = {
            name: `${sessionData.title} - Study Session`,
            type: "study",
            hostingId: userId,
            hostingType: "User",
            location: sessionData.location,
            start_time: new Date(sessionData.startTime),
            end_time: new Date(sessionData.endTime),
            description: sessionData.description || `Study session for ${sessionData.course}`,
            visibility: "internal", // Never public - keeps off main calendar
            status: "not-applicable", // Bypasses approval workflow
            going: [],
            attendees: [],
            rsvpEnabled: true,
            rsvpRequired: false,
            expectedAttendance: 10, // Default for study sessions
            isStudySession: true, // Flag for filtering
            isDeleted: false
        };

        const event = new Event(eventData);
        await event.save();

        // Create the study session
        const studySessionData = {
            ...sessionData,
            creator: userId,
            relatedEvent: event._id,
            participants: [{ user: userId, status: 'going' }] // Creator is automatically going
        };

        const studySession = new StudySession(studySessionData);
        await studySession.save();

        // Link back to study session in event
        event.studySessionId = studySession._id;
        await event.save();

        return { studySession, event };
    }

    // Update study session and sync with event
    async updateStudySession(sessionId, updateData, userId) {
        const { StudySession, Event } = this.models;
        
        const session = await StudySession.findById(sessionId);
        if (!session) {
            throw new Error('Study session not found');
        }

        if (!session.isCreator(userId)) {
            throw new Error('Only the creator can update the session');
        }

        if (session.status !== 'scheduled') {
            throw new Error('Can only update scheduled sessions');
        }

        // Update the study session
        Object.assign(session, updateData);
        await session.save();

        // Sync changes to related event if time/location changed
        if (updateData.startTime || updateData.endTime || updateData.location || updateData.title) {
            const event = await Event.findById(session.relatedEvent);
            if (event) {
                if (updateData.startTime) event.start_time = new Date(updateData.startTime);
                if (updateData.endTime) event.end_time = new Date(updateData.endTime);
                if (updateData.location) event.location = updateData.location;
                if (updateData.title) event.name = `${updateData.title} - Study Session`;
                await event.save();
            }
        }

        return session;
    }

    // Handle RSVP to study session
    async rsvpToSession(sessionId, userId, status) {
        const { StudySession } = this.models;
        
        const session = await StudySession.findById(sessionId).populate('relatedEvent');
        if (!session) {
            throw new Error('Study session not found');
        }

        if (session.status !== 'scheduled') {
            throw new Error('Cannot RSVP to non-scheduled session');
        }

        // No capacity restrictions - unlimited participants

        // Remove existing participation
        session.participants = session.participants.filter(p => p.user.toString() !== userId);

        // Add new participation
        session.participants.push({
            user: userId,
            status: status,
            rsvpAt: new Date()
        });

        await session.save();

        // Sync with event attendees
        const event = await this.models.Event.findById(session.relatedEvent);
        if (event) {
            event.attendees = event.attendees.filter(a => a.user?.toString() !== userId);
            
            if (status === 'going' || status === 'maybe') {
                event.attendees.push({
                    user: userId,
                    status: status === 'going' ? 'going' : 'maybe'
                });
            }
            
            await event.save();
        }

        return session;
    }

    // Check room availability for study session
    async checkRoomAvailability(startTime, endTime, roomName) {
        const { Schedule, Event, Classroom } = this.models;
        
        const start = new Date(startTime);
        const end = new Date(endTime);

        // Check if room exists and is not restricted
        const room = await Classroom.findOne({ name: roomName });
        if (!room) {
            return { isAvailable: false, reason: 'Room not found' };
        }
        
        if (room.attributes && room.attributes.includes('restricted')) {
            return { isAvailable: false, reason: 'Room is restricted' };
        }

        // Check classroom schedule conflicts
        const dayOfWeek = ['M', 'T', 'W', 'R', 'F'][start.getDay() - 1]; // Monday = 0
        if (dayOfWeek) {
            const schedule = await Schedule.findOne({ classroom_id: room._id });
            if (schedule && schedule.weekly_schedule[dayOfWeek]) {
                const startMinutes = start.getHours() * 60 + start.getMinutes();
                const endMinutes = end.getHours() * 60 + end.getMinutes();
                
                const hasClassConflict = schedule.weekly_schedule[dayOfWeek].some(classTime => {
                    return startMinutes < classTime.end_time && endMinutes > classTime.start_time;
                });
                
                if (hasClassConflict) {
                    return { isAvailable: false, reason: 'Room has scheduled classes during this time' };
                }
            }
        }

        // Check event conflicts (including other study sessions)
        const eventConflicts = await Event.find({
            location: roomName,
            $or: [
                { start_time: { $gte: start, $lt: end } },
                { end_time: { $gt: start, $lte: end } },
                { start_time: { $lte: start }, end_time: { $gte: end } }
            ],
            status: { $in: ['approved', 'not-applicable'] },
            isDeleted: false
        });

        if (eventConflicts.length > 0) {
            return { 
                isAvailable: false, 
                reason: 'Room has existing event bookings during this time',
                conflicts: eventConflicts
            };
        }

        return { isAvailable: true };
    }

    // Get suggested rooms for a time slot
    async getSuggestedRooms(startTime, endTime, preferences = {}) {
        const { Classroom } = this.models;
        
        // Get all non-restricted rooms
        const rooms = await Classroom.find({
            mainSearch: { $ne: false },
            $nor: [{ attributes: 'restricted' }]
        }).sort({ name: 1 });

        const availableRooms = [];
        
        for (const room of rooms) {
            const availability = await this.checkRoomAvailability(startTime, endTime, room.name);
            if (availability.isAvailable) {
                availableRooms.push({
                    _id: room._id,
                    name: room.name,
                    attributes: room.attributes,
                    image: room.image
                });
            }
        }

        return availableRooms;
    }

    // Get user's study sessions
    async getUserStudySessions(userId, options = {}) {
        const { StudySession } = this.models;
        const { status = 'scheduled', limit = 20, skip = 0 } = options;
        
        const query = {
            $or: [
                { creator: userId },
                { 'participants.user': userId }
            ]
        };

        if (status !== 'all') {
            query.status = status;
        }

        const sessions = await StudySession.find(query)
            .populate('relatedEvent', 'start_time end_time location')
            .populate('creator', 'name email picture')
            .populate('participants.user', 'name picture')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        return sessions;
    }

    // Discover public study sessions
    async discoverStudySessions(options = {}) {
        const { StudySession } = this.models;
        const { course, limit = 20, skip = 0 } = options;
        
        const query = {
            visibility: 'public',
            status: 'scheduled'
        };

        if (course) {
            query.course = { $regex: course, $options: 'i' };
        }

        const sessions = await StudySession.find(query)
            .populate('relatedEvent', 'start_time end_time location')
            .populate('creator', 'name picture')
            .sort({ 'relatedEvent.start_time': 1 })
            .skip(skip)
            .limit(limit);

        return sessions;
    }

    // Cancel study session
    async cancelStudySession(sessionId, userId) {
        const { StudySession, Event } = this.models;
        
        const session = await StudySession.findById(sessionId);
        if (!session) {
            throw new Error('Study session not found');
        }

        if (!session.isCreator(userId)) {
            throw new Error('Only the creator can cancel the session');
        }

        // Update session status
        session.status = 'cancelled';
        await session.save();

        // Cancel related event
        const event = await Event.findById(session.relatedEvent);
        if (event) {
            event.isDeleted = true;
            await event.save();
        }

        // TODO: Send cancellation notifications

        return session;
    }

    // Submit feedback for a study session
    async submitFeedback(sessionId, userId, responses, metadata = {}) {
        const { StudySession } = this.models;
        
        const session = await StudySession.findById(sessionId);
        if (!session) {
            throw new Error('Study session not found');
        }

        if (session.status !== 'completed') {
            throw new Error('Can only provide feedback for completed sessions');
        }

        // Check if user participated in the session
        const participation = session.getUserParticipation(userId);
        if (!participation || participation.status === 'not-going') {
            throw new Error('Can only provide feedback if you attended the session');
        }

        // Use universal feedback service
        const feedback = await this.feedbackService.submitFeedback(
            userId,
            'studySession',
            sessionId,
            responses,
            metadata
        );

        return feedback;
    }

    // Get feedback statistics (admin only)
    async getFeedbackStats(sessionId) {
        const stats = await this.feedbackService.getFeedbackStats('studySession', sessionId);
        return stats[0] || null;
    }

    // Get feedback form configuration
    async getFeedbackForm() {
        return this.feedbackService.getFeedbackForm('studySession');
    }

    // Check if user has submitted feedback
    async hasUserSubmittedFeedback(userId, sessionId) {
        return this.feedbackService.hasUserSubmittedFeedback(userId, 'studySession', sessionId);
    }
}

module.exports = StudySessionService;
