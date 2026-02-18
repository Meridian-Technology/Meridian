import React from 'react';
import { Icon } from '@iconify-icon/react';
import HeaderContainer from '../HeaderContainer/HeaderContainer';
import './ProportionalBarList.scss';

/**
 * A reusable list component where each row has a proportional grey bar behind it
 * (width = value / total). Wraps content in HeaderContainer with icon + title.
 *
 * @param {Object} props
 * @param {Array<{ key: string, label: string, icon?: string, value: number }>} props.items - Data items
 * @param {string} [props.header] - Header title (shown in HeaderContainer)
 * @param {string} [props.icon] - Iconify icon for header
 * @param {string} [props.classN] - Class for HeaderContainer (e.g. 'analytics-card')
 * @param {string} [props.size] - Icon size (default: '1rem')
 * @param {(value: number) => string} [props.formatValue] - Format the value display (default: Intl.NumberFormat)
 * @param {'count-desc'|'count-asc'|'label'|'none'} [props.sortBy] - Sort order (default: 'count-desc')
 * @param {boolean} [props.filterZero] - Hide items with value 0 (default: true)
 * @param {boolean} [props.showBarChart] - Show proportional bars (default: true)
 * @param {string} [props.barColor] - Bar background color (default: rgba(128,128,128,0.15))
 * @param {string} [props.backgroundColor] - Card background (default: #fff)
 * @param {string} [props.emptyMessage] - Message when no items (default: 'No data')
 * @param {string} [props.className] - Additional class for the list table
 */
function ProportionalBarList({
    items = [],
    header = 'Sources',
    icon = 'mdi:source-branch',
    classN = '',
    size = '1rem',
    formatValue = (v) => new Intl.NumberFormat().format(v),
    sortBy = 'count-desc',
    filterZero = true,
    showBarChart = true,
    barColor,
    backgroundColor,
    emptyMessage = 'No data',
    className = '',
}) {
    let processed = [...items];
    if (filterZero) {
        processed = processed.filter((item) => (item.value ?? 0) > 0);
    }
    if (sortBy === 'count-desc') {
        processed.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    } else if (sortBy === 'count-asc') {
        processed.sort((a, b) => (a.value ?? 0) - (b.value ?? 0));
    } else if (sortBy === 'label') {
        processed.sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
    }

    const total = processed.reduce((sum, item) => sum + (item.value ?? 0), 0);

    const tableContent =
        processed.length === 0 ? (
            <div className="proportional-bar-list__empty">{emptyMessage}</div>
        ) : (
            <div
                className={`proportional-bar-list__table ${className}`.trim()}
                style={backgroundColor ? { '--pbl-bg': backgroundColor } : undefined}
            >
                <div className="proportional-bar-list__rows">
                    {processed.map(({ key, label, icon, value }) => (
                        <div key={key} className="proportional-bar-list__row">
                            {showBarChart && (
                                <div
                                    className="proportional-bar-list__bar"
                                    style={{
                                        width: `${total > 0 ? ((value ?? 0) / total) * 100 : 0}%`,
                                        ...(barColor && { background: barColor }),
                                    }}
                                />
                            )}
                            <div className="proportional-bar-list__row-content">
                                <div className="proportional-bar-list__label-wrap">
                                    {icon && (
                                        <div className="proportional-bar-list__icon-wrap">
                                            <Icon icon={icon} className="proportional-bar-list__icon" />
                                        </div>
                                    )}
                                    <span className="proportional-bar-list__label">{label}</span>
                                </div>
                                <span className="proportional-bar-list__value">
                                    {formatValue(value ?? 0)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );

    return (
        <HeaderContainer icon={icon} header={header} classN={classN} size={size}>
            <div className="card-content">{tableContent}</div>
        </HeaderContainer>
    );
}

export default ProportionalBarList;
