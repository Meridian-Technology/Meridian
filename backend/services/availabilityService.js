const getModels = require('./getModelService');

// light weight version, needs further iterations as more full system comes online.
class AvailabilityService {
    constructor(req) {
        this.req = req;
        this.models = getModels(req, 'Event', 'User', 'OrgMember', 'Org', 'Schedule', 'Classroom');
    }

    // Check if user has conflicts during specified time blocks
    async checkUserConflicts(userId, timeBlocks, preferences = {}) {
        const conflicts = [];
        
        for (const block of timeBlocks) {
            const blockConflicts = await this.checkSingleBlockConflicts(userId, block, preferences);
            conflicts.push(...blockConflicts);
        }
        
        return conflicts;
    }

    // Check conflicts for a single time block
    async checkSingleBlockConflicts(userId, timeBlock, preferences) {
        const { Event, OrgMember, Org } = this.models;
        const conflicts = [];
        const { startTime, endTime } = timeBlock;

        // Check RSVP'd events if preference is enabled
        if (preferences.blockRsvpEvents) {
            const rsvpEvents = await Event.find({
                'attendees.user': userId,
                'attendees.status': { $in: ['going', 'maybe'] },
                $or: [
                    { start_time: { $gte: startTime, $lt: endTime } },
                    { end_time: { $gt: startTime, $lte: endTime } },
                    { start_time: { $lte: startTime }, end_time: { $gte: endTime } }
                ],
                status: { $in: ['approved', 'not-applicable'] },
                isDeleted: false
            }).select('name start_time end_time location type');

            conflicts.push(...rsvpEvents.map(event => ({
                type: 'rsvp_event',
                event: event,
                reason: 'You have RSVP\'d to this event'
            })));
        }

        // Check class schedule if preference is enabled
        if (preferences.blockClasses) {
            const classConflicts = await this.checkClassScheduleConflicts(userId, timeBlock);
            conflicts.push(...classConflicts);
        }

        // Check club meetings if preference is enabled
        if (preferences.blockClubMeetings) {
            const clubConflicts = await this.checkClubMeetingConflicts(userId, timeBlock);
            conflicts.push(...clubConflicts);
        }

        return conflicts;
    }

    // Check class schedule conflicts
    async checkClassScheduleConflicts(userId, timeBlock) {
        // Note: This depends on how class schedules are stored in your system
        // For now, returning empty array as class schedule integration wasn't specified
        // TODO: Implement based on your class schedule data structure
        return [];
    }

    // Check club meeting conflicts
    async checkClubMeetingConflicts(userId, timeBlock) {
        const { OrgMember, Org } = this.models;
        const conflicts = [];
        const { startTime, endTime } = timeBlock;

        // Get user's organization memberships
        const memberships = await OrgMember.find({ user_id: userId })
            .populate('org_id');

        // Check each org's weekly meeting times
        for (const membership of memberships) {
            const org = membership.org_id;
            if (org.weekly_meeting && org.weekly_meeting.time) {
                const meetingConflict = this.checkWeeklyMeetingConflict(
                    org.weekly_meeting,
                    timeBlock
                );
                
                if (meetingConflict) {
                    conflicts.push({
                        type: 'club_meeting',
                        org: {
                            _id: org._id,
                            name: org.org_name
                        },
                        meeting: org.weekly_meeting,
                        reason: `${org.org_name} weekly meeting`
                    });
                }
            }
        }

        return conflicts;
    }

    // Check if weekly meeting conflicts with time block
    checkWeeklyMeetingConflict(weeklyMeeting, timeBlock) {
        const { startTime, endTime } = timeBlock;
        
        // Extract day of week and time from the time block
        const blockDay = startTime.getDay(); // 0 = Sunday
        const blockStartMinutes = startTime.getHours() * 60 + startTime.getMinutes();
        const blockEndMinutes = endTime.getHours() * 60 + endTime.getMinutes();
        
        // Check if meeting day matches block day
        if (weeklyMeeting.day !== blockDay) {
            return false;
        }
        
        // Check time overlap
        const meetingStart = weeklyMeeting.startTime; // Assuming in minutes from midnight
        const meetingEnd = weeklyMeeting.endTime;
        
        return blockStartMinutes < meetingEnd && blockEndMinutes > meetingStart;
    }

    // Find optimal time slots from poll responses
    async findOptimalTimes(pollId) {
        const { AvailabilityPoll } = this.models;
        
        const poll = await AvailabilityPoll.findById(pollId);
        if (!poll) {
            throw new Error('Poll not found');
        }

        // Aggregate all selected blocks across all responses
        const allBlocks = [];
        poll.responses.forEach(response => {
            response.selectedBlocks.forEach(block => {
                allBlocks.push({
                    startTime: block.startTime,
                    endTime: block.endTime,
                    user: response.user,
                    displayName: response.displayName
                });
            });
        });

        // Find overlapping time periods
        const overlaps = this.findTimeOverlaps(allBlocks);
        
        // Sort by number of participants (descending)
        overlaps.sort((a, b) => b.participants.length - a.participants.length);
        
        return overlaps;
    }

    // Find overlapping time periods from all user selections
    findTimeOverlaps(blocks) {
        const overlaps = [];
        
        // Group blocks by their time ranges
        const timeSlots = new Map();
        
        blocks.forEach(block => {
            const key = `${block.startTime.getTime()}-${block.endTime.getTime()}`;
            if (!timeSlots.has(key)) {
                timeSlots.set(key, {
                    startTime: block.startTime,
                    endTime: block.endTime,
                    participants: []
                });
            }
            
            timeSlots.get(key).participants.push({
                user: block.user,
                displayName: block.displayName
            });
        });
        
        // Convert map to array and filter out single-participant slots
        timeSlots.forEach(slot => {
            if (slot.participants.length > 1) {
                overlaps.push(slot);
            }
        });
        
        return overlaps;
    }

    // Validate time block selection
    validateTimeBlocks(timeBlocks) {
        const errors = [];
        
        timeBlocks.forEach((block, index) => {
            // Check if start time is before end time
            if (new Date(block.startTime) >= new Date(block.endTime)) {
                errors.push(`Block ${index + 1}: Start time must be before end time`);
            }
            
            // Check if time is in the future
            if (new Date(block.startTime) <= new Date()) {
                errors.push(`Block ${index + 1}: Time must be in the future`);
            }
            
            // Check block duration (minimum 15 minutes)
            const duration = new Date(block.endTime) - new Date(block.startTime);
            if (duration < 15 * 60 * 1000) {
                errors.push(`Block ${index + 1}: Minimum duration is 15 minutes`);
            }
        });
        
        return errors;
    }

    // Get user's busy times for a date range
    async getUserBusyTimes(userId, startDate, endDate, preferences = {}) {
        const busyTimes = [];
        
        // Get events user is attending
        if (preferences.includeRsvpEvents !== false) {
            const events = await this.models.Event.find({
                'attendees.user': userId,
                'attendees.status': { $in: ['going', 'maybe'] },
                start_time: { $gte: startDate, $lte: endDate },
                status: { $in: ['approved', 'not-applicable'] },
                isDeleted: false
            }).select('name start_time end_time location');
            
            busyTimes.push(...events.map(event => ({
                type: 'event',
                startTime: event.start_time,
                endTime: event.end_time,
                title: event.name,
                location: event.location
            })));
        }
        
        // TODO: Add class schedule integration
        // TODO: Add club meeting integration
        
        return busyTimes.sort((a, b) => a.startTime - b.startTime);
    }
}

module.exports = AvailabilityService;
