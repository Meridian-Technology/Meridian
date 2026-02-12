import React from 'react';
import HeaderContainer from '../HeaderContainer/HeaderContainer';
import './TextareaExpandPopup.scss';

const TextareaExpandPopup = ({
    label,
    value,
    onChange,
    placeholder,
    maxLength,
    minLength,
}) => {
    const displayValue = value === null || value === undefined ? '' : value;

    return (
        <div className="textarea-expand-popup">
            <HeaderContainer
                icon="mdi:text-box-outline"
                header={label}
                classN="textarea-expand-popup-header"
            >
                <textarea
                    className="textarea-expand-popup-editor"
                    value={displayValue}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    rows={16}
                    maxLength={maxLength}
                    minLength={minLength}
                    autoFocus
                />
            </HeaderContainer>
        </div>
    );
};

export default TextareaExpandPopup;
