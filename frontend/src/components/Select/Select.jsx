import React, { useEffect, useState, useRef } from 'react';
import './Select.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import useOutsideClick from '../../hooks/useClickOutside';

/**
 * Select component - supports both simple string options and optionItems with icons.
 * @param {string[]} options - Simple string options (backward compatible)
 * @param {{ value: string, label: string, icon?: string }[]} optionItems - Options with label and optional icon
 * @param {function} onChange - Called with selected value
 * @param {string} defaultValue - Initial value
 * @param {string} placeholder - Placeholder text
 */
const Select = ({ options = [], optionItems, onChange = () => {}, defaultValue, placeholder = 'Select an option' }) => {
    const items = optionItems || options.map(o => ({ value: o, label: o }));
    const [selectedValue, setSelectedValue] = useState(defaultValue);
    const [isOpen, setIsOpen] = useState(false);

    const ref = useRef(null);
    useOutsideClick(ref, () => {
        if (isOpen) {
            setIsOpen(false);
        }
    }, ['select-header']);

    const handleSelect = (value) => {
        setSelectedValue(value);
        onChange(value);
        setIsOpen(false);
    };

    useEffect(() => {
        if (defaultValue !== undefined && defaultValue !== null) {
            setSelectedValue(defaultValue);
        }
    }, [defaultValue]);

    const selectedItem = items.find(i => i.value === selectedValue);

    return (
        <div className="select-container">
            <div className="select-header" onClick={() => setIsOpen(!isOpen)}>
                <div className="select-header-text">
                    {selectedItem ? (
                        <span className="select-header-content">
                            {selectedItem.icon && <Icon icon={selectedItem.icon} className="select-option-icon" />}
                            {selectedItem.label}
                        </span>
                    ) : (
                        placeholder
                    )}
                </div>
                <Icon icon="ic:round-keyboard-arrow-down" />
            </div>
            {isOpen && (
                <div className="select-options" ref={ref}>
                    <div className="select-option placeholder">
                        {placeholder}
                    </div>
                    {items.map((item, index) => (
                        <div
                            key={index}
                            className={`select-option ${selectedValue === item.value ? 'selected' : ''}`}
                            onClick={() => handleSelect(item.value)}
                        >
                            {item.icon && <Icon icon={item.icon} className="select-option-icon" />}
                            {item.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Select;