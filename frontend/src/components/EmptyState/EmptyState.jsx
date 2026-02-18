import React from 'react';
import { Icon } from '@iconify-icon/react';
import './EmptyState.scss';

/**
 * Standardized empty state for lists, modals, and sections.
 * @param {string} [icon] - Iconify icon name (e.g. 'mdi:calendar-blank')
 * @param {string} [title] - Heading text
 * @param {string} [description] - Body text
 * @param {Array<{ label: string, onClick: function, primary?: boolean }>|React.ReactNode} [actions] - Buttons or custom action area
 * @param {string} [className] - Extra class for the root element
 */
function EmptyState({ icon, title, description, actions, className = '' }) {
    const hasActions = Array.isArray(actions) ? actions.length > 0 : actions != null;

    return (
        <div className={`empty-state ${className}`.trim()} role="status" aria-label={title || 'Empty'}>
            {icon && (
                <span className="empty-state__icon" aria-hidden>
                    <Icon icon={icon} />
                </span>
            )}
            {title && <h4 className="empty-state__title">{title}</h4>}
            {description && <p className="empty-state__description">{description}</p>}
            {hasActions && (
                <div className="empty-state__actions">
                    {Array.isArray(actions)
                        ? actions.map((action, i) => (
                              <button
                                  key={i}
                                  type="button"
                                  className={`empty-state__btn ${action.primary ? 'empty-state__btn--primary' : ''}`}
                                  onClick={action.onClick}
                              >
                                  {action.label}
                              </button>
                          ))
                        : actions}
                </div>
            )}
        </div>
    );
}

export default EmptyState;
