#!/usr/bin/env node
/**
 * Generate a QR code for the React frontend at http://<local-ip>:3000
 * Run from Meridian root: node scripts/qr-frontend.js
 */

const os = require('os');
const path = require('path');
// Use qrcode from backend (avoids adding dep to root)
const QRCode = require(path.join(__dirname, '../backend/node_modules/qrcode'));

const PORT = 3000;

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

async function main() {
  const ip = getLocalIP();
  const url = `http://${ip}:${PORT}`;

  console.log(`\n  React frontend URL: ${url}\n`);

  try {
    const qrString = await QRCode.toString(url, { type: 'terminal', small: true });
    console.log(qrString);
    console.log(`  Scan with your phone to open: ${url}\n`);
  } catch (err) {
    console.error('Failed to generate QR code:', err.message);
    process.exit(1);
  }
}

main();
