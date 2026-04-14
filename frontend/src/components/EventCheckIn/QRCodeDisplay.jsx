import React, { useRef, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { QRCodeCanvas } from 'qrcode.react';
import './EventCheckIn.scss';

function QRCodeDisplay({ qrCode, checkInUrl, eventName }) {
    const [copied, setCopied] = useState(false);
    const qrCanvasRef = useRef(null);

    const getCanvasBlob = () => {
        if (!qrCanvasRef.current) return Promise.resolve(null);
        return new Promise((resolve) => {
            qrCanvasRef.current.toBlob((blob) => resolve(blob), 'image/png');
        });
    };

    const handleDownload = () => {
        if (checkInUrl && qrCanvasRef.current) {
            const link = document.createElement('a');
            link.href = qrCanvasRef.current.toDataURL('image/png');
            link.download = `${eventName || 'event'}-checkin-qr.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
        }
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
                const blob = checkInUrl
                    ? await getCanvasBlob()
                    : await fetch(qrCode).then(r => r.blob());
                const files = blob
                    ? [new File([blob], `${eventName || 'event'}-checkin-qr.png`, { type: 'image/png' })]
                    : undefined;
                await navigator.share({
                    title: `Check-in QR Code - ${eventName}`,
                    text: `Scan this QR code to check in to ${eventName}`,
                    ...(checkInUrl ? { url: checkInUrl } : {}),
                    ...(files ? { files } : {})
                });
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Error sharing QR code:', error);
                }
            }
        } else {
            // Fallback: copy image to clipboard
            try {
                const blob = checkInUrl
                    ? await getCanvasBlob()
                    : await fetch(qrCode).then(r => r.blob());
                if (blob && typeof ClipboardItem !== 'undefined') {
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]);
                } else if (checkInUrl) {
                    await navigator.clipboard.writeText(checkInUrl);
                }
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
                {checkInUrl ? (
                    <QRCodeCanvas
                        value={checkInUrl}
                        size={240}
                        level="M"
                        includeMargin
                        ref={qrCanvasRef}
                        className="qr-code-image"
                    />
                ) : (
                    <img src={qrCode} alt="Check-in QR Code" className="qr-code-image" />
                )}
            </div>
            <div className="qr-code-actions">
                <button className="action-button" onClick={handleDownload}>
                    <Icon icon="mingcute:download-fill" />
                    Download
                </button>
                <button className="action-button" onClick={handleShare}>
                    <Icon icon={copied ? 'mdi:check' : 'mingcute:share-forward-fill'} />
                    {copied ? 'Copied!' : 'Share'}
                </button>
            </div>
        </div>
    );
}

export default QRCodeDisplay;
