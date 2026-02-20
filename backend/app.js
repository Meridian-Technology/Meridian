const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const passport = require('passport');
require('dotenv').config();
const { createServer } = require('http');
const enforce = require('express-sslify');
const { connectToDatabase } = require('./connectionsManager');
const { initSocket } = require('./socket');

const s3 = require('./aws-config');

function createApp() {
  const app = express();
  const server = createServer(app);

  const corsOrigin = process.env.NODE_ENV === 'production'
    ? ['https://www.meridian.study', 'https://meridian.study']
    : 'http://localhost:3000';
  initSocket(server, { origin: corsOrigin });

  const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://www.meridian.study', 'https://meridian.study']
      : 'http://localhost:3000',
    credentials: true,
    optionsSuccessStatus: 200
  };

  app.set('trust proxy', true);

  app.get('/health', (req, res) => res.status(200).json({ ok: true }));

  app.use((req, res, next) => {
  const host = req.headers.host;
  if (host === 'meridian.study') {
    return res.redirect(301, 'https://www.meridian.study' + req.originalUrl);
  }
  next();
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(enforce.HTTPS({ trustProtoHeader: true }));
    app.use(cors(corsOptions));
  } else {
    app.use(cors(corsOptions));
  }

  // Other middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(passport.initialize());
  app.use(express.urlencoded({ extended: true }));

  app.use(async (req, res, next) => {
    try {
        // Debug logging to identify polling routes
        // const timestamp = new Date().toISOString();
        // const method = req.method;
        // const path = req.path || req.url;
        // const userAgent = req.get('user-agent') || 'unknown';
        
        // console.log(`[${timestamp}] ${method}: ${path} | School: ${req.headers.host?.split('.')[0] || 'unknown'} | User-Agent: ${userAgent.substring(0, 50)}`);
        
        const host = req.headers.host || '';
        // Extract subdomain: for 'rpi.meridian.study' -> 'rpi', for 'localhost:5001' or IP -> 'rpi'
        let subdomain = host.split('.')[0];
        
        // In development, if host is localhost or an IP address, default to 'rpi'
        if (host.includes('localhost') || /^\d+\.\d+\.\d+\.\d+/.test(subdomain) || !host.includes('.')) {
            subdomain = 'rpi';
        }
        
        req.db = await connectToDatabase(subdomain);
        req.school = subdomain;
        next();
    } catch (error) {
        console.error('Error establishing database connection:', error);
        res.status(500).send('Database connection error');
    }
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
    },
  });

  const authRoutes = require('./routes/authRoutes.js');
  const samlRoutes = require('./routes/samlRoutes.js');
  const dataRoutes = require('./routes/dataRoutes.js');
  const friendRoutes = require('./routes/friendRoutes.js');
  const userRoutes = require('./routes/userRoutes.js');
  const analyticsRoutes = require('./routes/analytics.js');
  const classroomChangeRoutes = require('./routes/classroomChangeRoutes.js');
  const ratingRoutes = require('./routes/ratingRoutes.js');
  const searchRoutes = require('./routes/searchRoutes.js');
  const orgRoutes = require('./routes/orgRoutes.js');
  const orgRoleRoutes = require('./routes/orgRoleRoutes.js');
  const orgManagementRoutes = require('./routes/orgManagementRoutes.js');
  const orgInviteRoutes = require('./routes/orgInviteRoutes.js');
  const orgMessageRoutes = require('./routes/orgMessageRoutes.js');
  const roomRoutes = require('./routes/roomRoutes.js');
  const adminRoutes = require('./routes/adminRoutes.js');
  const eventsRoutes = require('./events/index.js');
  const notificationRoutes = require('./routes/notificationRoutes.js');
  const qrRoutes = require('./routes/qrRoutes.js');
  const eventAnalyticsRoutes = require('./routes/eventAnalyticsRoutes.js');
  const orgEventManagementRoutes = require('./routes/orgEventManagementRoutes.js');
  const formRoutes = require('./routes/formRoutes.js');
  const inngestRoutes = require('./routes/inngestRoutes.js');
  const inngestServe = require('./inngest/serve.js');
  const studySessionRoutes = require('./routes/studySessionRoutes.js');
  const availabilityPollRoutes = require('./routes/availabilityPollRoutes.js');
  const feedbackRoutes = require('./routes/feedbackRoutes.js');
  const contactRoutes = require('./routes/contactRoutes.js');
  const affiliatedEmailRoutes = require('./routes/affiliatedEmailRoutes.js');
  const resourcesRoutes = require('./routes/resourcesRoutes.js');
  const shuttleConfigRoutes = require('./routes/shuttleConfigRoutes.js');

  app.use(authRoutes);
  app.use('/auth/saml', samlRoutes);
  app.use(dataRoutes);
  app.use(friendRoutes);
  app.use(userRoutes);
  app.use(analyticsRoutes);
  app.use('/event-analytics', eventAnalyticsRoutes);
  app.use(classroomChangeRoutes);
  app.use(ratingRoutes);
  app.use(searchRoutes);
  app.use(orgRoutes);
  app.use('/org-roles', orgRoleRoutes);
  app.use('/org-management', orgManagementRoutes);
  app.use('/org-invites', orgInviteRoutes);
  app.use('/org-messages', orgMessageRoutes);
  app.use('/org-event-management', orgEventManagementRoutes);
  app.use('/admin', roomRoutes);
  app.use(adminRoutes);
  app.use(formRoutes);
  app.use('/notifications', notificationRoutes);
  app.use('/api/qr', qrRoutes);
  app.use(contactRoutes);
  app.use('/api/inngest', inngestServe);
  app.use('/api/inngest-examples', inngestRoutes);
  app.use(eventsRoutes);
  app.use('/study-sessions', studySessionRoutes);
  app.use('/availability-polls', availabilityPollRoutes);
  app.use('/feedback', feedbackRoutes);
  app.use('/api/resources', resourcesRoutes);
  app.use('/api/shuttle-config', shuttleConfigRoutes);
  app.use('/verify-affiliated-email', affiliatedEmailRoutes);

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../frontend/build')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
    });
  }

  app.post('/upload-image/:classroomName', upload.single('image'), async (req, res) => {
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
        ACL: 'public-read', // Make the file publicly accessible
    };

    try {
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

  // greet route
  app.get('/api/greet', (req, res) => {
    res.send('Hello from the backend!');
  });

  return { app, server };
}

module.exports = { createApp };
