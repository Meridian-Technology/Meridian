import React from 'react';
import { Icon } from '@iconify-icon/react';
import './MetricCard.scss';

/**
 * MetricCard Component
 * 
 * A reusable metric card component with dynamic color theming via CSS custom properties.
 * 
 * @param {string} icon - Iconify icon name (e.g., 'mingcute:calendar-fill')
 * @param {string} title - Card title text
 * @param {string|number} value - Main metric value
 * @param {string} label - Optional label text below the value
 * @param {string} color - Color as hex value (e.g., '#4DAA57', '#17a2b8', '#28a745')
 * @param {string} size - Size variant: 'small', 'medium', 'large'
 * @param {string} className - Additional CSS classes
 * @param {object} style - Custom styles object (can override CSS custom properties)
 * @param {function} onClick - Optional click handler
 * 
 * @example
 * <MetricCard
 *   icon="mingcute:calendar-fill"
 *   title="Total Events"
 *   value={42}
 *   label="This month"
 *   color="#4DAA57"
 *   size="medium"
 * />
 * 
 * @example
 * // Custom colors via style prop
 * <MetricCard
 *   icon="mingcute:heart-fill"
 *   title="Likes"
 *   value={1234}
 *   style={{
 *     '--metric-title-color': '#333',
 *     '--metric-value-color': '#ff6b6b'
 *   }}
 * />
 */

function MetricCard({ 
    icon, 
    title, 
    value, 
    label, 
    color = '#4DAA57',
    size = 'medium',
    className = '',
    style = {},
    onClick 
}) {
    const getSizeClass = (size) => {
        const sizeMap = {
            'small': 'small',
            'medium': 'medium',
            'large': 'large'
        };
        return sizeMap[size] || 'medium';
    };

    const formatValue = (value) => {
        if (typeof value === 'number') {
            return new Intl.NumberFormat().format(value);
        }
        return value;
    };

    // Create inline styles with color variables
    const cardStyle = {
        '--metric-color': color,
        '--metric-title-color': '#6c757d',
        '--metric-value-color': '#2c3e50',
        '--metric-label-color': '#6c757d',
        ...style
    };

    return (
        <div 
            className={`metric-card ${getSizeClass(size)} ${className}`}
            style={cardStyle}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            <div className="metric-icon">
                <Icon icon={icon} />
            </div>
            <div className="metric-content">
                <h4 className="metric-title">{title}</h4>
                <p className="metric-value">{formatValue(value)}</p>
                {label && <p className="metric-label">{label}</p>}
            </div>
        </div>
    );
}

export default MetricCard;
