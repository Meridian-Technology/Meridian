import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import './EventCheckIn.scss';

function QRCodeDisplay({ qrCode, eventName }) {
    const [copied, setCopied] = useState(false);

    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = qrCode;
        link.download = `${eventName || 'event'}-checkin-qr.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Check-in QR Code - ${eventName}`,
                    text: `Scan this QR code to check in to ${eventName}`,
                    files: [await fetch(qrCode).then(r => r.blob())]
                });
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Error sharing QR code:', error);
                }
            }
        } else {
            // Fallback: copy image to clipboard
            try {
                const response = await fetch(qrCode);
                const blob = await response.blob();
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch (error) {
                console.error('Error copying QR code:', error);
            }
        }
    };

    return (
        <div className="qr-code-display">
            <div className="qr-code-image-container">
                <img src={qrCode} alt="Check-in QR Code" className="qr-code-image" />
            </div>
            <div className="qr-code-actions">
                <button className="action-button" onClick={handleDownload}>
                    <Icon icon="mdi:download" />
                    Download
                </button>
                <button className="action-button" onClick={handleShare}>
                    <Icon icon={copied ? 'mdi:check' : 'mdi:share'} />
                    {copied ? 'Copied!' : 'Share'}
                </button>
            </div>
        </div>
    );
}

export default QRCodeDisplay;
