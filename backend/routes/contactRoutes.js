const express = require("express");
const router = express.Router();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Contact form submission route
router.post('/contact', async (req, res) => {
    try {
        const { firstName, lastName, email, organization, message } = req.body;

        // Validate required fields
        if (!firstName || !lastName || !email || !message) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please fill in all required fields' 
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide a valid email address' 
            });
        }

        // Escape HTML to prevent XSS attacks
        const escapeHtml = (text) => {
            if (!text) return '';
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const escapedFirstName = escapeHtml(firstName);
        const escapedLastName = escapeHtml(lastName);
        const escapedEmail = escapeHtml(email);
        const escapedOrganization = escapeHtml(organization);
        const escapedMessage = escapeHtml(message).replace(/\n/g, '<br>');

        // Format email content
        const emailHTML = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">New Contact Form Submission</h2>
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Name:</strong> ${escapedFirstName} ${escapedLastName}</p>
                    <p><strong>Email:</strong> ${escapedEmail}</p>
                    ${escapedOrganization ? `<p><strong>Organization:</strong> ${escapedOrganization}</p>` : ''}
                </div>
                <div style="margin: 20px 0;">
                    <h3 style="color: #333;">Message:</h3>
                    <p style="white-space: pre-wrap; line-height: 1.6;">${escapedMessage}</p>
                </div>
            </div>
        `;

        const emailText = `
New Contact Form Submission

Name: ${firstName} ${lastName}
Email: ${email}
${organization ? `Organization: ${organization}` : ''}

Message:
${message}
        `;

        // Send email using Resend API (https://resend.com/docs/api-reference/emails/send-email)
        const { data, error } = await resend.emails.send({
            from: 'Meridian Contact Form <support@study-compass.com>',
            to: ['raven@meridian.study', 'james@meridian.study'],
            replyTo: email,
            subject: `${organization} Demo Request`,
            html: emailHTML,
            text: emailText,
        });

        if (error) {
            console.log('POST: contact email sending error', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Error sending email', 
                error: error.message 
            });
        }

        res.status(200).json({ 
            success: true, 
            message: 'Contact form submitted successfully', 
            data 
        });
    } catch (error) {
        console.log('POST: contact form error', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error processing contact form', 
            error: error.message 
        });
    }
});

module.exports = router;

