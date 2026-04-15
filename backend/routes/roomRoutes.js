const express = require('express');
const mongoose = require('mongoose');
const { verifyToken, authorizeRoles } = require('../middlewares/verifyToken');
const { requireAdmin } = require('../middlewares/requireAdmin');
const getModels = require('../services/getModelService');
const multer = require('multer');
const path = require('path');
const { uploadImageToS3 } = require('../services/imageUploadService');

const router = express.Router();

// List rooms with optional search/pagination
router.get('/rooms', verifyToken, requireAdmin, async (req, res) => {
  const { Classroom } = getModels(req, 'Classroom');
  const { search = '', page = 1, limit = 20 } = req.query;

  try {
    let filter = {};
    
    if (search) {
      // Search in name AND attributes
      filter = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { attributes: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [rooms, total] = await Promise.all([
      Classroom.find(filter)
        .populate('building', 'name')
        .sort({ name: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Classroom.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      rooms,
      pagination: {
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('GET /rooms failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single room
router.get('/rooms/:id', verifyToken, requireAdmin, async (req, res) => {
  const { Classroom } = getModels(req, 'Classroom');
  try {
    const room = await Classroom.findById(req.params.id).populate('building', 'name');
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    res.status(200).json({ success: true, room });
  } catch (error) {
    console.error('GET /rooms/:id failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create room
router.post('/rooms', verifyToken, requireAdmin, async (req, res) => {
  const { Classroom } = getModels(req, 'Classroom');
  const { name, image = '/classrooms/default.png', attributes = [], mainSearch = true, building } = req.body;
  try {
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    const existing = await Classroom.findOne({ name });
    if (existing) return res.status(400).json({ success: false, message: 'Room name already exists' });

    const payload = { name, image, attributes, mainSearch };
    if (building && mongoose.Types.ObjectId.isValid(String(building))) {
      payload.building = new mongoose.Types.ObjectId(String(building));
    }
    const room = new Classroom(payload);
    await room.save();
    res.status(201).json({ success: true, room });
  } catch (error) {
    console.error('POST /rooms failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update room
router.put('/rooms/:id', verifyToken, requireAdmin, async (req, res) => {
  const { Classroom } = getModels(req, 'Classroom');
  const updates = { ...req.body };
  if (Object.prototype.hasOwnProperty.call(updates, 'building')) {
    if (updates.building === '' || updates.building == null) {
      updates.building = null;
    } else if (mongoose.Types.ObjectId.isValid(String(updates.building))) {
      updates.building = new mongoose.Types.ObjectId(String(updates.building));
    } else {
      delete updates.building;
    }
  }
  try {
    if (updates.name) {
      const exists = await Classroom.findOne({ name: updates.name, _id: { $ne: req.params.id } });
      if (exists) return res.status(400).json({ success: false, message: 'Room name already exists' });
    }
    const room = await Classroom.findByIdAndUpdate(req.params.id, updates, { new: true }).populate(
      'building',
      'name'
    );
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    res.status(200).json({ success: true, room });
  } catch (error) {
    console.error('PUT /rooms/:id failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete room
router.delete('/rooms/:id', verifyToken, requireAdmin, async (req, res) => {
  const { Classroom } = getModels(req, 'Classroom');
  try {
    const room = await Classroom.findByIdAndDelete(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    res.status(200).json({ success: true, message: 'Room deleted' });
  } catch (error) {
    console.error('DELETE /rooms/:id failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Upload room image
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.post('/rooms/:id/image', verifyToken, requireAdmin, upload.single('image'), async (req, res) => {
  const { Classroom } = getModels(req, 'Classroom');
  try {
    const room = await Classroom.findById(req.params.id).populate('building', 'name');
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const fileExtension = path.extname(req.file.originalname);
    const fileName = `${room._id}${fileExtension}`;
    const imageUrl = await uploadImageToS3(req.file, 'classrooms', fileName);
    room.image = imageUrl;
    await room.save();
    res.status(200).json({ success: true, imageUrl });
  } catch (error) {
    console.error('POST /rooms/:id/image failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

const DEFAULT_BUILDING_TIME = { start: 0, end: 24 * 60 };

function normalizeBuildingTime(body) {
  const t = body?.time && typeof body.time === 'object' ? body.time : body;
  const start = Number.isFinite(Number(t?.start)) ? Number(t.start) : DEFAULT_BUILDING_TIME.start;
  const end = Number.isFinite(Number(t?.end)) ? Number(t.end) : DEFAULT_BUILDING_TIME.end;
  return { start, end };
}

// --- Buildings (campus structures linked from classrooms) ---

router.get('/buildings', verifyToken, requireAdmin, async (req, res) => {
  const { Building } = getModels(req, 'Building');
  const { search = '', page = 1, limit = 20 } = req.query;
  try {
    const filter = search
      ? { name: { $regex: String(search).trim(), $options: 'i' } }
      : {};
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const [buildings, total] = await Promise.all([
      Building.find(filter).sort({ name: 1 }).skip(skip).limit(lim).lean(),
      Building.countDocuments(filter),
    ]);
    res.status(200).json({
      success: true,
      buildings,
      pagination: {
        total,
        totalPages: Math.ceil(total / lim),
        currentPage: parseInt(page, 10) || 1,
        limit: lim,
      },
    });
  } catch (error) {
    console.error('GET /buildings failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/buildings', verifyToken, requireAdmin, async (req, res) => {
  const { Building } = getModels(req, 'Building');
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    const image = String(req.body?.image || '').trim() || '/classrooms/default.png';
    const time = normalizeBuildingTime(req.body);
    const dup = await Building.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (dup) return res.status(400).json({ success: false, message: 'A building with this name already exists' });
    const building = new Building({ name, image, time });
    await building.save();
    res.status(201).json({ success: true, building });
  } catch (error) {
    console.error('POST /buildings failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/buildings/:id', verifyToken, requireAdmin, async (req, res) => {
  const { Building } = getModels(req, 'Building');
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid building id' });
    }
    const updates = {};
    if (req.body.name != null) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ success: false, message: 'Name cannot be empty' });
      updates.name = name;
    }
    if (req.body.image != null) {
      const image = String(req.body.image).trim();
      if (!image) return res.status(400).json({ success: false, message: 'Image is required' });
      updates.image = image;
    }
    if (req.body.time != null || req.body.start != null || req.body.end != null) {
      updates.time = normalizeBuildingTime(req.body);
    }
    const building = await Building.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true }).lean();
    if (!building) return res.status(404).json({ success: false, message: 'Building not found' });
    res.status(200).json({ success: true, building });
  } catch (error) {
    console.error('PUT /buildings/:id failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/buildings/:id', verifyToken, requireAdmin, async (req, res) => {
  const { Building, Classroom } = getModels(req, 'Building', 'Classroom');
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid building id' });
    }
    const inUse = await Classroom.countDocuments({ building: req.params.id });
    if (inUse > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: ${inUse} classroom(s) still reference this building.`,
      });
    }
    const building = await Building.findByIdAndDelete(req.params.id);
    if (!building) return res.status(404).json({ success: false, message: 'Building not found' });
    res.status(200).json({ success: true, message: 'Building deleted' });
  } catch (error) {
    console.error('DELETE /buildings/:id failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;


