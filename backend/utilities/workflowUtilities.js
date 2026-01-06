const getModels = require('../services/getModelService');

// Helper function to evaluate a single condition
function evaluateCondition(condition, event) {
    const value = event[condition.field];
    if (value === undefined) return false;

    switch (condition.operator) {
        // String operators
        case 'equals':
            return value === condition.value;
        case 'notEquals':
            return value !== condition.value;
        case 'contains':
            return value.includes(condition.value);
        case 'notContains':
            return !value.includes(condition.value);
        case 'in':
            return condition.value.includes(value);
        case 'notIn':
            return !condition.value.includes(value);

        // Number operators
        case 'greaterThan':
            return value > condition.value;
        case 'lessThan':
            return value < condition.value;
        case 'greaterThanOrEqual':
            return value >= condition.value;
        case 'lessThanOrEqual':
            return value <= condition.value;

        // Boolean operators
        case 'equals':
            return value === condition.value;
        case 'notEquals':
            return value !== condition.value;

        // Date operators
        case 'before':
            return new Date(value) < new Date(condition.value);
        case 'after':
            return new Date(value) > new Date(condition.value);
        case 'between':
            return new Date(value) >= new Date(condition.value[0]) && 
                   new Date(value) <= new Date(condition.value[1]);

        default:
            return false;
    }
}

// Helper function to evaluate conditions within a group using their logical operators
function evaluateConditions(conditions, operators, event) {
    if (!conditions || conditions.length === 0) {
        return false;
    }

    // If there's only one condition, return its result
    if (conditions.length === 1) {
        return evaluateCondition(conditions[0], event);
    }

    // Evaluate each condition
    const conditionResults = conditions.map(condition => 
        evaluateCondition(condition, event)
    );

    // Combine results using the operators
    let result = conditionResults[0];
    for (let i = 0; i < operators.length; i++) {
        const operator = operators[i];
        const nextResult = conditionResults[i + 1];
        
        if (operator === 'AND') {
            result = result && nextResult;
        } else { // OR
            result = result || nextResult;
        }
    }

    return result;
}

// Helper function to evaluate a condition group
function evaluateConditionGroup(group, event) {
    if (!group || !group.conditions || group.conditions.length === 0) {
        return false;
    }

    return evaluateConditions(group.conditions, group.conditionLogicalOperators, event);
}

// Helper function to evaluate multiple condition groups with their logical operators
function evaluateConditionGroups(groups, operators, event) {
    if (!groups || groups.length === 0) {
        return false;
    }

    // If there's only one group, return its result
    if (groups.length === 1) {
        return evaluateConditionGroup(groups[0], event);
    }

    // Evaluate each group
    const groupResults = groups.map(group => 
        evaluateConditionGroup(group, event)
    );

    // Combine results using the operators
    let result = groupResults[0];
    for (let i = 0; i < operators.length; i++) {
        const operator = operators[i];
        const nextResult = groupResults[i + 1];
        
        if (operator === 'AND') {
            result = result && nextResult;
        } else { // OR
            result = result || nextResult;
        }
    }

    return result;
}

async function getRequiredApprovals(req, event) {
    const { ApprovalFlow } = getModels(req, 'ApprovalFlow');
    const approvalFlow = await ApprovalFlow.findOne();
    
    if (!approvalFlow?.steps) {
        return [];
    }

    const approvals = new Set(); // Use Set to avoid duplicate roles

    for (const step of approvalFlow.steps) {
        // Evaluate all condition groups for this step
        const isApprovalRequired = evaluateConditionGroups(
            step.conditionGroups,
            step.groupLogicalOperators,
            event
        );

        if (isApprovalRequired) {
            approvals.add(step.role);
        }
    }

    return Array.from(approvals);
}

const createApprovalInstance = async (req, eventId, event) => {
    try{
        const { ApprovalInstance } = getModels(req,'ApprovalInstance');
        const approvalInstance = new ApprovalInstance({ eventId });
        const steps = await getRequiredApprovals(req, event);
        console.log("steps", steps);
        if(!steps || steps.length === 0){
            return null;
        }
        steps.forEach(step => {
            approvalInstance.approvals.push({ role: step });
        });
        await approvalInstance.save();
        return approvalInstance;
    } catch(err){
        console.error(err);
        return null;
    }
}

async function getEventsWithAuthorization(req, filterObj = {}, roleNames = [], startOfRange, endOfRange, populateFields = [], skip = 0, limit = 0, sort = {}) {
    try {
        const { Event } = getModels(req, 'Event');

        // log all params
        console.log("startOfRange", startOfRange);
        console.log("endOfRange", endOfRange);
        console.log("filterObj", filterObj);
        console.log("roleNames", roleNames);
        console.log("populateFields", populateFields);
        console.log("skip", skip);
        console.log("limit", limit);
        console.log("sort", sort);

        let matchStage = {
            start_time: { $gte: startOfRange, $lte: endOfRange },
            ...(filterObj?.type !== "all" ? filterObj : {}), 
            isDeleted: false
        };

        //if no roles, only return "approved" or "not applicable" events
        if (!roleNames || roleNames.length === 0) {
            matchStage["status"] = { $in: ["approved", "not-applicable"] };
            let query = Event.find(matchStage);
            if (populateFields.length > 0) {
                populateFields.forEach(field => query.populate(field));
            }
            if (skip) query = query.skip(skip);
            if (limit) query = query.limit(limit);
            if (Object.keys(sort).length > 0) query = query.sort(sort);
            return await query.lean();
        }

        //if roles are provided, allow all statuses, but check role-based approval level
        let pipeline = [
            { $match: matchStage },

            {
                $lookup: {
                    from: "approvalInstances",
                    localField: "approvalReference",
                    foreignField: "_id",
                    as: "approvalData"
                }
            },
            { $unwind: { path: "$approvalData", preserveNullAndEmptyArrays: true } },

            {
                $addFields: {
                    currentApprovalStep: {
                        $arrayElemAt: ["$approvalData.approvals", "$approvalData.currentStepIndex"]
                    }
                }
            },

            {
                $match: {
                    $or: [
                        { "status": { $in: ["approved", "not-applicable"] } },

                        {
                            "status": { $in: ["pending", "rejected"] },
                            "currentApprovalStep.role": { $in: roleNames }
                        }
                    ]
                }
            }
        ];

        // Add sort stage if sort criteria provided
        if (Object.keys(sort).length > 0) {
            pipeline.push({ $sort: sort });
        }

        // Add skip and limit stages if provided
        if (skip) {
            pipeline.push({ $skip: skip });
        }
        if (limit) {
            pipeline.push({ $limit: limit });
        }

        populateFields.forEach(field => {
            if (field === "hostingId") {
                pipeline.push(
                    //dyanmically lookup the correct collection based on hostingType
                    {
                        $lookup: {
                            from: "users",
                            localField: "hostingId",
                            foreignField: "_id",
                            as: "userHost"
                        }
                    },
                    {
                        $lookup: {
                            from: "orgs",
                            localField: "hostingId",
                            foreignField: "_id",
                            as: "orgHost"
                        }
                    },
                    //overwrite hostingId with the correct document
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
                    { $project: { userHost: 0, orgHost: 0 } }
                );
            } else {
                pipeline.push({
                    $lookup: {
                        from: field.toLowerCase() + "s", // Convert to plural collection name
                        localField: field,
                        foreignField: "_id",
                        as: field
                    }
                });
            }
        });

        pipeline.push({
            $project: {
                approvalData: 0,
                currentApprovalStep: 0
            }
        });

        return await Event.aggregate(pipeline);
    } catch (error) {
        console.error("Error fetching events with authorization:", error);
        return [];
    }
}


module.exports = {
    getRequiredApprovals,
    createApprovalInstance,
    getEventsWithAuthorization
} 
