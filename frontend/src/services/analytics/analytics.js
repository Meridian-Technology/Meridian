import axios from 'axios';
import { getReferrerPath } from '../../utils/referrerContext';

// Storage keys
const STORAGE_KEYS = {
    ANONYMOUS_ID: '@meridian/analytics/anonymous_id',
    SESSION_ID: '@meridian/analytics/session_id',
    SESSION_START: '@meridian/analytics/session_start',
    QUEUE: '@meridian/analytics/queue',
    USER_ID: '@meridian/analytics/user_id',
};

// Constants
const MAX_QUEUE_SIZE = 500;
const MAX_BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 45000; // 45 seconds
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 30000]; // Exponential backoff, max 30s

// PII keys to remove
const PII_KEYS = ['email', 'name', 'phone', 'password', 'ssn', 'credit_card', 'address'];

class Analytics {
    constructor() {
        this.config = null;
        this.flushTimer = null;
        this.isInitialized = false;
        this.lastVisibilityChange = document.visibilityState;
        /** When true and user has admin role, all tracking is skipped */
        this.excludeAdminUsersFromTracking = true;
        /** User roles (set by AuthContext on login, cleared on logout) */
        this.userRoles = null;
        this.setupVisibilityListener();
    }

    /**
     * Setup visibility change listener for session management
     */
    setupVisibilityListener() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.lastVisibilityChange === 'hidden') {
                // Page became visible - check session timeout
                this.updateSessionStart();
                this.flushQueue(); // Flush on visibility
            } else if (document.visibilityState === 'hidden') {
                // Page became hidden - flush queue
                this.flushQueue();
            }
            this.lastVisibilityChange = document.visibilityState;
        });

        // Flush on page unload
        window.addEventListener('beforeunload', () => {
            this.flushQueue();
        });
    }

    /**
     * Check if analytics is enabled
     */
    isEnabled() {
        return this.config?.enabled !== false;
    }

    /**
     * Set user roles (called by AuthContext on login). Used to exclude admin users from tracking
     * when excludeAdminUsersFromTracking config is true.
     */
    setUserRoles(roles) {
        this.userRoles = Array.isArray(roles) ? roles : (roles ? [roles] : null);
    }

    /**
     * Check if tracking should be skipped (e.g. admin user when excludeAdminUsersFromTracking is on)
     */
    shouldSkipTracking() {
        if (!this.excludeAdminUsersFromTracking) return false;
        return this.userRoles?.includes('admin') === true;
    }

    /**
     * Generate a simple UUID v4
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    /**
     * Get or create anonymous ID
     */
    getAnonymousId() {
        try {
            let anonymousId = localStorage.getItem(STORAGE_KEYS.ANONYMOUS_ID);
            if (!anonymousId) {
                anonymousId = this.generateUUID();
                localStorage.setItem(STORAGE_KEYS.ANONYMOUS_ID, anonymousId);
            }
            return anonymousId;
        } catch (error) {
            console.error('Analytics: Error getting anonymous ID:', error);
            // Fallback to session-based ID if storage fails
            return this.generateUUID();
        }
    }

    /**
     * Get or create session ID
     */
    getSessionId() {
        try {
            const sessionStartStr = localStorage.getItem(STORAGE_KEYS.SESSION_START);
            const sessionStart = sessionStartStr ? parseInt(sessionStartStr, 10) : null;
            const now = Date.now();

            // Check if session expired (30+ minutes in background)
            if (sessionStart && now - sessionStart > SESSION_TIMEOUT_MS) {
                // Session expired, create new one
                const newSessionId = this.generateUUID();
                localStorage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId);
                localStorage.setItem(STORAGE_KEYS.SESSION_START, now.toString());
                return newSessionId;
            }

            let sessionId = localStorage.getItem(STORAGE_KEYS.SESSION_ID);
            if (!sessionId) {
                sessionId = this.generateUUID();
                localStorage.setItem(STORAGE_KEYS.SESSION_ID, sessionId);
                localStorage.setItem(STORAGE_KEYS.SESSION_START, now.toString());
            } else if (!sessionStart) {
                // Update session start if missing
                localStorage.setItem(STORAGE_KEYS.SESSION_START, now.toString());
            }

            return sessionId;
        } catch (error) {
            console.error('Analytics: Error getting session ID:', error);
            return this.generateUUID();
        }
    }

    /**
     * Update session start time
     */
    updateSessionStart() {
        try {
            const sessionStartStr = localStorage.getItem(STORAGE_KEYS.SESSION_START);
            const sessionStart = sessionStartStr ? parseInt(sessionStartStr, 10) : null;
            const now = Date.now();

            // Check if session expired (30+ minutes in background)
            if (sessionStart && now - sessionStart > SESSION_TIMEOUT_MS) {
                // Session expired, create new one
                const newSessionId = this.generateUUID();
                localStorage.setItem(STORAGE_KEYS.SESSION_ID, newSessionId);
                localStorage.setItem(STORAGE_KEYS.SESSION_START, now.toString());
            } else {
                localStorage.setItem(STORAGE_KEYS.SESSION_START, now.toString());
            }
        } catch (error) {
            console.error('Analytics: Error updating session start:', error);
        }
    }

    /**
     * Remove PII from properties
     */
    scrubPII(properties) {
        if (!properties || typeof properties !== 'object') {
            return {};
        }

        const scrubbed = { ...properties };

        // Remove PII keys
        PII_KEYS.forEach(key => {
            delete scrubbed[key];
        });

        // Recursively scrub nested objects
        Object.keys(scrubbed).forEach(key => {
            if (typeof scrubbed[key] === 'object' && scrubbed[key] !== null && !Array.isArray(scrubbed[key])) {
                scrubbed[key] = this.scrubPII(scrubbed[key]);
            }
        });

        return scrubbed;
    }

    /**
     * Get queued events from storage
     */
    getQueue() {
        try {
            const queueStr = localStorage.getItem(STORAGE_KEYS.QUEUE);
            return queueStr ? JSON.parse(queueStr) : [];
        } catch (error) {
            console.error('Analytics: Error getting queue:', error);
            return [];
        }
    }

    /**
     * Save queue to storage
     */
    saveQueue(queue) {
        try {
            // Limit queue size
            const limitedQueue = queue.slice(-MAX_QUEUE_SIZE);
            localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(limitedQueue));
        } catch (error) {
            console.error('Analytics: Error saving queue:', error);
        }
    }

    /**
     * Send events batch with retry logic
     */
    async sendBatch(events, retryCount = 0) {
        if (!this.config) {
            console.error('Analytics: Not initialized');
            return false;
        }

        try {
            const response = await axios.post(this.config.endpointUrl, { events }, {
                withCredentials: true
            });
            
            if (process.env.NODE_ENV === 'development') {
                console.log(`Analytics: Sent ${events.length} events`, response.data);
            }

            return true;
        } catch (error) {
            const isNetworkError = !error.response || error.response.status === 0;
            const isServerError = error.response && error.response.status >= 500;

            // Only retry on network errors or server errors
            if ((isNetworkError || isServerError) && retryCount < MAX_RETRIES) {
                const delay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
                
                if (process.env.NODE_ENV === 'development') {
                    console.log(`Analytics: Retrying batch (attempt ${retryCount + 1}/${MAX_RETRIES}) after ${delay}ms`);
                }

                await new Promise(resolve => setTimeout(resolve, delay));
                return this.sendBatch(events, retryCount + 1);
            }

            // Don't log client errors (4xx) in production
            if (process.env.NODE_ENV === 'development' || (!isNetworkError && !isServerError)) {
                console.error('Analytics: Failed to send batch:', error);
            }

            return false;
        }
    }

    /**
     * Flush queued events
     */
    async flushQueue() {
        if (!this.config) return;

        const queue = this.getQueue();
        if (queue.length === 0) return;

        // Process in batches
        const queueCopy = [...queue];
        while (queueCopy.length > 0) {
            const batch = queueCopy.splice(0, MAX_BATCH_SIZE);
            const success = await this.sendBatch(batch);

            if (!success) {
                // Put failed batch back at the front
                queueCopy.unshift(...batch);
                break;
            }
        }

        // Save remaining queue
        this.saveQueue(queueCopy);
    }

    /**
     * Schedule automatic flush
     */
    scheduleFlush() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }

        this.flushTimer = setInterval(() => {
            this.flushQueue().catch(error => {
                console.error('Analytics: Error in scheduled flush:', error);
            });
        }, FLUSH_INTERVAL_MS);
    }

    /**
     * Initialize analytics SDK
     */
    async init(config = {}) {
        if (this.isInitialized) {
            console.warn('Analytics: Already initialized');
            return;
        }

        // Fetch analytics config from backend (excludeAdminUsersFromTracking, enabled)
        try {
            const res = await axios.get('/api/event-system-config/analytics-config', { withCredentials: true });
            if (res.data?.success && res.data?.data) {
                this.excludeAdminUsersFromTracking = res.data.data.excludeAdminUsersFromTracking !== false;
                if (res.data.data.enabled === false) {
                    this.config = { enabled: false };
                    if (process.env.NODE_ENV === 'development') {
                        console.log('Analytics: Disabled by config');
                    }
                    return;
                }
            }
        } catch (err) {
            if (process.env.NODE_ENV === 'development') {
                console.warn('Analytics: Could not fetch analytics config, using defaults', err);
            }
        }

        // Get app version from package.json or config
        const appVersion = config.appVersion || '0.1.0';
        const build = config.build || '1';
        const platform = 'web';
        const env = config.env || (process.env.NODE_ENV === 'production' ? 'prod' : 'dev');
        const endpointUrl = config.endpointUrl || '/v1/events';

        this.config = {
            endpointUrl,
            env,
            appVersion,
            build,
            platform,
            enabled: true,
        };

        // Schedule automatic flush
        this.scheduleFlush();

        // Track session start
        await this.track('session_start');

        this.isInitialized = true;

        if (process.env.NODE_ENV === 'development') {
            console.log('Analytics: Initialized', this.config, 'excludeAdminUsersFromTracking:', this.excludeAdminUsersFromTracking);
        }
    }

    /**
     * Identify user
     */
    identify(userId) {
        if (!this.isEnabled()) {
            return;
        }

        try {
            localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
        } catch (error) {
            console.error('Analytics: Error identifying user:', error);
        }
    }

    /**
     * Reset user identification and session
     */
    reset() {
        this.userRoles = null;
        if (!this.isEnabled()) {
            return;
        }

        try {
            localStorage.removeItem(STORAGE_KEYS.USER_ID);
            localStorage.removeItem(STORAGE_KEYS.SESSION_ID);
            localStorage.removeItem(STORAGE_KEYS.SESSION_START);
            // Keep anonymous_id
        } catch (error) {
            console.error('Analytics: Error resetting:', error);
        }
    }

    /**
     * Track event
     */
    async track(eventName, properties = {}, contextOverrides = {}) {
        if (!this.isEnabled()) {
            return;
        }

        if (this.shouldSkipTracking()) {
            if (process.env.NODE_ENV === 'development') {
                console.log(`Analytics: Skipping event (admin excluded): ${eventName}`);
            }
            return;
        }

        if (!this.isInitialized || !this.config) {
            if (process.env.NODE_ENV === 'development') {
                console.warn('Analytics: Not initialized, skipping event:', eventName);
            }
            return;
        }

        try {
            const anonymousId = this.getAnonymousId();
            const sessionId = this.getSessionId();
            const userIdStr = localStorage.getItem(STORAGE_KEYS.USER_ID);
            const userId = userIdStr || null;

            // Get timezone
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

            // Get locale
            const locale = navigator.language || navigator.userLanguage;

            // Build event
            const event = {
                schema_version: 1,
                event_id: this.generateUUID(),
                event: eventName,
                ts: new Date().toISOString(),
                anonymous_id: anonymousId,
                user_id: userId,
                session_id: sessionId,
                platform: this.config.platform,
                app: 'meridian',
                app_version: this.config.appVersion,
                build: this.config.build,
                env: this.config.env,
                context: {
                    locale,
                    timezone,
                    referrer: getReferrerPath() || document.referrer || undefined,
                    ...contextOverrides,
                },
                properties: this.scrubPII(properties),
            };

            // Add to queue
            const queue = this.getQueue();
            queue.push(event);
            this.saveQueue(queue);

            if (process.env.NODE_ENV === 'development') {
                console.log(`Analytics: Queued event: ${eventName}`, event);
            }

            // Auto-flush if queue is getting large
            if (queue.length >= MAX_BATCH_SIZE) {
                this.flushQueue();
            }
        } catch (error) {
            console.error('Analytics: Error tracking event:', error);
        }
    }

    /**
     * Track screen view (page view)
     */
    async screen(screenName, properties = {}) {
        await this.track('screen_view', properties, { screen: screenName });
    }

    /**
     * Flush queued events immediately
     */
    async flush() {
        if (!this.isEnabled()) {
            return;
        }

        await this.flushQueue();
    }
}

// Export singleton instance
export const analytics = new Analytics();
export default analytics;
