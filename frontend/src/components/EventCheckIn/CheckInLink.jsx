import React, { useState } from 'react';
import { Icon } from '@iconify-icon/react';
import './EventCheckIn.scss';

function CheckInLink({ checkInUrl, eventName }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(checkInUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Error copying link:', error);
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = checkInUrl;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Check-in Link - ${eventName}`,
                    text: `Check in to ${eventName}`,
                    url: checkInUrl
                });
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Error sharing link:', error);
                }
            }
        } else {
            // Fallback: copy to clipboard
            handleCopy();
        }
    };

    return (
        <div className="checkin-link-display">
            <div className="link-container">
                <input 
                    type="text" 
                    value={checkInUrl} 
                    readOnly 
                    className="link-input"
                    onClick={(e) => e.target.select()}
                />
            </div>
            <div className="link-actions">
                <button className="action-button" onClick={handleCopy}>
                    <Icon icon={copied ? 'mdi:check' : 'mdi:content-copy'} />
                    {copied ? 'Copied!' : 'Copy'}
                </button>
                <button className="action-button" onClick={handleShare}>
                    <Icon icon="mdi:share" />
                    Share
                </button>
            </div>
        </div>
    );
}

export default CheckInLink;
