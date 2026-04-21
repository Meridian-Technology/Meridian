/**
 * Build admin outreach filterDefinition for POST /admin/outreach/audiences/preview
 * and POST /admin/outreach/messages (inline audience).
 * Matches backend studentTargetingService DSL.
 */

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {object} fields
 * @param {string} [fields.major]
 * @param {string} [fields.graduationYear]
 * @param {string} [fields.programType]
 * @param {string} [fields.enrollmentStatus]
 * @returns {{ logic: string, conditions: object[] } | null} null if no conditions
 */
export function buildStudentFilterFromFields(fields) {
    const conditions = [];
    const major = (fields.major || '').trim();
    if (major) {
        conditions.push({
            field: 'studentProfile.major',
            op: 'regex',
            value: escapeRegex(major),
        });
    }
    const gy = (fields.graduationYear || '').trim();
    if (gy) {
        const n = parseInt(gy, 10);
        if (!Number.isNaN(n)) {
            conditions.push({ field: 'studentProfile.graduationYear', op: 'eq', value: n });
        }
    }
    const programType = (fields.programType || '').trim();
    if (programType) {
        conditions.push({ field: 'studentProfile.programType', op: 'eq', value: programType });
    }
    const enrollmentStatus = (fields.enrollmentStatus || '').trim();
    if (enrollmentStatus) {
        conditions.push({
            field: 'studentProfile.enrollmentStatus',
            op: 'eq',
            value: enrollmentStatus,
        });
    }
    if (conditions.length === 0) return null;
    return { logic: 'AND', conditions };
}
