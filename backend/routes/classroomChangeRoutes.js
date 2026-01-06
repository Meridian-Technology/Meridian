const express = require('express');
const classroomSchema = require('../schemas/classroom.js');
const scheduleSchema = require('../schemas/schedule.js');
const ratingSchema = require('../schemas/rating.js');
const userSchema = require('../schemas/user.js');
const reportSchema = require('../schemas/report.js');
const { verifyToken, authorizeRoles } = require('../middlewares/verifyToken');
const { sortByAvailability } = require('../helpers.js');
const multer = require('multer');
const path = require('path');
const s3 = require('../aws-config');
const mongoose = require('mongoose');
const { clean } = require('../services/profanityFilterService');
const getModels = require('../services/getModelService');

const router = express.Router();

router.post('/changeclassroom', async (req, res) => {
    const id = req.body.id;
    const attributes = req.body.attributes;
    const imageUrl = req.body.imageUrl;

    try{
        const Classroom = mongoose.model('Classroom', classroomSchema, 'classrooms1');

        const classroom = await Classroom.findOne({_id: id});

        if (!classroom) {
            return res.status(404).json({ success: false, message: "Classroom not found" });
        }
        if(imageUrl !== ""){
            classroom.image = `/classrooms/${imageUrl}`;
        }
        classroom.attributes = attributes;
        await classroom.save();
        console.log(`POST: /changeclassroom/${id}`);
        res.json({ success: true, message: "Room changed" });
    } catch (error) {
        res.status(500).json({success: false, message: 'Error changing data', error: error.message });
    }
});

// Route to save a classroom to a user's saved list, expects a room and user ID
router.post('/save', verifyToken, async (req, res) => {
    const roomId = req.body.roomId;
    const userId = req.user.userId;
    const operation = req.body.operation; // true is add, false is remove
    const { Classroom, User } = getModels(req, 'Classroom', 'User');

    try {
        const classroom = await Classroom.findOne({ _id: roomId });
        if (!classroom) {
            console.log(`POST: /save/${roomId}/${userId} failed`);
            return res.status(404).json({ success: false, message: "Classroom not found" });
        }
        const user = await User.findOne({ _id: userId });
        if (!user) {
            console.log(`POST: /save/${roomId}/${userId} failed`);
            return res.status(404).json({ success: false, message: "User not found" });
        }
        if (operation && user.saved.includes(classroom._id)) {
            console.log(`POST: /save/${roomId}/${userId} failed`);
            return res.status(409).json({ success: false, message: "Room already saved" });
        }
        if (!operation && !user.saved.includes(classroom._id)) {
            console.log(`POST: /save/${roomId}/${userId} failed`);
            return res.status(409).json({ success: false, message: "Room not saved" });
        }
        if (!operation) {
            user.saved = user.saved.filter(id => id !== roomId);
            await user.save();
            console.log(`POST: /save/${roomId}/${userId}`);
            return res.json({ success: true, message: "Room removed" });
        } else {
            user.saved.push(roomId);
            await user.save();
            console.log(`POST: /save/${roomId}/${user}`);
            res.json({ success: true, message: "Room saved" });
        }
    } catch (error) {
        console.log(`POST: /save/${roomId}/${userId} failed`);
        res.status(500).json({ success: false, message: 'Error saving room', error: error.message });
    }
});


const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
});

router.post('/upload-image/:classroomName', upload.single('image'), async (req, res) => {
  const classroomName = req.params.classroomName;
  const file = req.file;

  if (!file) {
    return res.status(400).send('No file uploaded.');
  }

  const s3Params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: `${classroomName}/${Date.now()}_${path.basename(file.originalname)}`,
    Body: file.buffer,
    ContentType: file.mimetype,
    // ACL: 'public-read', // Make the file publicly accessible
  };

  try {
    const Classroom = mongoose.model('Classroom', classroomSchema, 'classrooms1');
    // Upload image to S3
    const s3Response = await s3.upload(s3Params).promise();
    const imageUrl = s3Response.Location;

    // Find the classroom and update the image attribute
    const classroom = await Classroom.findOneAndUpdate(
      { name: classroomName },
      { image: imageUrl },
      { new: true, upsert: true }
    );

    res.status(200).json({ message: 'Image uploaded and classroom updated.', classroom });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while uploading the image or updating the classroom.');
  }
});

router.post('/main-search-change', verifyToken, authorizeRoles('admin'), async (req, res) => {
    const userId = req.user.userId;
    const classroomId = req.body.classroomId;
    try{
        const Classroom = mongoose.model('Classroom', classroomSchema, 'classrooms1');
        const User = mongoose.model('User', userSchema, 'users');

        const user = await User.findOne({ _id: userId });
        if (!user) {
            console.log(`POST: /main-search-change/${userId} failed`);
            return res.status(404).json({ success: false, message: "User not found" });
        }
        if(!user.roles.includes('admin')) {
            console.log(`POST: /main-search-change/${userId} failed`);
            return res.status(403).json({ success: false, message: "User not authorized" });
        }
        const classroom = await Classroom.findOne({ _id: classroomId });
        if (!classroom) {
            console.log(`POST: /main-search-change/${userId} failed`);
            return res.status(404).json({ success: false, message: "Classroom not found" });
        }
        classroom.mainSearch = !classroom.mainSearch;
        await classroom.save();
        console.log(`POST: /main-search-change/${userId}`);
        res.json({ success: true, message: "Main search changed" });
    } catch(error){
        return res.status(500).json({ success: false, message: 'Error finding user', error: error.message});
    }
});


module.exports = router;
