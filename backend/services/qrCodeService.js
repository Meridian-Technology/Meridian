const QRCode = require('qrcode');

/**
 * Generate QR code data URL for event check-in
 * @param {string} checkInUrl - The full check-in URL
 * @returns {Promise<string>} - Data URL of the QR code image
 */
async function generateQRCodeDataURL(checkInUrl) {
    try {
        const qrCodeDataURL = await QRCode.toDataURL(checkInUrl, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            width: 400,
            margin: 2
        });
        return qrCodeDataURL;
    } catch (error) {
        console.error('Error generating QR code:', error);
        throw new Error('Failed to generate QR code');
    }
}

/**
 * Generate QR code buffer for event check-in
 * @param {string} checkInUrl - The full check-in URL
 * @returns {Promise<Buffer>} - Buffer of the QR code image
 */
async function generateQRCodeBuffer(checkInUrl) {
    try {
        const qrCodeBuffer = await QRCode.toBuffer(checkInUrl, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            width: 400,
            margin: 2
        });
        return qrCodeBuffer;
    } catch (error) {
        console.error('Error generating QR code buffer:', error);
        throw new Error('Failed to generate QR code buffer');
    }
}

/**
 * Generate check-in URL for an event
 * @param {string} eventId - Event ID
 * @param {string} token - Check-in token
 * @param {Object} req - Express request object (for determining base URL)
 * @returns {string} - Full check-in URL
 */
function generateCheckInUrl(eventId, token, req) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const school = req?.school || 'rpi';
    
    let baseUrl;
    if (isDevelopment) {
        baseUrl = 'http://localhost:3000';
    } else {
        // Use www.meridian.study for production
        baseUrl = 'https://www.meridian.study';
    }
    
    return `${baseUrl}/check-in/${eventId}/${token}`;
}

module.exports = {
    generateQRCodeDataURL,
    generateQRCodeBuffer,
    generateCheckInUrl
};
