const express = require('express');
const getModels = require('../services/getModelService');
const { verifyToken } = require('../middlewares/verifyToken');
const { requireInventoryView, requireInventoryManagement } = require('../middlewares/orgPermissions');

const router = express.Router();

router.get('/org-inventory/:orgId', verifyToken, requireInventoryView(), async (req, res) => {
    const { OrgInventory } = getModels(req, 'OrgInventory');
    try {
        const inventories = await OrgInventory.find({ org_id: req.params.orgId }).sort({ createdAt: -1 }).lean();
        res.status(200).json({ success: true, data: inventories });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch inventories' });
    }
});

router.post('/org-inventory/:orgId', verifyToken, requireInventoryManagement(), async (req, res) => {
    const { OrgInventory } = getModels(req, 'OrgInventory');
    const { name, description = '' } = req.body;
    if (!name) {
        return res.status(400).json({ success: false, message: 'name is required' });
    }
    try {
        const inventory = await OrgInventory.create({
            org_id: req.params.orgId,
            name,
            description,
            createdBy: req.user.userId,
            updatedBy: req.user.userId
        });
        res.status(201).json({ success: true, data: inventory });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create inventory' });
    }
});

router.get('/org-inventory/:orgId/:inventoryId/items', verifyToken, requireInventoryView(), async (req, res) => {
    const { OrgInventoryItem } = getModels(req, 'OrgInventoryItem');
    try {
        const items = await OrgInventoryItem.find({
            org_id: req.params.orgId,
            inventory_id: req.params.inventoryId
        })
            .sort({ createdAt: -1 })
            .lean();
        res.status(200).json({ success: true, data: items });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch inventory items' });
    }
});

router.post('/org-inventory/:orgId/:inventoryId/items', verifyToken, requireInventoryManagement(), async (req, res) => {
    const { OrgInventoryItem } = getModels(req, 'OrgInventoryItem');
    const { name, description = '', quantity = 1, condition = 'good' } = req.body;

    if (!name) {
        return res.status(400).json({ success: false, message: 'name is required' });
    }

    try {
        const item = await OrgInventoryItem.create({
            org_id: req.params.orgId,
            inventory_id: req.params.inventoryId,
            name,
            description,
            quantity,
            condition
        });
        res.status(201).json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create inventory item' });
    }
});

router.patch('/org-inventory/:orgId/:inventoryId/items/:itemId/checkout', verifyToken, requireInventoryManagement(), async (req, res) => {
    const { OrgInventoryItem } = getModels(req, 'OrgInventoryItem');
    const { notes = '' } = req.body;
    try {
        const item = await OrgInventoryItem.findOne({
            _id: req.params.itemId,
            org_id: req.params.orgId,
            inventory_id: req.params.inventoryId
        });
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        item.isCheckedOut = true;
        item.checkedOutTo = req.user.userId;
        item.checkoutHistory.push({
            action: 'checkout',
            userId: req.user.userId,
            condition: item.condition,
            notes
        });
        await item.save();
        res.status(200).json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to checkout item' });
    }
});

router.patch('/org-inventory/:orgId/:inventoryId/items/:itemId/checkin', verifyToken, requireInventoryManagement(), async (req, res) => {
    const { OrgInventoryItem } = getModels(req, 'OrgInventoryItem');
    const { condition = 'good', notes = '' } = req.body;
    try {
        const item = await OrgInventoryItem.findOne({
            _id: req.params.itemId,
            org_id: req.params.orgId,
            inventory_id: req.params.inventoryId
        });
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        item.isCheckedOut = false;
        item.checkedOutTo = null;
        item.condition = condition;
        item.checkoutHistory.push({
            action: 'checkin',
            userId: req.user.userId,
            condition,
            notes
        });
        await item.save();
        res.status(200).json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to checkin item' });
    }
});

module.exports = router;
