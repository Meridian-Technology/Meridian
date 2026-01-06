const express = require('express');
const router = express.Router();
const getModels = require('../services/getModelService');
const { verifyToken } = require('../middlewares/verifyToken');

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

// Get a specific QR code with full details
router.get('/:id', verifyToken, async (req, res) => {
    const { QR } = getModels(req, 'QR');
    
    try {
        const qrCode = await QR.findOne({ name: req.params.id });
        
        if (!qrCode) {
            return res.status(404).json({ error: 'QR code not found' });
        }
        
        res.json(qrCode);
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
            campaign
        } = req.body;

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
            campaign
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
            campaign
        } = req.body;

        const qrCode = await QR.findOne({ name: req.params.id });
        
        if (!qrCode) {
            return res.status(404).json({ error: 'QR code not found' });
        }

        // Update fields if provided
        if (description !== undefined) qrCode.description = description;
        if (redirectUrl !== undefined) {
            // Normalize the redirect URL (convert relative to absolute if needed)
            qrCode.redirectUrl = normalizeRedirectUrl(redirectUrl, req.protocol + '://' + req.get('host'));
        }
        if (isActive !== undefined) qrCode.isActive = isActive;
        if (tags !== undefined) qrCode.tags = tags;
        if (location !== undefined) qrCode.location = location;
        if (campaign !== undefined) qrCode.campaign = campaign;

        await qrCode.save();
        
        res.json(qrCode);
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
