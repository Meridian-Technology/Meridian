const express = require('express');
const { verifyToken, authorizeRoles } = require('../middlewares/verifyToken');
const getModels = require('../services/getModelService');
const multer = require('multer');
const path = require('path');
const { uploadImageToS3 } = require('../services/imageUploadService');

const router = express.Router();

// List rooms with optional search/pagination
router.get('/rooms', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
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
router.get('/rooms/:id', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
  const { Classroom } = getModels(req, 'Classroom');
  try {
    const room = await Classroom.findById(req.params.id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    res.status(200).json({ success: true, room });
  } catch (error) {
    console.error('GET /rooms/:id failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create room
router.post('/rooms', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
  const { Classroom } = getModels(req, 'Classroom');
  const { name, image = '/classrooms/default.png', attributes = [], mainSearch = true } = req.body;
  try {
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    const existing = await Classroom.findOne({ name });
    if (existing) return res.status(400).json({ success: false, message: 'Room name already exists' });

    const room = new Classroom({ name, image, attributes, mainSearch });
    await room.save();
    res.status(201).json({ success: true, room });
  } catch (error) {
    console.error('POST /rooms failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update room
router.put('/rooms/:id', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
  const { Classroom } = getModels(req, 'Classroom');
  const updates = req.body;
  try {
    if (updates.name) {
      const exists = await Classroom.findOne({ name: updates.name, _id: { $ne: req.params.id } });
      if (exists) return res.status(400).json({ success: false, message: 'Room name already exists' });
    }
    const room = await Classroom.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    res.status(200).json({ success: true, room });
  } catch (error) {
    console.error('PUT /rooms/:id failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete room
router.delete('/rooms/:id', verifyToken, authorizeRoles('admin', 'root'), async (req, res) => {
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
router.post('/rooms/:id/image', verifyToken, authorizeRoles('admin', 'root'), upload.single('image'), async (req, res) => {
  const { Classroom } = getModels(req, 'Classroom');
  try {
    const room = await Classroom.findById(req.params.id);
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

module.exports = router;


