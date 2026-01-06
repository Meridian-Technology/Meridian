const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/verifyToken');
const { Resend } = require('resend');
const { render } = require('@react-email/render');
const React = require('react');
const EmailVerification = require('../emails/EmailVerification').default;
const resend = new Resend(process.env.RESEND_API_KEY);
const getModels  = require('../services/getModelService.js');

//store verification codes temporarily, may have to change to redis in production
const verificationCodes = new Map();

//request verification code
router.post('/request', verifyToken, async (req, res) => {
    const { email } = req.body;
    const userId = req.user.userId;

    try {
        //validate email format
        if (!email.endsWith('.edu')) {
            return res.status(400).json({
                success: false,
                message: 'Please use a valid .edu email address'
            });
        }

        const { User } = getModels(req, 'User');

        //check if email is already verified by another user
        const existingUser = await User.findOne({ 
            affiliatedEmail: email,
            affiliatedEmailVerified: true
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'This .edu email is already verified by another user'
            });
        }

        //generate a 6-digit verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        //store the code with the user ID and an expiration time (30 minutes)
        verificationCodes.set(email, {
            code: verificationCode,
            userId: userId,
            expiresAt: Date.now() + 30 * 60 * 1000 // 30 minutes
        });

        //send email with verification code
        const emailHTML = await render(React.createElement(EmailVerification, { 
            name: req.user.username || 'User', 
            code: verificationCode 
        }));

        const { data, error } = await resend.emails.send({
            from: "Study Compass <support@study-compass.com>",
            to: [email],
            subject: "Verify Your .edu Email",
            html: emailHTML,
        });

        if (error) {
            console.log('POST: /verify-affiliated-email/request email sending error', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Error sending verification email', 
                error: error.message 
            });
        }

        console.log(`POST: /verify-affiliated-email/request verification code sent to ${email}`);
        res.status(200).json({ 
            success: true, 
            message: 'Verification code sent successfully' 
        });
    } catch (error) {
        console.log(`POST: /verify-affiliated-email/request failed`, error);
        res.status(500).json({
            success: false,
            message: 'Error processing verification request',
            error: error.message
        });
    }
});

router.post('/verify', verifyToken, async (req, res) => {
    const { email, code } = req.body;
    const userId = req.user.userId;

    try {
        const storedData = verificationCodes.get(email);
        
        if (!storedData) {
            return res.status(400).json({
                success: false,
                message: 'No verification code found for this email'
            });
        }
        
        if (storedData.code !== code) {
            return res.status(400).json({
                success: false,
                message: 'Invalid verification code'
            });
        }
        
        if (Date.now() > storedData.expiresAt) {
            verificationCodes.delete(email);
            return res.status(400).json({
                success: false,
                message: 'Verification code has expired. Please request a new one.'
            });
        }

        const { User } = getModels(req, 'User');

        await User.findByIdAndUpdate(userId, {
            affiliatedEmail: email,
            affiliatedEmailVerified: true
        });

        //remove the used code
        verificationCodes.delete(email);

        console.log(`POST: /verify-affiliated-email/verify email verified for user ${userId}`);
        res.status(200).json({
            success: true,
            message: 'Email verified successfully'
        });
    } catch (error) {
        console.log(`POST: /verify-affiliated-email/verify failed`, error);
        res.status(500).json({
            success: false,
            message: 'Error verifying email',
            error: error.message
        });
    }
});


router.post('/unlink', verifyToken, async (req, res) => {
    try {
        const { User } = getModels(req, 'User');
        
        // Find user by ID
        const user = await User.findById(req.user.userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        user.affiliatedEmail = null;
        await user.save();

        console.log(`POST: /unlink-school-email school email unlinked for user ${user.username}`);
        res.status(200).json({
            success: true,
            message: 'School email unlinked successfully'
        });
    } catch (error) {
        console.log(`POST: /unlink-school-email failed`, error);
        res.status(500).json({
            success: false,
            message: 'Error unlinking school email',
            error: error.message
        });
    }
});

module.exports = router; 