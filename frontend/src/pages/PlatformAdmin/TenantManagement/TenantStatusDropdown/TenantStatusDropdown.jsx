import React, { useEffect, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { TENANT_STATUS_OPTIONS } from '../tenantStatusConstants';
import '../../../ClubDash/OrgDropdown/OrgDropdown.scss';
import './TenantStatusDropdown.scss';

function TenantStatusDropdown({ value, disabled, onSelect }) {
  const [showDrop, setShowDrop] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  const current = TENANT_STATUS_OPTIONS.find((o) => o.value === value) || TENANT_STATUS_OPTIONS[0];

  useEffect(() => {
    if (showDrop) {
      setShouldRender(true);
      setIsAnimating(true);
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => setShouldRender(false), 200);
      return () => clearTimeout(timer);
    }
  }, [showDrop]);

  const toggleDrop = () => {
    if (disabled) return;
    setShowDrop((prev) => !prev);
  };

  const handleSelect = (nextStatus) => {
    setShowDrop(false);
    onSelect(nextStatus);
  };

  return (
    <div
      className={`org-dropdown tenant-status-dropdown ${disabled ? 'is-disabled' : ''}`}
      onClick={toggleDrop}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleDrop();
        }
      }}
      aria-expanded={showDrop}
      aria-haspopup="listbox"
      aria-label="Tenant status"
    >
      <Icon icon={current.icon} width={22} height={22} className="tenant-status-dropdown__leading-icon" />
      <div className="tenant-status-dropdown__titles">
        <h1 title={current.label}>{current.label}</h1>
        <span className="tenant-status-dropdown__key">Visibility</span>
      </div>
      <Icon
        className="tenant-status-dropdown__chevron"
        icon={showDrop ? 'ic:round-keyboard-arrow-up' : 'ic:round-keyboard-arrow-down'}
        width="24"
        height="24"
      />
      {shouldRender ? (
        <div className={`dropdown ${!isAnimating ? 'dropdown-exit' : ''}`} onClick={(e) => e.stopPropagation()}>
          <div className="org-list" role="listbox">
            {TENANT_STATUS_OPTIONS.map((option) => (
              <div
                key={option.value}
                className={`drop-option ${option.value === value ? 'selected' : ''}`}
                role="option"
                aria-selected={option.value === value}
                onClick={() => handleSelect(option.value)}
              >
                <Icon icon={option.icon} width={22} height={22} className="tenant-status-dropdown__row-icon" />
                <div className="tenant-status-dropdown__option-text">
                  <p>{option.label}</p>
                  <span className="tenant-status-dropdown__meta">{option.meta}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default TenantStatusDropdown;
