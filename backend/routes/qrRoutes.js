const express = require('express');
const router = express.Router();
const getModels = require('../services/getModelService');
const { verifyToken } = require('../middlewares/verifyToken');

// MER-164: Normalize hex color so UI color picker and stored value stay in sync (e.g. #RRGGBB).
function normalizeHexColor(value) {
    if (value == null || typeof value !== 'string') return value;
    const hex = value.trim().replace(/^#/, '');
    if (!/^[0-9A-Fa-f]{6}$/.test(hex) && !/^[0-9A-Fa-f]{3}$/.test(hex)) return value;
    const full = hex.length === 3
        ? hex.split('').map(c => c + c).join('')
        : hex;
    return '#' + full.toLowerCase();
}

// Helper function to convert relative URLs to absolute URLs
const normalizeRedirectUrl = (redirectUrl, baseUrl) => {
    if (!redirectUrl) return redirectUrl;
    
    // If it's already an absolute URL (starts with http:// or https://), return as is
    if (redirectUrl.startsWith('http://') || redirectUrl.startsWith('https://')) {
        return redirectUrl;
    }
    
    // If it's a relative URL, make it absolute by prepending the base URL
    // Remove leading slash if present to avoid double slashes
    const cleanUrl = redirectUrl.startsWith('/') ? redirectUrl.slice(1) : redirectUrl;
    return `${baseUrl}/${cleanUrl}`;
};

// Get all QR codes with optional filtering
router.get('/', verifyToken, async (req, res) => {
    const { QR } = getModels(req, 'QR');
    
    try {
        const { 
            page = 1, 
            limit = 10, 
            search, 
            isActive, 
            tags, 
            campaign,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const query = {};
        
        // Search filter
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { location: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Active filter
        if (isActive !== undefined) {
            query.isActive = isActive === 'true';
        }
        
        // Tags filter
        if (tags) {
            query.tags = { $in: tags.split(',') };
        }
        
        // Campaign filter
        if (campaign) {
            query.campaign = campaign;
        }

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const skip = (page - 1) * limit;
        
        const qrCodes = await QR.find(query)
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit))
            .select('-scanHistory'); // Exclude scan history for list view

        const total = await QR.countDocuments(query);
        
        res.json({
            qrCodes,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: parseInt(limit)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching QR codes' });
    }
});

// Get overall QR analytics (must come before /:id routes)
router.get('/analytics/overview', verifyToken, async (req, res) => {
    const { QR } = getModels(req, 'QR');
    
    try {
        const { startDate, endDate } = req.query;
        
        const query = {};
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const qrCodes = await QR.find(query);
        
        const overview = {
            totalQRCodes: qrCodes.length,
            activeQRCodes: qrCodes.filter(qr => qr.isActive).length,
            totalScans: qrCodes.reduce((sum, qr) => sum + qr.scans, 0),
            totalUniqueScans: qrCodes.reduce((sum, qr) => sum + qr.uniqueScans, 0),
            totalRepeatScans: qrCodes.reduce((sum, qr) => sum + qr.repeated, 0),
            averageScansPerQR: qrCodes.length > 0 ? 
                Math.round(qrCodes.reduce((sum, qr) => sum + qr.scans, 0) / qrCodes.length * 100) / 100 : 0,
            topPerformingQR: qrCodes.length > 0 ? 
                qrCodes.reduce((max, qr) => qr.scans > max.scans ? qr : max) : null
        };

        res.json(overview);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching overview analytics' });
    }
});

// Get aggregate QR analytics from AnalyticsEvent (Event-compatible format for chart)
router.get('/analytics', verifyToken, async (req, res) => {
    const { QR, AnalyticsEvent } = getModels(req, 'QR', 'AnalyticsEvent');

    try {
        const qrCodes = await QR.find({}).sort({ createdAt: 1 }).select('-scanHistory').lean();
        const qrNames = qrCodes.map(q => q.name);

        if (qrCodes.length === 0) {
            return res.json({
                summary: { totalQRCodes: 0, totalScans: 0, totalUniqueScans: 0 },
                dateRange: {},
                dailyScans: {},
                byQR: []
            });
        }

        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const defaultStart = new Date(qrCodes[0].createdAt);
        defaultStart.setHours(0, 0, 0, 0);
        const defaultEnd = today;

        // Allow client to override date range via query params (YYYY-MM-DD)
        const reqStart = req.query.startDate ? new Date(req.query.startDate + 'T00:00:00') : null;
        const reqEnd = req.query.endDate ? new Date(req.query.endDate + 'T23:59:59') : null;
        const startDate = reqStart && !isNaN(reqStart.getTime()) ? reqStart : defaultStart;
        const endDate = reqEnd && !isNaN(reqEnd.getTime()) ? reqEnd : defaultEnd;
        if (startDate > endDate) {
            return res.status(400).json({ error: 'startDate must be before or equal to endDate' });
        }

        const platformMatch = {
            event: 'admin_qr_scan',
            ts: { $gte: startDate, $lte: endDate },
            'properties.qr_name': { $in: qrNames }
        };

        const dailyAgg = await AnalyticsEvent.aggregate([
            { $match: platformMatch },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);
        const dailyScans = {};
        dailyAgg.forEach(({ _id, count }) => { dailyScans[_id] = count; });

        const byQRAgg = await AnalyticsEvent.aggregate([
            { $match: platformMatch },
            { $group: { _id: '$properties.qr_name', count: { $sum: 1 } } }
        ]);
        const byQRCounts = {};
        byQRAgg.forEach(({ _id: name, count }) => { if (name) byQRCounts[name] = count; });

        const byQRDailyAgg = await AnalyticsEvent.aggregate([
            { $match: platformMatch },
            { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } }, qr_name: '$properties.qr_name' }, count: { $sum: 1 } } },
            { $sort: { '_id.date': 1 } }
        ]);
        const dailyByQR = {};
        byQRDailyAgg.forEach(({ _id, count }) => {
            if (_id.qr_name) {
                if (!dailyByQR[_id.qr_name]) dailyByQR[_id.qr_name] = {};
                dailyByQR[_id.qr_name][_id.date] = count;
            }
        });

        const toDateStr = (d) => d.toISOString().slice(0, 10);
        const qrCreatedStr = (q) => toDateStr(new Date(q.createdAt));

        const byQR = qrCodes.map(q => {
            const rawDaily = dailyByQR[q.name] || {};
            const qrStart = qrCreatedStr(q);
            const filteredDaily = {};
            Object.entries(rawDaily).forEach(([date, count]) => {
                if (date >= qrStart) filteredDaily[date] = count;
            });
            return {
                name: q.name,
                createdAt: q.createdAt,
                scans: byQRCounts[q.name] ?? q.scans ?? 0,
                uniqueScans: q.uniqueScans ?? 0,
                lastScanned: q.lastScanned,
                dailyScans: filteredDaily
            };
        });

        const totalScans = Object.values(byQRCounts).reduce((a, b) => a + b, 0) || qrCodes.reduce((a, q) => a + (q.scans || 0), 0);
        const totalUniqueScans = qrCodes.reduce((a, q) => a + (q.uniqueScans || 0), 0);

        res.json({
            summary: { totalQRCodes: qrCodes.length, totalScans, totalUniqueScans },
            dateRange: { startDate: startDate.toISOString().slice(0, 10), endDate: endDate.toISOString().slice(0, 10) },
            dailyScans,
            byQR
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching QR analytics' });
    }
});

// Get a specific QR code with full details (MER-164: return normalized hex so color picker reflects stored value)
router.get('/:id', verifyToken, async (req, res) => {
    const { QR } = getModels(req, 'QR');
    
    try {
        const qrCode = await QR.findOne({ name: req.params.id });
        
        if (!qrCode) {
            return res.status(404).json({ error: 'QR code not found' });
        }
        const doc = qrCode.toObject ? qrCode.toObject() : qrCode;
        doc.fgColor = normalizeHexColor(doc.fgColor) ?? doc.fgColor;
        doc.bgColor = normalizeHexColor(doc.bgColor) ?? doc.bgColor;
        res.json(doc);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching QR code' });
    }
});

// Create a new QR code
router.post('/', verifyToken, async (req, res) => {
    const { QR } = getModels(req, 'QR');
    
    try {
        const {
            name,
            description,
            redirectUrl,
            isActive = true,
            tags = [],
            location,
            campaign,
            fgColor = '#414141',
            bgColor = '#ffffff',
            foregroundColorHex,
            backgroundColorHex,
            transparentBg = false,
            dotType = 'extra-rounded',
            cornerType = 'extra-rounded'
        } = req.body;
        const normalizedFg = normalizeHexColor(foregroundColorHex ?? fgColor) ?? '#414141';
        const normalizedBg = normalizeHexColor(backgroundColorHex ?? bgColor) ?? '#ffffff';

        // Validate required fields
        if (!name || !redirectUrl) {
            return res.status(400).json({ error: 'Name and redirect URL are required' });
        }

        // Check if QR code already exists
        const existingQR = await QR.findOne({ name });
        if (existingQR) {
            return res.status(400).json({ error: 'QR code with this name already exists' });
        }

        // Normalize the redirect URL (convert relative to absolute if needed)
        const normalizedRedirectUrl = normalizeRedirectUrl(redirectUrl, req.protocol + '://' + req.get('host'));

        const qrCode = new QR({
            name,
            description,
            redirectUrl: normalizedRedirectUrl,
            isActive,
            tags,
            location,
            campaign,
            fgColor,
            bgColor,
            transparentBg,
            dotType,
            cornerType
        });

        await qrCode.save();
        
        res.status(201).json(qrCode);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while creating QR code' });
    }
});

// Update a QR code
router.put('/:id', verifyToken, async (req, res) => {
    const { QR } = getModels(req, 'QR');
    
    try {
        const {
            description,
            redirectUrl,
            isActive,
            tags,
            location,
            campaign,
            fgColor,
            bgColor,
            foregroundColorHex,
            backgroundColorHex,
            transparentBg,
            dotType,
            cornerType
        } = req.body;

        const qrCode = await QR.findOne({ name: req.params.id });
        
        if (!qrCode) {
            return res.status(404).json({ error: 'QR code not found' });
        }

        // Update fields if provided (MER-164: normalize hex so color picker stays in sync)
        if (description !== undefined) qrCode.description = description;
        if (redirectUrl !== undefined) {
            // Normalize the redirect URL (convert relative to absolute if needed)
            qrCode.redirectUrl = normalizeRedirectUrl(redirectUrl, req.protocol + '://' + req.get('host'));
        }
        if (isActive !== undefined) qrCode.isActive = isActive;
        if (tags !== undefined) qrCode.tags = tags;
        if (location !== undefined) qrCode.location = location;
        if (campaign !== undefined) qrCode.campaign = campaign;
        if (fgColor !== undefined || foregroundColorHex !== undefined) {
            qrCode.fgColor = normalizeHexColor(foregroundColorHex ?? fgColor) ?? qrCode.fgColor;
        }
        if (bgColor !== undefined || backgroundColorHex !== undefined) {
            qrCode.bgColor = normalizeHexColor(backgroundColorHex ?? bgColor) ?? qrCode.bgColor;
        }
        if (transparentBg !== undefined) qrCode.transparentBg = transparentBg;
        if (dotType !== undefined) qrCode.dotType = dotType;
        if (cornerType !== undefined) qrCode.cornerType = cornerType;

        await qrCode.save();
        const updated = qrCode.toObject ? qrCode.toObject() : qrCode;
        updated.fgColor = normalizeHexColor(updated.fgColor) ?? updated.fgColor;
        updated.bgColor = normalizeHexColor(updated.bgColor) ?? updated.bgColor;
        res.json(updated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while updating QR code' });
    }
});

// Delete a QR code
router.delete('/:id', verifyToken, async (req, res) => {
    const { QR } = getModels(req, 'QR');
    
    try {
        const qrCode = await QR.findOneAndDelete({ name: req.params.id });
        
        if (!qrCode) {
            return res.status(404).json({ error: 'QR code not found' });
        }
        
        res.json({ message: 'QR code deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while deleting QR code' });
    }
});

// Get QR code analytics
router.get('/:id/analytics', verifyToken, async (req, res) => {
    const { QR } = getModels(req, 'QR');
    
    try {
        const { startDate, endDate, groupBy = 'day' } = req.query;
        
        const qrCode = await QR.findOne({ name: req.params.id });
        
        if (!qrCode) {
            return res.status(404).json({ error: 'QR code not found' });
        }

        // Filter scan history by date range if provided
        let filteredHistory = qrCode.scanHistory;
        
        if (startDate || endDate) {
            const start = startDate ? new Date(startDate) : new Date(0);
            const end = endDate ? new Date(endDate) : new Date();
            
            filteredHistory = qrCode.scanHistory.filter(scan => 
                scan.timestamp >= start && scan.timestamp <= end
            );
        }

        // Group scans by the specified time period
        const groupedScans = {};
        filteredHistory.forEach(scan => {
            let key;
            const date = new Date(scan.timestamp);
            
            switch (groupBy) {
                case 'hour':
                    key = date.toISOString().slice(0, 13) + ':00:00.000Z';
                    break;
                case 'day':
                    key = date.toISOString().slice(0, 10);
                    break;
                case 'week':
                    const weekStart = new Date(date);
                    weekStart.setDate(date.getDate() - date.getDay());
                    key = weekStart.toISOString().slice(0, 10);
                    break;
                case 'month':
                    key = date.toISOString().slice(0, 7);
                    break;
                default:
                    key = date.toISOString().slice(0, 10);
            }
            
            if (!groupedScans[key]) {
                groupedScans[key] = { total: 0, unique: 0, repeat: 0 };
            }
            
            groupedScans[key].total++;
            if (scan.isRepeat) {
                groupedScans[key].repeat++;
            } else {
                groupedScans[key].unique++;
            }
        });

        // Convert to array and sort by date
        const analyticsData = Object.entries(groupedScans)
            .map(([date, data]) => ({ date, ...data }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        res.json({
            qrCode: {
                name: qrCode.name,
                description: qrCode.description,
                totalScans: qrCode.scans,
                uniqueScans: qrCode.uniqueScans,
                repeatScans: qrCode.repeated,
                createdAt: qrCode.createdAt,
                lastScanned: qrCode.lastScanned
            },
            analytics: analyticsData,
            summary: {
                totalScans: filteredHistory.length,
                uniqueScans: filteredHistory.filter(scan => !scan.isRepeat).length,
                repeatScans: filteredHistory.filter(scan => scan.isRepeat).length
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching analytics' });
    }
});

// Get QR code scan history
router.get('/:id/history', verifyToken, async (req, res) => {
    const { QR } = getModels(req, 'QR');
    
    try {
        const { page = 1, limit = 50 } = req.query;
        
        const qrCode = await QR.findOne({ name: req.params.id });
        
        if (!qrCode) {
            return res.status(404).json({ error: 'QR code not found' });
        }

        const skip = (page - 1) * limit;
        const history = qrCode.scanHistory
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(skip, skip + parseInt(limit));

        res.json({
            history,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(qrCode.scanHistory.length / limit),
                totalItems: qrCode.scanHistory.length,
                itemsPerPage: parseInt(limit)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred while fetching scan history' });
    }
});

module.exports = router;
