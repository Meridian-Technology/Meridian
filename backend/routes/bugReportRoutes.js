const express = require('express');
const { verifyToken, verifyTokenOptional } = require('../middlewares/verifyToken');
const getModels = require('../services/getModelService');

const router = express.Router();

router.put('/bug-report', async (req, res) => {
    try {
        const { BugReport } = getModels(req, 'BugReport');
        const { title, description, category, image, status, platformDetails } = req.body;
        if (title === null || description === null || category === null) {
            return res.status(401).json({
                success: false, 
                message: 'all required fields not found'
            })
        }

        const bugReportData = {
            title,
            description,
            category,
            status: status || 'Unseen',
            ...(platformDetails && { platformDetails })
        };

        const bugReport = await BugReport.create(bugReportData);

        res.status(201).json({
            success: true,
            message: 'Bug report created successfully',
            data: bugReport
        });

    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create bug report',
            error: error.message
        })
    }
});

router.put('/bug-report/:id', async (req, res) => {
    try {
        const { BugReport } = getModels(req, 'BugReport');
        const { id } = req.params;
        const { title, description, category, image, status, platformDetails } = req.body;
        if (title === null || description === null || category === null) {
            return res.status(401).json({
                success: false, 
                message: 'all required fields not found'
            })
        }
        
        const bugReport = await BugReport.findByIdAndUpdate(id, { title, description, category, image, status, platformDetails }, { new: true });
        if (!bugReport) {
            return res.status(404).json({
                success: false, 
                message: 'Bug report not found'
            })
        }
        res.status(200).json({
            success: true, 
            message: 'Bug report updated successfully',
            data: bugReport
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update bug report',
            error: error.message
        })
    }
});


module.exports = router;