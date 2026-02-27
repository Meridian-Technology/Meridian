const getModels = require('./getModelService');

/**
 * Build a Mongoose query from a filter DSL.
 * DSL shape: { logic: 'AND'|'OR', conditions: [{ field, op, value }, ...] }
 * Supported ops: eq, ne, in, nin, gt, gte, lt, lte, exists, regex
 * Field paths map to User schema (e.g. studentProfile.major, studentProfile.graduationYear).
 */
function buildQueryFromFilter(filterDefinition) {
    if (!filterDefinition || !filterDefinition.conditions || !Array.isArray(filterDefinition.conditions)) {
        return {};
    }
    const logic = (filterDefinition.logic || 'AND').toUpperCase();
    const conditions = filterDefinition.conditions.filter(c => c && c.field != null);
    if (conditions.length === 0) return {};

    const mongoOps = {
        eq: (v) => v,
        ne: (v) => ({ $ne: v }),
        in: (v) => ({ $in: Array.isArray(v) ? v : [v] }),
        nin: (v) => ({ $nin: Array.isArray(v) ? v : [v] }),
        gt: (v) => ({ $gt: v }),
        gte: (v) => ({ $gte: v }),
        lt: (v) => ({ $lt: v }),
        lte: (v) => ({ $lte: v }),
        exists: (v) => ({ $exists: Boolean(v) }),
        regex: (v) => (typeof v === 'string' ? { $regex: v, $options: 'i' } : v)
    };

    const clauses = conditions.map((c) => {
        const op = (c.op || 'eq').toLowerCase();
        const handler = mongoOps[op];
        if (!handler) return null;
        let expr = handler(c.value);
        if (op === 'eq' && typeof expr !== 'object') {
            expr = expr == null ? { $in: [null, ''] } : expr;
        }
        return { [c.field]: expr };
    }).filter(Boolean);

    if (clauses.length === 0) return {};
    if (logic === 'OR') {
        return { $or: clauses };
    }
    return { $and: clauses };
}

/**
 * Resolve audience: get user IDs and optionally count/sample matching the filter.
 * Uses getModels(req, 'User') for tenant-safe queries.
 * @param {object} req - Express request (must have req.db)
 * @param {object} filterDefinition - DSL { logic, conditions }
 * @param {object} options - { preview: boolean, limit?: number, skip?: number }
 * @returns {Promise<{ userIds: ObjectId[], total?: number, sample?: User[] }>}
 */
async function resolveAudience(req, filterDefinition, options = {}) {
    const { User } = getModels(req, 'User');
    const query = buildQueryFromFilter(filterDefinition);

    if (options.preview) {
        const limit = Math.min(options.limit ?? 10, 100);
        const [sample, total] = await Promise.all([
            User.find(query).select('_id name email studentProfile').limit(limit).lean(),
            User.countDocuments(query)
        ]);
        return {
            userIds: sample.map((u) => u._id),
            total,
            sample
        };
    }

    const limit = options.limit ?? 10000;
    const skip = options.skip ?? 0;
    const cursor = User.find(query).select('_id').skip(skip).limit(limit).lean();
    const docs = await cursor.exec();
    const userIds = docs.map((d) => d._id);
    const total = await User.countDocuments(query);
    return { userIds, total };
}

/**
 * Get matching user IDs in batches (for large audiences). Yields batches of userIds.
 * @param {object} req
 * @param {object} filterDefinition
 * @param {number} batchSize
 */
async function* resolveAudienceBatched(req, filterDefinition, batchSize = 500) {
    const { User } = getModels(req, 'User');
    const query = buildQueryFromFilter(filterDefinition);
    let skip = 0;
    let hasMore = true;
    while (hasMore) {
        const docs = await User.find(query).select('_id').skip(skip).limit(batchSize).lean();
        const userIds = docs.map((d) => d._id);
        if (userIds.length === 0) break;
        yield userIds;
        skip += batchSize;
        if (docs.length < batchSize) hasMore = false;
    }
}

module.exports = {
    buildQueryFromFilter,
    resolveAudience,
    resolveAudienceBatched
};
