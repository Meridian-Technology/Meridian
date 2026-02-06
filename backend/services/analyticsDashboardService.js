/**
 * Analytics Dashboard Service
 * 
 * Aggregation functions for platform analytics dashboard.
 * Queries the analytics_events collection (new platform analytics system).
 */

/**
 * Calculate time range dates from query parameter
 */
function getTimeRange(timeRange = '30d') {
    const now = new Date();
    let startDate;
    
    switch (timeRange) {
        case '1h':
            startDate = new Date(now.getTime() - 60 * 60 * 1000);
            break;
        case '24h':
        case '1d':
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
        case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        case '90d':
            startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
        default:
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    
    return { startDate, endDate: now };
}

/**
 * Get overview metrics: unique users, sessions, page views, bounce rate, avg session duration
 */
async function getOverviewMetrics(AnalyticsEvent, timeRange = '30d') {
    const { startDate, endDate } = getTimeRange(timeRange);
    
    // Base match for time range
    const baseMatch = {
        ts: { $gte: startDate, $lte: endDate },
        env: 'prod' // Only production events for dashboard
    };
    
    // Unique users (distinct user_id + anonymous_id)
    const uniqueUsersResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: null,
                authenticatedUsers: { $addToSet: '$user_id' },
                anonymousUsers: { $addToSet: '$anonymous_id' }
            }
        },
        {
            $project: {
                uniqueUsers: {
                    $size: {
                        $setUnion: [
                            { $filter: { input: '$authenticatedUsers', cond: { $ne: ['$$this', null] } } },
                            '$anonymousUsers'
                        ]
                    }
                }
            }
        }
    ]);
    
    const uniqueUsers = uniqueUsersResult[0]?.uniqueUsers || 0;
    
    // Sessions (distinct session_id)
    const sessionsResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: null,
                sessions: { $addToSet: '$session_id' }
            }
        },
        {
            $project: {
                sessionCount: { $size: '$sessions' }
            }
        }
    ]);
    
    const sessions = sessionsResult[0]?.sessionCount || 0;
    
    // Page views (count of page_view events)
    const pageViewsResult = await AnalyticsEvent.aggregate([
        {
            $match: {
                ...baseMatch,
                event: 'page_view'
            }
        },
        {
            $group: {
                _id: null,
                pageViews: { $sum: 1 }
            }
        }
    ]);
    
    const pageViews = pageViewsResult[0]?.pageViews || 0;
    
    // Bounce rate: sessions with only 1 page_view
    const bounceRateResult = await AnalyticsEvent.aggregate([
        {
            $match: {
                ...baseMatch,
                event: 'page_view'
            }
        },
        {
            $group: {
                _id: '$session_id',
                pageViewCount: { $sum: 1 }
            }
        },
        {
            $group: {
                _id: null,
                totalSessions: { $sum: 1 },
                bouncedSessions: {
                    $sum: {
                        $cond: [{ $eq: ['$pageViewCount', 1] }, 1, 0]
                    }
                }
            }
        },
        {
            $project: {
                bounceRate: {
                    $cond: [
                        { $eq: ['$totalSessions', 0] },
                        0,
                        {
                            $multiply: [
                                { $divide: ['$bouncedSessions', '$totalSessions'] },
                                100
                            ]
                        }
                    ]
                }
            }
        }
    ]);
    
    const bounceRate = bounceRateResult[0]?.bounceRate || 0;
    
    // Average session duration: time between first and last event per session
    const sessionDurationResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: '$session_id',
                firstEvent: { $min: '$ts' },
                lastEvent: { $max: '$ts' }
            }
        },
        {
            $project: {
                duration: {
                    $subtract: ['$lastEvent', '$firstEvent']
                }
            }
        },
        {
            $group: {
                _id: null,
                avgDuration: { $avg: '$duration' },
                sessionCount: { $sum: 1 }
            }
        },
        {
            $project: {
                avgDurationMs: '$avgDuration',
                avgDurationSeconds: {
                    $divide: ['$avgDuration', 1000]
                }
            }
        }
    ]);
    
    const avgSessionDurationSeconds = sessionDurationResult[0]?.avgDurationSeconds || 0;
    
    return {
        uniqueUsers,
        sessions,
        pageViews,
        bounceRate: Math.round(bounceRate * 100) / 100, // Round to 2 decimals
        avgSessionDuration: Math.round(avgSessionDurationSeconds)
    };
}

/**
 * Get realtime metrics (last 60 minutes)
 */
async function getRealtimeMetrics(AnalyticsEvent) {
    const now = new Date();
    const startDate = new Date(now.getTime() - 60 * 60 * 1000); // Last 60 minutes
    
    const baseMatch = {
        ts: { $gte: startDate, $lte: now },
        env: 'prod'
    };
    
    // Active users (last hour)
    const activeUsersResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: null,
                authenticatedUsers: { $addToSet: '$user_id' },
                anonymousUsers: { $addToSet: '$anonymous_id' }
            }
        },
        {
            $project: {
                activeUsers: {
                    $size: {
                        $setUnion: [
                            { $filter: { input: '$authenticatedUsers', cond: { $ne: ['$$this', null] } } },
                            '$anonymousUsers'
                        ]
                    }
                }
            }
        }
    ]);
    
    const activeUsers = activeUsersResult[0]?.activeUsers || 0;
    
    // Page views (last hour)
    const pageViewsResult = await AnalyticsEvent.aggregate([
        {
            $match: {
                ...baseMatch,
                event: 'page_view'
            }
        },
        {
            $group: {
                _id: null,
                pageViews: { $sum: 1 }
            }
        }
    ]);
    
    const pageViews = pageViewsResult[0]?.pageViews || 0;
    
    // Top pages right now (last 15 minutes for "right now")
    const recentStartDate = new Date(now.getTime() - 15 * 60 * 1000);
    const topPagesResult = await AnalyticsEvent.aggregate([
        {
            $match: {
                ts: { $gte: recentStartDate, $lte: now },
                event: 'page_view',
                env: 'prod'
            }
        },
        {
            $project: {
                path: {
                    $ifNull: [
                        '$properties.path',
                        '$context.route',
                        '$context.screen',
                        'Unknown'
                    ]
                }
            }
        },
        {
            $group: {
                _id: '$path',
                views: { $sum: 1 }
            }
        },
        {
            $sort: { views: -1 }
        },
        {
            $limit: 10
        },
        {
            $project: {
                path: { $ifNull: ['$_id', 'Unknown'] },
                views: 1,
                _id: 0
            }
        }
    ]);
    
    // Live events firing (last 5 minutes)
    const liveStartDate = new Date(now.getTime() - 5 * 60 * 1000);
    const liveEventsResult = await AnalyticsEvent.aggregate([
        {
            $match: {
                ts: { $gte: liveStartDate, $lte: now },
                env: 'prod'
            }
        },
        {
            $group: {
                _id: '$event',
                count: { $sum: 1 }
            }
        },
        {
            $sort: { count: -1 }
        },
        {
            $limit: 20
        },
        {
            $project: {
                event: '$_id',
                count: 1,
                _id: 0
            }
        }
    ]);
    
    return {
        activeUsers,
        pageViews,
        topPages: topPagesResult,
        liveEvents: liveEventsResult
    };
}

/**
 * Get top pages with views, entrances, exits, exit rate
 */
async function getTopPages(AnalyticsEvent, timeRange = '30d', limit = 20) {
    const { startDate, endDate } = getTimeRange(timeRange);
    
    const baseMatch = {
        ts: { $gte: startDate, $lte: endDate },
        event: 'page_view',
        env: 'prod'
    };
    
    // Get all page views grouped by path
    const pagesResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $project: {
                path: {
                    $ifNull: [
                        '$properties.path',
                        '$context.route',
                        '$context.screen',
                        'Unknown'
                    ]
                },
                session_id: 1
            }
        },
        {
            $group: {
                _id: '$path',
                views: { $sum: 1 },
                sessions: { $addToSet: '$session_id' }
            }
        },
        {
            $project: {
                path: { $ifNull: ['$_id', 'Unknown'] },
                views: 1,
                uniqueSessions: { $size: '$sessions' },
                _id: 0
            }
        },
        {
            $sort: { views: -1 }
        },
        {
            $limit: limit
        }
    ]);
    
    // Calculate entrances (first page_view in each session)
    const entrancesResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $project: {
                session_id: 1,
                ts: 1,
                path: {
                    $ifNull: [
                        '$properties.path',
                        '$context.route',
                        '$context.screen',
                        'Unknown'
                    ]
                }
            }
        },
        {
            $sort: { session_id: 1, ts: 1 }
        },
        {
            $group: {
                _id: '$session_id',
                firstPage: { $first: '$path' }
            }
        },
        {
            $group: {
                _id: '$firstPage',
                entrances: { $sum: 1 }
            }
        }
    ]);
    
    const entrancesMap = {};
    entrancesResult.forEach(item => {
        entrancesMap[item._id || 'Unknown'] = item.entrances;
    });
    
    // Calculate exits (last page_view in each session)
    const exitsResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $project: {
                session_id: 1,
                ts: 1,
                path: {
                    $ifNull: [
                        '$properties.path',
                        '$context.route',
                        '$context.screen',
                        'Unknown'
                    ]
                }
            }
        },
        {
            $sort: { session_id: 1, ts: -1 }
        },
        {
            $group: {
                _id: '$session_id',
                lastPage: { $first: '$path' }
            }
        },
        {
            $group: {
                _id: '$lastPage',
                exits: { $sum: 1 }
            }
        }
    ]);
    
    const exitsMap = {};
    exitsResult.forEach(item => {
        exitsMap[item._id || 'Unknown'] = item.exits;
    });
    
    // Combine results
    const topPages = pagesResult.map(page => {
        const path = page.path;
        const entrances = entrancesMap[path] || 0;
        const exits = exitsMap[path] || 0;
        const exitRate = page.views > 0 ? (exits / page.views) * 100 : 0;
        
        return {
            path,
            views: page.views,
            entrances,
            exits,
            exitRate: Math.round(exitRate * 100) / 100
        };
    });
    
    return topPages;
}

/**
 * Get traffic sources: views and sessions by source
 */
async function getTrafficSources(AnalyticsEvent, timeRange = '30d') {
    const { startDate, endDate } = getTimeRange(timeRange);
    
    const baseMatch = {
        ts: { $gte: startDate, $lte: endDate },
        event: 'page_view',
        env: 'prod'
    };
    
    // Group by referrer/source
    const sourcesResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: {
                    $ifNull: ['$context.referrer', 'direct']
                },
                views: { $sum: 1 },
                sessions: { $addToSet: '$session_id' }
            }
        },
        {
            $project: {
                source: '$_id',
                views: 1,
                sessions: { $size: '$sessions' },
                _id: 0
            }
        },
        {
            $sort: { views: -1 }
        }
    ]);
    
    return sourcesResult;
}

/**
 * Get locations: users by country/region/city
 */
async function getLocations(AnalyticsEvent, timeRange = '30d') {
    const { startDate, endDate } = getTimeRange(timeRange);
    
    const baseMatch = {
        ts: { $gte: startDate, $lte: endDate },
        env: 'prod'
    };
    
    // Group by location (assuming location data in properties or context)
    // Note: This assumes location data is available. If not, we'll use IP-based geolocation
    // For now, we'll use a placeholder structure
    const locationsResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: {
                    country: { $ifNull: ['$properties.country', 'Unknown'] },
                    region: { $ifNull: ['$properties.region', 'Unknown'] },
                    city: { $ifNull: ['$properties.city', 'Unknown'] }
                },
                users: {
                    $addToSet: {
                        $cond: [
                            { $ne: ['$user_id', null] },
                            '$user_id',
                            '$anonymous_id'
                        ]
                    }
                }
            }
        },
        {
            $project: {
                country: '$_id.country',
                region: '$_id.region',
                city: '$_id.city',
                users: { $size: '$users' },
                _id: 0
            }
        },
        {
            $sort: { users: -1 }
        },
        {
            $limit: 50
        }
    ]);
    
    return locationsResult;
}

/**
 * Get devices & platforms: users by device, OS, browser, mobile vs desktop
 */
async function getDevicesAndPlatforms(AnalyticsEvent, timeRange = '30d') {
    const { startDate, endDate } = getTimeRange(timeRange);
    
    const baseMatch = {
        ts: { $gte: startDate, $lte: endDate },
        env: 'prod'
    };
    
    // By platform (ios, android, web)
    const platformsResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: '$platform',
                users: {
                    $addToSet: {
                        $cond: [
                            { $ne: ['$user_id', null] },
                            '$user_id',
                            '$anonymous_id'
                        ]
                    }
                }
            }
        },
        {
            $project: {
                platform: '$_id',
                users: { $size: '$users' },
                _id: 0
            }
        },
        {
            $sort: { users: -1 }
        }
    ]);
    
    // By device model
    const devicesResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: {
                    $ifNull: ['$context.device_model', 'Unknown']
                },
                users: {
                    $addToSet: {
                        $cond: [
                            { $ne: ['$user_id', null] },
                            '$user_id',
                            '$anonymous_id'
                        ]
                    }
                }
            }
        },
        {
            $project: {
                device: '$_id',
                users: { $size: '$users' },
                _id: 0
            }
        },
        {
            $sort: { users: -1 }
        },
        {
            $limit: 20
        }
    ]);
    
    // By OS version
    const osResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: {
                    $ifNull: ['$context.os_version', 'Unknown']
                },
                users: {
                    $addToSet: {
                        $cond: [
                            { $ne: ['$user_id', null] },
                            '$user_id',
                            '$anonymous_id'
                        ]
                    }
                }
            }
        },
        {
            $project: {
                os: '$_id',
                users: { $size: '$users' },
                _id: 0
            }
        },
        {
            $sort: { users: -1 }
        },
        {
            $limit: 20
        }
    ]);
    
    // By browser (from user_agent_summary)
    const browsersResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: {
                    $ifNull: ['$user_agent_summary', 'Unknown']
                },
                users: {
                    $addToSet: {
                        $cond: [
                            { $ne: ['$user_id', null] },
                            '$user_id',
                            '$anonymous_id'
                        ]
                    }
                }
            }
        },
        {
            $project: {
                browser: '$_id',
                users: { $size: '$users' },
                _id: 0
            }
        },
        {
            $sort: { users: -1 }
        },
        {
            $limit: 20
        }
    ]);
    
    // Mobile vs Desktop
    const deviceTypeResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: {
                    $cond: [
                        { $in: ['$platform', ['ios', 'android']] },
                        'mobile',
                        'desktop'
                    ]
                },
                users: {
                    $addToSet: {
                        $cond: [
                            { $ne: ['$user_id', null] },
                            '$user_id',
                            '$anonymous_id'
                        ]
                    }
                }
            }
        },
        {
            $project: {
                type: '$_id',
                users: { $size: '$users' },
                _id: 0
            }
        }
    ]);
    
    return {
        platforms: platformsResult,
        devices: devicesResult,
        os: osResult,
        browsers: browsersResult,
        deviceTypes: deviceTypeResult
    };
}

/**
 * Get events overview: top events, event frequency, events per session
 */
async function getEventsOverview(AnalyticsEvent, timeRange = '30d') {
    const { startDate, endDate } = getTimeRange(timeRange);
    
    const baseMatch = {
        ts: { $gte: startDate, $lte: endDate },
        env: 'prod'
    };
    
    // Top events
    const topEventsResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: '$event',
                count: { $sum: 1 },
                uniqueSessions: { $addToSet: '$session_id' }
            }
        },
        {
            $project: {
                event: '$_id',
                count: 1,
                uniqueSessions: { $size: '$uniqueSessions' },
                _id: 0
            }
        },
        {
            $sort: { count: -1 }
        },
        {
            $limit: 30
        }
    ]);
    
    // Events per session
    const eventsPerSessionResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: '$session_id',
                eventCount: { $sum: 1 }
            }
        },
        {
            $group: {
                _id: null,
                avgEventsPerSession: { $avg: '$eventCount' },
                totalSessions: { $sum: 1 }
            }
        },
        {
            $project: {
                avgEventsPerSession: { $round: ['$avgEventsPerSession', 2] },
                totalSessions: 1,
                _id: 0
            }
        }
    ]);
    
    return {
        topEvents: topEventsResult,
        eventsPerSession: eventsPerSessionResult[0] || {
            avgEventsPerSession: 0,
            totalSessions: 0
        }
    };
}

module.exports = {
    getOverviewMetrics,
    getRealtimeMetrics,
    getTopPages,
    getTrafficSources,
    getLocations,
    getDevicesAndPlatforms,
    getEventsOverview,
    getTimeRange
};

