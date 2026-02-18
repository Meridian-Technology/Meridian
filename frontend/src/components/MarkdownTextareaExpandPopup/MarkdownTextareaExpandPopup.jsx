import React from 'react';
import HeaderContainer from '../HeaderContainer/HeaderContainer';
import MarkdownTextarea from '../MarkdownTextarea/MarkdownTextarea';
import './MarkdownTextareaExpandPopup.scss';

const MarkdownTextareaExpandPopup = ({
    label,
    value,
    onChange,
    placeholder,
    maxLength,
    minLength,
}) => {
    const displayValue = value === null || value === undefined ? '' : value;

    return (
        <div className="markdown-textarea-expand-popup">
            <HeaderContainer
                icon="mdi:text-box-outline"
                header={label}
                classN="markdown-textarea-expand-popup-header"
            >
                <MarkdownTextarea
                    value={displayValue}
                    onChange={onChange}
                    placeholder={placeholder}
                    rows={16}
                    maxLength={maxLength}
                    minLength={minLength}
                    className="markdown-textarea-expand-popup-editor"
                />
            </HeaderContainer>
        </div>
    );
};

export default MarkdownTextareaExpandPopup;
