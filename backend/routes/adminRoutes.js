const express = require('express');
const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middlewares/verifyToken');
const mongoose = require('mongoose');
const {connectToDatabase} = require('../connectionsManager')

router.get('/health', async (req, res) => {
  try {
     // Start timer
     const mongooseConn = await connectToDatabase(req.school);
     console.log(req.school);
     const nativeDb = mongooseConn.db;
 
     const start = performance.now();
     const dbStatus = await nativeDb.admin().ping();
     const end = performance.now();
     const latencyMs = (end - start).toFixed(2);
 
 
    const cronJobLastRun = new Date(); // implement this from your cron logs
    const cronStatus = Date.now() - new Date(cronJobLastRun).getTime() < 5 * 60 * 1000;

    const authSystemHealthy = true; // Add logic if needed

    res.json({
        statuses:{
            backend: { status: true, uptime: process.uptime() },
            database: { status: dbStatus.ok === 1, latency: latencyMs }, 
            cronJobs: { status: cronStatus, lastRun: cronJobLastRun },
            auth: { status: authSystemHealthy },
            frontend: { status: true, build: 'v1.2.3', deployedAt: '2025-04-20T16:00:00Z' } // example static
        },
        subDomain: req.school
    });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ error: 'Site health check failed', details: err.message });
  }
});

async function getLastCronRun() {
  // Replace with actual query from your cron log collection
  return new Date(); // stubbed
}

async function checkExternalApi() {
  try {
    const response = await fetch('https://api.stripe.com'); // use HEAD or lightweight endpoint
    return response.ok;
  } catch {
    return false;
  }
}

module.exports = router;
