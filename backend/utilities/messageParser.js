/**
 * Utility functions for parsing message content
 * Extracts event mentions and links from text content
 */

/**
 * Extract event mentions from content
 * Only supports ID-based pattern: @event:{id}
 * @param {string} content - The message content
 * @returns {Array} Array of event mention objects found in content
 */
function extractEventMentions(content) {
    if (!content || typeof content !== 'string') {
        return [];
    }

    const mentions = [];
    const mongoose = require('mongoose');
    
    // Pattern: @event:{id} (24 hex chars = MongoDB ObjectId)
    const idPattern = /@event:([a-fA-F0-9]{24})(?=\s|$|[\n\r@#])/g;
    let match;
    while ((match = idPattern.exec(content)) !== null) {
        const eventId = match[1];
        // Validate it's a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(eventId)) {
            mentions.push({
                type: 'event',
                pattern: match[0],
                eventId: new mongoose.Types.ObjectId(eventId)
            });
        }
    }

    return mentions;
}

/**
 * Validate and resolve event mentions to Event IDs
 * @param {Array} mentions - Array of mention objects from extractEventMentions (ID-based only)
 * @param {Object} Event - Mongoose Event model
 * @param {ObjectId} orgId - Organization ID to filter events
 * @returns {Promise<Array>} Array of Event IDs
 */
async function resolveEventMentions(mentions, Event, orgId) {
    if (!mentions || mentions.length === 0 || !Event) {
        return [];
    }

    const eventIds = [];
    const ids = mentions.map(m => m.eventId).filter(Boolean);

    if (ids.length === 0) {
        return [];
    }

    try {
        // Validate IDs exist and belong to this org (single query)
        const events = await Event.find({
            _id: { $in: ids },
            hostingId: orgId,
            hostingType: 'Org'
        }).select('_id').limit(50);
        
        events.forEach(event => {
            if (!eventIds.some(id => id.toString() === event._id.toString())) {
                eventIds.push(event._id);
            }
        });
    } catch (error) {
        console.error('Error validating event IDs:', error);
    }

    return eventIds;
}

/**
 * Extract URLs from content
 * @param {string} content - The message content
 * @returns {Array} Array of URLs found in content
 */
function extractLinks(content) {
    if (!content || typeof content !== 'string') {
        return [];
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const links = [];
    let match;

    while ((match = urlRegex.exec(content)) !== null) {
        const url = match[1].trim();
        // Basic URL validation
        try {
            new URL(url);
            if (!links.includes(url)) {
                links.push(url);
            }
        } catch (e) {
            // Invalid URL, skip
        }
    }

    return links;
}

/**
 * Format content for display by replacing mentions and links with formatted versions
 * @param {string} content - The original content
 * @param {Array} eventMentions - Array of resolved event mentions with event data
 * @returns {string} Formatted content with mentions and links replaced
 */
function formatContentForDisplay(content, eventMentions = []) {
    let formatted = content;

    // Replace event mentions with formatted links
    eventMentions.forEach(mention => {
        if (mention.eventId && mention.eventName) {
            const link = `<a href="/event/${mention.eventId}" class="event-mention">@${mention.eventName}</a>`;
            // Replace all occurrences of the mention pattern
            formatted = formatted.replace(
                new RegExp(mention.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                link
            );
        }
    });

    // Replace URLs with clickable links
    const links = extractLinks(formatted);
    links.forEach(link => {
        formatted = formatted.replace(
            link,
            `<a href="${link}" target="_blank" rel="noopener noreferrer" class="message-link">${link}</a>`
        );
    });

    return formatted;
}

/**
 * Parse message content and extract all relevant data
 * @param {string} content - The message content
 * @param {Object} Event - Mongoose Event model
 * @param {ObjectId} orgId - Organization ID
 * @returns {Promise<Object>} Object with mentions, links, and formatted content
 */
async function parseMessageContent(content, Event, orgId) {
    // Extract mentions (ID-based only)
    const mentions = extractEventMentions(content);
    const links = extractLinks(content);
    const eventIds = await resolveEventMentions(mentions, Event, orgId);

    // Get event details for formatting
    let eventMentions = [];
    if (eventIds.length > 0) {
        const events = await Event.find({ _id: { $in: eventIds } });
        // Create a map of event IDs to events for quick lookup
        const eventMap = new Map();
        events.forEach(event => {
            eventMap.set(event._id.toString(), event);
        });
        
        eventMentions = mentions.map(mention => {
            // Match by eventId since we're using ID-based mentions
            const eventIdStr = mention.eventId?.toString();
            const event = eventIdStr ? eventMap.get(eventIdStr) : null;
            return {
                ...mention,
                eventId: event ? event._id : mention.eventId,
                eventName: event ? event.name : null
            };
        }).filter(m => m.eventId && m.eventName);
    }

    const formattedContent = formatContentForDisplay(content, eventMentions);

    return {
        rawContent: content,
        mentions: mentions,
        eventIds: eventIds,
        links: links,
        formattedContent: formattedContent
    };
}

module.exports = {
    extractEventMentions,
    resolveEventMentions,
    extractLinks,
    formatContentForDisplay,
    parseMessageContent
};

