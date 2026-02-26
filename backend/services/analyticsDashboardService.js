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
 * Get platform filter for queries. 'web' = web only, 'mobile' = ios + android.
 * @param {string} [platform] - 'web' | 'mobile' | undefined (all)
 */
function getPlatformFilter(platform) {
    if (!platform || platform === 'all') return {};
    if (platform === 'web') return { platform: 'web' };
    if (platform === 'mobile') return { platform: { $in: ['ios', 'android'] } };
    return {};
}

/**
 * Get overview metrics: unique users, sessions, page views, bounce rate, avg session duration
 * @param {string} [platform] - 'web' | 'mobile' to filter by platform
 */
async function getOverviewMetrics(AnalyticsEvent, timeRange = '30d', platform) {
    const { startDate, endDate } = getTimeRange(timeRange);
    
    // Base match for time range + optional platform filter
    const baseMatch = {
        ts: { $gte: startDate, $lte: endDate },
        env: 'prod', // Only production events for dashboard
        ...getPlatformFilter(platform)
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
    
    // Page views (count of screen_view events - platform uses screen_view, not page_view)
    const pageViewsResult = await AnalyticsEvent.aggregate([
        {
            $match: {
                ...baseMatch,
                event: 'screen_view'
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
    
    // Bounce rate: sessions with only 1 screen_view (single-page sessions)
    const bounceRateResult = await AnalyticsEvent.aggregate([
        {
            $match: {
                ...baseMatch,
                event: 'screen_view'
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
    
    // Web vs Mobile breakdown
    // Unique users by platform type
    const platformUsersResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: {
                    $cond: [
                        { $eq: ['$platform', 'web'] },
                        'web',
                        'mobile'
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
                platform: '$_id',
                uniqueUsers: { $size: '$users' },
                _id: 0
            }
        }
    ]);
    
    const webUsers = platformUsersResult.find(p => p.platform === 'web')?.uniqueUsers || 0;
    const mobileUsers = platformUsersResult.find(p => p.platform === 'mobile')?.uniqueUsers || 0;
    
    // Sessions by platform type
    const platformSessionsResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: {
                    $cond: [
                        { $eq: ['$platform', 'web'] },
                        'web',
                        'mobile'
                    ]
                },
                sessions: { $addToSet: '$session_id' }
            }
        },
        {
            $project: {
                platform: '$_id',
                sessions: { $size: '$sessions' },
                _id: 0
            }
        }
    ]);
    
    const webSessions = platformSessionsResult.find(p => p.platform === 'web')?.sessions || 0;
    const mobileSessions = platformSessionsResult.find(p => p.platform === 'mobile')?.sessions || 0;
    
    // Page views by platform type
    const platformPageViewsResult = await AnalyticsEvent.aggregate([
        {
            $match: {
                ...baseMatch,
                event: 'screen_view'
            }
        },
        {
            $group: {
                _id: {
                    $cond: [
                        { $eq: ['$platform', 'web'] },
                        'web',
                        'mobile'
                    ]
                },
                pageViews: { $sum: 1 }
            }
        },
        {
            $project: {
                platform: '$_id',
                pageViews: 1,
                _id: 0
            }
        }
    ]);
    
    const webPageViews = platformPageViewsResult.find(p => p.platform === 'web')?.pageViews || 0;
    const mobilePageViews = platformPageViewsResult.find(p => p.platform === 'mobile')?.pageViews || 0;
    
    const result = {
        uniqueUsers,
        sessions,
        pageViews,
        bounceRate: Math.round(bounceRate * 100) / 100, // Round to 2 decimals
        avgSessionDuration: Math.round(avgSessionDurationSeconds)
    };
    // Only include web/mobile breakdown when not filtering by platform
    if (!platform) {
        result.web = { uniqueUsers: webUsers, sessions: webSessions, pageViews: webPageViews };
        result.mobile = { uniqueUsers: mobileUsers, sessions: mobileSessions, pageViews: mobilePageViews };
    }
    return result;
}

/**
 * Get realtime metrics (last 60 minutes)
 * @param {string} [platform] - 'web' | 'mobile' to filter by platform
 */
async function getRealtimeMetrics(AnalyticsEvent, platform) {
    const now = new Date();
    const startDate = new Date(now.getTime() - 60 * 60 * 1000); // Last 60 minutes
    
    const baseMatch = {
        ts: { $gte: startDate, $lte: now },
        env: 'prod',
        ...getPlatformFilter(platform)
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
                event: 'screen_view'
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
    
    // Web vs Mobile breakdown for realtime
    const platformRealtimeResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $group: {
                _id: {
                    $cond: [
                        { $eq: ['$platform', 'web'] },
                        'web',
                        'mobile'
                    ]
                },
                activeUsers: {
                    $addToSet: {
                        $cond: [
                            { $ne: ['$user_id', null] },
                            '$user_id',
                            '$anonymous_id'
                        ]
                    }
                },
                pageViews: {
                    $sum: {
                        $cond: [
                            { $eq: ['$event', 'screen_view'] },
                            1,
                            0
                        ]
                    }
                }
            }
        },
        {
            $project: {
                platform: '$_id',
                activeUsers: { $size: '$activeUsers' },
                pageViews: 1,
                _id: 0
            }
        }
    ]);
    
    const webRealtime = platformRealtimeResult.find(p => p.platform === 'web') || { activeUsers: 0, pageViews: 0 };
    const mobileRealtime = platformRealtimeResult.find(p => p.platform === 'mobile') || { activeUsers: 0, pageViews: 0 };
    
    // Top pages right now (last 15 minutes for "right now") - use screen_view with context.screen
    const recentStartDate = new Date(now.getTime() - 15 * 60 * 1000);
    const topPagesResult = await AnalyticsEvent.aggregate([
        {
            $match: {
                ts: { $gte: recentStartDate, $lte: now },
                event: 'screen_view',
                env: 'prod',
                ...getPlatformFilter(platform)
            }
        },
        {
            $project: {
                path: {
                    $ifNull: [
                        '$context.screen',
                        '$properties.path',
                        '$context.route',
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
                env: 'prod',
                ...getPlatformFilter(platform)
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
    
    const result = {
        activeUsers,
        pageViews,
        topPages: topPagesResult,
        liveEvents: liveEventsResult
    };
    if (!platform) {
        result.web = { activeUsers: webRealtime.activeUsers, pageViews: webRealtime.pageViews };
        result.mobile = { activeUsers: mobileRealtime.activeUsers, pageViews: mobileRealtime.pageViews };
    }
    return result;
}

/**
 * Get top pages with views, entrances, exits, exit rate
 * @param {string} [platform] - 'web' | 'mobile' to filter by platform
 */
async function getTopPages(AnalyticsEvent, timeRange = '30d', limit = 20, platform) {
    const { startDate, endDate } = getTimeRange(timeRange);
    
    const baseMatch = {
        ts: { $gte: startDate, $lte: endDate },
        event: 'screen_view',
        env: 'prod',
        ...getPlatformFilter(platform)
    };
    
    // Get all page views grouped by screen name (context.screen for screen_view events)
    const pagesResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $project: {
                path: {
                    $ifNull: [
                        '$context.screen',
                        '$properties.path',
                        '$context.route',
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
    
    // Calculate entrances (first screen_view in each session)
    const entrancesResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $project: {
                session_id: 1,
                ts: 1,
                path: {
                    $ifNull: [
                        '$context.screen',
                        '$properties.path',
                        '$context.route',
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
    
    // Calculate exits (last screen_view in each session)
    const exitsResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        {
            $project: {
                session_id: 1,
                ts: 1,
                path: {
                    $ifNull: [
                        '$context.screen',
                        '$properties.path',
                        '$context.route',
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
 * Get screen views by page: screen_view events grouped by screen name, ranked highest to lowest.
 * Uses context.screen from analytics.screen('Screen Name', ...) per analytics-collected-events.
 * @param {string} [platform] - 'web' | 'mobile' to filter by platform
 */
async function getScreenViews(AnalyticsEvent, timeRange = '30d', limit = 30, platform) {
    const { startDate, endDate } = getTimeRange(timeRange);
    
    const screenViewsResult = await AnalyticsEvent.aggregate([
        {
            $match: {
                ts: { $gte: startDate, $lte: endDate },
                event: 'screen_view',
                env: 'prod',
                ...getPlatformFilter(platform)
            }
        },
        {
            $group: {
                _id: { $ifNull: ['$context.screen', 'Unknown'] },
                views: { $sum: 1 }
            }
        },
        {
            $sort: { views: -1 }
        },
        {
            $limit: limit
        },
        {
            $project: {
                screen: '$_id',
                views: 1,
                _id: 0
            }
        }
    ]);
    
    return screenViewsResult;
}

/**
 * Get traffic sources: views and sessions by source
 * @param {string} [platform] - 'web' | 'mobile' to filter by platform
 */
async function getTrafficSources(AnalyticsEvent, timeRange = '30d', platform) {
    const { startDate, endDate } = getTimeRange(timeRange);
    
    const baseMatch = {
        ts: { $gte: startDate, $lte: endDate },
        event: 'screen_view',
        env: 'prod',
        ...getPlatformFilter(platform)
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
 * @param {string} [platform] - 'web' | 'mobile' to filter by platform
 */
async function getLocations(AnalyticsEvent, timeRange = '30d', platform) {
    const { startDate, endDate } = getTimeRange(timeRange);
    
    const baseMatch = {
        ts: { $gte: startDate, $lte: endDate },
        env: 'prod',
        ...getPlatformFilter(platform)
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
 * @param {string} [platform] - 'web' | 'mobile' to filter by platform
 */
async function getDevicesAndPlatforms(AnalyticsEvent, timeRange = '30d', platform) {
    const { startDate, endDate } = getTimeRange(timeRange);
    
    const baseMatch = {
        ts: { $gte: startDate, $lte: endDate },
        env: 'prod',
        ...getPlatformFilter(platform)
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
 * @param {string} [platform] - 'web' | 'mobile' to filter by platform
 */
async function getEventsOverview(AnalyticsEvent, timeRange = '30d', platform) {
    const { startDate, endDate } = getTimeRange(timeRange);
    
    const baseMatch = {
        ts: { $gte: startDate, $lte: endDate },
        env: 'prod',
        ...getPlatformFilter(platform)
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

/**
 * Get user journey path exploration: next steps from a starting point (GA4 Path Exploration style).
 * Returns tree of nodes: starting point -> step 1 -> step 2 -> ...
 * @param {Object} AnalyticsEvent - Mongoose model
 * @param {string} [timeRange='30d'] - Time range
 * @param {string} [platform] - 'web' | 'mobile'
 * @param {string} [startingPoint] - Screen name or event name to start from (e.g. 'Landing', 'Explore')
 * @param {number} [maxSteps=3] - Max depth of path
 * @param {number} [nodesPerStep=5] - Top N nodes per step
 */
async function getUserJourneyPaths(AnalyticsEvent, timeRange = '30d', platform, startingPoint, maxSteps = 3, nodesPerStep = 5) {
    const { startDate, endDate } = getTimeRange(timeRange);
    const baseMatch = {
        ts: { $gte: startDate, $lte: endDate },
        env: 'prod',
        ...getPlatformFilter(platform)
    };

    // If no starting point, use top entrance screen
    let start = startingPoint;
    if (!start) {
        const entrancesResult = await AnalyticsEvent.aggregate([
            { $match: { ...baseMatch, event: 'screen_view' } },
            { $project: { session_id: 1, ts: 1, screen: { $ifNull: ['$context.screen', 'Unknown'] } } },
            { $sort: { session_id: 1, ts: 1 } },
            { $group: { _id: '$session_id', firstScreen: { $first: '$screen' } } },
            { $group: { _id: '$firstScreen', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 1 }
        ]);
        start = entrancesResult[0]?._id || 'Landing';
    }

    const pathData = { startingPoint: start, steps: [] };

    const startMatch = {
        ...baseMatch,
        $or: [
            { event: 'screen_view', 'context.screen': start },
            { event: start }
        ]
    };
    const startCount = await AnalyticsEvent.countDocuments(startMatch);
    pathData.steps.push({ step: 0, nodes: [{ label: start, count: startCount }] });

    let prevSessions = await AnalyticsEvent.distinct('session_id', startMatch);
    let pathSoFar = [start]; // Nodes we're "coming from" for this step

    for (let currentStep = 1; currentStep <= maxSteps && prevSessions.length > 0; currentStep++) {
        const sessionsWithStream = await AnalyticsEvent.aggregate([
            { $match: { ...baseMatch, session_id: { $in: prevSessions } } },
            { $sort: { session_id: 1, ts: 1 } },
            {
                $group: {
                    _id: '$session_id',
                    stream: {
                        $push: {
                            label: {
                                $cond: {
                                    if: { $eq: ['$event', 'screen_view'] },
                                    then: { $ifNull: ['$context.screen', 'Unknown'] },
                                    else: '$event'
                                }
                            }
                        }
                    }
                }
            }
        ]);

        const nextLabels = {};

        for (const s of sessionsWithStream) {
            const stream = s.stream.map(x => x.label);
            // Find the last index where user was at any of the path-so-far nodes
            let lastReachedIdx = -1;
            for (const pathNode of pathSoFar) {
                const idx = stream.indexOf(pathNode, lastReachedIdx + 1);
                if (idx > lastReachedIdx) lastReachedIdx = idx;
            }
            if (lastReachedIdx < 0) continue;

            const afterStep = stream.slice(lastReachedIdx + 1);
            const seen = new Set(pathSoFar);
            for (const lbl of afterStep) {
                if (!seen.has(lbl)) {
                    seen.add(lbl);
                    nextLabels[lbl] = (nextLabels[lbl] || 0) + 1;
                    break;
                }
            }
        }

        const sorted = Object.entries(nextLabels)
            .sort((a, b) => b[1] - a[1])
            .slice(0, nodesPerStep)
            .map(([label, count]) => ({ label, count }));

        if (sorted.length === 0) break;

        pathData.steps.push({ step: currentStep, nodes: sorted });

        // For next iteration: pathSoFar = top nodes at this step (where we're "coming from")
        // prevSessions = sessions that reached any of those nodes
        const topNodeLabels = sorted.map(n => n.label);
        pathSoFar = topNodeLabels;

        prevSessions = [];
        for (const s of sessionsWithStream) {
            const stream = s.stream.map(x => x.label);
            for (const topLabel of topNodeLabels) {
                if (stream.includes(topLabel)) {
                    prevSessions.push(s._id);
                    break;
                }
            }
        }
    }

    return { path: pathData, paths: [pathData], timeRange, startingPoint: start };
}

/**
 * Get funnel analysis: conversion through predefined steps (GA4 Funnel Exploration style).
 * Steps are screen names or event names. Users must complete in sequence (closed funnel).
 * @param {Object} AnalyticsEvent - Mongoose model
 * @param {string} [timeRange='30d'] - Time range
 * @param {string} [platform] - 'web' | 'mobile'
 * @param {string[]} [steps] - Funnel steps e.g. ['Landing', 'Explore', 'Event Page', 'event_registration']
 */
async function getFunnelAnalysis(AnalyticsEvent, timeRange = '30d', platform, steps = ['Landing', 'Explore', 'Event Page', 'event_registration']) {
    const { startDate, endDate } = getTimeRange(timeRange);
    const baseMatch = {
        ts: { $gte: startDate, $lte: endDate },
        env: 'prod',
        ...getPlatformFilter(platform)
    };

    // Get all sessions with their ordered event stream (screen_view screens + key events)
    const sessionsStream = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        { $sort: { session_id: 1, ts: 1 } },
        {
            $group: {
                _id: '$session_id',
                stream: {
                    $push: {
                        label: {
                            $cond: {
                                if: { $eq: ['$event', 'screen_view'] },
                                then: { $ifNull: ['$context.screen', 'Unknown'] },
                                else: '$event'
                            }
                        },
                        ts: '$ts'
                    }
                }
            }
        },
        { $project: { session_id: '$_id', stream: 1, _id: 0 } }
    ]);

    const funnelResults = steps.map((step, idx) => ({ step, index: idx, count: 0, dropOff: 0 }));

    for (const s of sessionsStream) {
        const stream = s.stream.map(x => x.label);
        let lastReachedIndex = -1;
        for (let i = 0; i < steps.length; i++) {
            const stepLabel = steps[i];
            const idx = stream.indexOf(stepLabel);
            if (idx >= 0 && idx > lastReachedIndex) {
                lastReachedIndex = idx;
                funnelResults[i].count++;
            }
        }
    }

    // For closed funnel: only count users who entered at step 0 and progressed in order
    const closedFunnelCounts = steps.map(() => 0);
    for (const s of sessionsStream) {
        const stream = s.stream.map(x => x.label);
        let nextExpectedIndex = 0;
        for (const lbl of stream) {
            if (lbl === steps[nextExpectedIndex]) {
                closedFunnelCounts[nextExpectedIndex]++;
                nextExpectedIndex++;
                if (nextExpectedIndex >= steps.length) break;
            }
        }
    }

    const funnelSteps = steps.map((step, idx) => ({
        step,
        index: idx + 1,
        count: closedFunnelCounts[idx],
        conversionRate: idx === 0 ? 100 : (closedFunnelCounts[idx] / closedFunnelCounts[0]) * 100,
        dropOff: idx === 0 ? 0 : closedFunnelCounts[idx - 1] - closedFunnelCounts[idx]
    }));

    return {
        steps: funnelSteps,
        totalEntered: closedFunnelCounts[0],
        totalConverted: closedFunnelCounts[closedFunnelCounts.length - 1],
        overallConversionRate: closedFunnelCounts[0] > 0
            ? (closedFunnelCounts[closedFunnelCounts.length - 1] / closedFunnelCounts[0]) * 100
            : 0,
        timeRange
    };
}

/**
 * Get available starting points (top screens/events) for path exploration
 */
async function getPathStartingPoints(AnalyticsEvent, timeRange = '30d', platform, limit = 20) {
    const { startDate, endDate } = getTimeRange(timeRange);
    const baseMatch = {
        ts: { $gte: startDate, $lte: endDate },
        env: 'prod',
        ...getPlatformFilter(platform)
    };

    const screensResult = await AnalyticsEvent.aggregate([
        { $match: { ...baseMatch, event: 'screen_view' } },
        { $group: { _id: { $ifNull: ['$context.screen', 'Unknown'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit },
        { $project: { label: '$_id', count: 1, type: 'screen', _id: 0 } }
    ]);

    const eventsResult = await AnalyticsEvent.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$event', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: { label: '$_id', count: 1, type: 'event', _id: 0 } }
    ]);

    return {
        screens: screensResult,
        events: eventsResult,
        timeRange
    };
}

module.exports = {
    getOverviewMetrics,
    getRealtimeMetrics,
    getTopPages,
    getScreenViews,
    getTrafficSources,
    getLocations,
    getDevicesAndPlatforms,
    getEventsOverview,
    getUserJourneyPaths,
    getFunnelAnalysis,
    getPathStartingPoints,
    getTimeRange
};

