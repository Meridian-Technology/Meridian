const express = require("express");
const router = express.Router();
const getModels = require("../services/getModelService");
const { verifyToken, authorizeRoles } = require("../middlewares/verifyToken");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public: sign up for Android closed testing
router.post("/signup", async (req, res) => {
  try {
    const { AndroidTesterSignup } = getModels(req, "AndroidTesterSignup");
    const { email, source = "mobile_landing" } = req.body;

    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await AndroidTesterSignup.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(200).json({
        success: true,
        message: "You're already on the list! We'll send you an invite soon.",
      });
    }

    const signup = new AndroidTesterSignup({
      email: normalizedEmail,
      source,
    });
    await signup.save();

    res.status(201).json({
      success: true,
      message: "You're on the list! We'll add you to the testing track and send an invite soon.",
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({
        success: true,
        message: "You're already on the list! We'll send you an invite soon.",
      });
    }
    console.error("Android tester signup error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
});

// Admin: list signups (for adding to Play Console)
router.get("/list", verifyToken, authorizeRoles("admin", "root"), async (req, res) => {
  try {
    const { AndroidTesterSignup } = getModels(req, "AndroidTesterSignup");
    const signups = await AndroidTesterSignup.find({})
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: signups,
      count: signups.length,
    });
  } catch (error) {
    console.error("Android tester list error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch signups" });
  }
});

// Admin: export as CSV (one email per line for easy copy into Play Console)
router.get("/export", verifyToken, authorizeRoles("admin", "root"), async (req, res) => {
  try {
    const { AndroidTesterSignup } = getModels(req, "AndroidTesterSignup");
    const signups = await AndroidTesterSignup.find({})
      .sort({ createdAt: -1 })
      .select("email createdAt")
      .lean();

    const csv = [
      "email,createdAt",
      ...signups.map((s) => `${s.email},${s.createdAt}`),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=android-testers.csv");
    res.send(csv);
  } catch (error) {
    console.error("Android tester export error:", error);
    res.status(500).json({ success: false, message: "Failed to export" });
  }
});

module.exports = router;
