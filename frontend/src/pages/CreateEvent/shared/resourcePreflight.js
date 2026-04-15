function extractResourceId(formData = {}) {
    return formData.classroom_id || formData.classroomId || null;
}

function buildResourcePreflightPayload({ resourceId, startTime, endTime, excludeEventId = null }) {
    return {
        resourceId,
        start_time: startTime,
        end_time: endTime,
        ...(excludeEventId ? { excludeEventId } : {})
    };
}

module.exports = {
    extractResourceId,
    buildResourcePreflightPayload
};
