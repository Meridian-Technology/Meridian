const express = require('express');
const https = require('https');
const http = require('http');

const router = express.Router();

/**
 * Proxy images from S3 for PDF export. html2canvas cannot capture cross-origin images
 * (S3) due to CORS, so we fetch server-side and stream back as same-origin.
 * Only allows URLs from our S3 bucket.
 */
router.get('/', (req, res) => {
    const url = req.query.url;
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Missing url parameter' });
    }

    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return res.status(400).json({ error: 'Invalid URL' });
    }

    // Only allow HTTPS
    if (parsed.protocol !== 'https:') {
        return res.status(400).json({ error: 'Only HTTPS URLs allowed' });
    }

    // Only allow our S3 bucket (e.g. bucket.s3.amazonaws.com or bucket.s3.region.amazonaws.com)
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    const host = parsed.hostname.toLowerCase();
    const isAllowed = bucketName && host.includes(bucketName);

    if (!isAllowed) {
        return res.status(403).json({ error: 'URL not from allowed image source' });
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const proxyReq = client.get(url, (proxyRes) => {
        if (proxyRes.statusCode !== 200) {
            res.status(proxyRes.statusCode).json({ error: 'Failed to fetch image' });
            return;
        }
        const contentType = proxyRes.headers['content-type'] || 'image/jpeg';
        if (!contentType.startsWith('image/')) {
            res.status(400).json({ error: 'URL does not point to an image' });
            return;
        }
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('[proxy-image] fetch error:', err.message);
        res.status(502).json({ error: 'Failed to fetch image' });
    });

    proxyReq.setTimeout(10000, () => {
        proxyReq.destroy();
        res.status(504).json({ error: 'Image fetch timeout' });
    });
});

module.exports = router;
