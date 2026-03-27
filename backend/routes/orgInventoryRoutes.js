const express = require('express');
const getModels = require('../services/getModelService');
const { verifyToken } = require('../middlewares/verifyToken');
const { requireInventoryView, requireInventoryManagement } = require('../middlewares/orgPermissions');
const { getTenantParityConfig } = require('../services/tenantConfigService');

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

router.patch('/org-inventory/:orgId/:inventoryId/items/:itemId', verifyToken, requireInventoryManagement(), async (req, res) => {
    const { OrgInventoryItem } = getModels(req, 'OrgInventoryItem');
    const {
        name,
        description,
        quantity,
        condition,
        lifecycleStatus,
        archive = false
    } = req.body;
    const parityConfig = getTenantParityConfig(req);
    const allowedLifecycleStatuses = parityConfig?.inventory?.lifecycleStatuses || ['active', 'maintenance', 'archived'];
    try {
        const item = await OrgInventoryItem.findOne({
            _id: req.params.itemId,
            org_id: req.params.orgId,
            inventory_id: req.params.inventoryId
        });
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        if (quantity !== undefined && Number(quantity) < item.checkedOutQuantity) {
            return res.status(400).json({
                success: false,
                message: 'quantity cannot be lower than checked out quantity',
                code: 'INVALID_QUANTITY'
            });
        }
        if (name !== undefined) item.name = name;
        if (description !== undefined) item.description = description;
        if (quantity !== undefined) item.quantity = Number(quantity);
        if (condition !== undefined) item.condition = condition;
        if (lifecycleStatus !== undefined) {
            if (!allowedLifecycleStatuses.includes(lifecycleStatus)) {
                return res.status(400).json({
                    success: false,
                    message: 'lifecycleStatus is not allowed by tenant policy',
                    code: 'INVALID_ITEM_LIFECYCLE'
                });
            }
            item.lifecycleStatus = lifecycleStatus;
        }

        if (archive) {
            if (item.isCheckedOut) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot archive item while checked out',
                    code: 'ITEM_CHECKED_OUT'
                });
            }
            item.lifecycleStatus = 'archived';
            item.archivedAt = new Date();
            item.archivedBy = req.user.userId;
        }

        await item.save();
        return res.status(200).json({ success: true, data: item });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update inventory item' });
    }
});

router.patch('/org-inventory/:orgId/:inventoryId/items/:itemId/checkout', verifyToken, requireInventoryManagement(), async (req, res) => {
    const { OrgInventoryItem } = getModels(req, 'OrgInventoryItem');
    const { notes = '', quantity = 1, eventId = null, expectedReturnAt = null } = req.body;
    const parityConfig = getTenantParityConfig(req);
    const allowCheckout = parityConfig?.inventory?.allowCheckout !== false;
    try {
        if (!allowCheckout) {
            return res.status(400).json({
                success: false,
                message: 'Checkout is disabled by tenant policy',
                code: 'CHECKOUT_DISABLED'
            });
        }
        const item = await OrgInventoryItem.findOne({
            _id: req.params.itemId,
            org_id: req.params.orgId,
            inventory_id: req.params.inventoryId
        });
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }
        if (item.lifecycleStatus === 'archived') {
            return res.status(400).json({ success: false, message: 'Archived item cannot be checked out' });
        }
        if (item.lifecycleStatus === 'maintenance') {
            return res.status(400).json({ success: false, message: 'Item under maintenance cannot be checked out' });
        }
        const checkoutQuantity = Number(quantity) || 1;
        if (checkoutQuantity <= 0) {
            return res.status(400).json({ success: false, message: 'quantity must be greater than 0' });
        }
        const availableQuantity = item.quantity - item.checkedOutQuantity;
        if (availableQuantity < checkoutQuantity) {
            return res.status(400).json({
                success: false,
                message: 'Not enough quantity available for checkout',
                code: 'INSUFFICIENT_QUANTITY'
            });
        }

        item.checkedOutQuantity += checkoutQuantity;
        item.isCheckedOut = item.checkedOutQuantity > 0;
        item.checkedOutTo = req.user.userId;
        item.checkoutHistory.push({
            action: 'checkout',
            userId: req.user.userId,
            eventId,
            expectedReturnAt,
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
    const { condition, notes = '', quantity = 1, eventId = null } = req.body;
    const parityConfig = getTenantParityConfig(req);
    const requireConditionOnReturn = parityConfig?.inventory?.requireConditionOnReturn !== false;
    try {
        const item = await OrgInventoryItem.findOne({
            _id: req.params.itemId,
            org_id: req.params.orgId,
            inventory_id: req.params.inventoryId
        });
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }
        if (requireConditionOnReturn && !condition) {
            return res.status(400).json({
                success: false,
                message: 'condition is required when checking in',
                code: 'CONDITION_REQUIRED'
            });
        }
        const checkinQuantity = Number(quantity) || 1;
        if (checkinQuantity <= 0) {
            return res.status(400).json({ success: false, message: 'quantity must be greater than 0' });
        }
        if (checkinQuantity > item.checkedOutQuantity) {
            return res.status(400).json({
                success: false,
                message: 'checkin quantity cannot exceed checked out quantity',
                code: 'INVALID_CHECKIN_QUANTITY'
            });
        }

        item.checkedOutQuantity -= checkinQuantity;
        item.isCheckedOut = item.checkedOutQuantity > 0;
        item.checkedOutTo = item.isCheckedOut ? item.checkedOutTo : null;
        item.condition = condition;
        item.checkoutHistory.push({
            action: 'checkin',
            userId: req.user.userId,
            eventId,
            condition,
            notes
        });
        await item.save();
        res.status(200).json({ success: true, data: item });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to checkin item' });
    }
});

router.post('/org-inventory/:orgId/:inventoryId/items/:itemId/maintenance-events', verifyToken, requireInventoryManagement(), async (req, res) => {
    const { OrgInventoryItem } = getModels(req, 'OrgInventoryItem');
    const {
        type = 'maintenance',
        status = 'open',
        severity = 'low',
        notes = '',
        linkedEventId = null
    } = req.body;
    try {
        const item = await OrgInventoryItem.findOne({
            _id: req.params.itemId,
            org_id: req.params.orgId,
            inventory_id: req.params.inventoryId
        });
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }
        item.maintenanceEvents.push({
            type,
            status,
            severity,
            notes,
            linkedEventId,
            reportedBy: req.user.userId
        });
        if (type === 'maintenance' && status !== 'resolved') {
            item.lifecycleStatus = 'maintenance';
        }
        await item.save();
        return res.status(201).json({ success: true, data: item });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to log maintenance event' });
    }
});

router.patch('/org-inventory/:orgId/:inventoryId/items/:itemId/maintenance-events/:eventIndex/resolve', verifyToken, requireInventoryManagement(), async (req, res) => {
    const { OrgInventoryItem } = getModels(req, 'OrgInventoryItem');
    const { notes = '' } = req.body;
    const eventIndex = Number(req.params.eventIndex);
    try {
        const item = await OrgInventoryItem.findOne({
            _id: req.params.itemId,
            org_id: req.params.orgId,
            inventory_id: req.params.inventoryId
        });
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }
        if (!Number.isInteger(eventIndex) || eventIndex < 0 || eventIndex >= item.maintenanceEvents.length) {
            return res.status(400).json({ success: false, message: 'Invalid maintenance event index' });
        }
        const event = item.maintenanceEvents[eventIndex];
        event.status = 'resolved';
        event.notes = notes || event.notes;
        event.resolvedAt = new Date();
        event.resolvedBy = req.user.userId;

        const hasOpenMaintenance = item.maintenanceEvents.some((existingEvent) => existingEvent.status !== 'resolved');
        if (!hasOpenMaintenance && item.lifecycleStatus === 'maintenance') {
            item.lifecycleStatus = 'active';
        }
        await item.save();
        return res.status(200).json({ success: true, data: item });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to resolve maintenance event' });
    }
});

module.exports = router;
