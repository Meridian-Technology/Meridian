import React, { useEffect, useState, useRef } from 'react';
import './Select.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import useOutsideClick from '../../hooks/useClickOutside';

const Select = ({ options, onChange = console.log, defaultValue, placeholder = 'Select an option' }) => {
    const [selectedOption, setSelectedOption] = useState(defaultValue);
    const [isOpen, setIsOpen] = useState(false);

    const ref = useRef(null);
    useOutsideClick(ref, () => {
        if (isOpen) {
            setIsOpen(false);
        }
    },["select-header"]);

    const handleSelect = (option) => {
        setSelectedOption(option);
        onChange(option);
        setIsOpen(false);
    };

    useEffect(() => {
        if (defaultValue) {
            setSelectedOption(defaultValue);
        }
    }, [defaultValue]);

    return (
        <div className="select-container">
            <div className="select-header" onClick={() => setIsOpen(!isOpen)}>
                <div className="select-header-text">
                    {selectedOption || placeholder}
                </div>
                <Icon icon="ic:round-keyboard-arrow-down"/>
            </div>
            {isOpen && (
                <div className="select-options" ref={ref}>
                    <div className="select-option placeholder">
                        {placeholder}
                    </div>
                    {options.map((option, index) => (
                        <div
                            key={index}
                            className={`select-option ${selectedOption === option ? 'selected' : ''}`}
                            onClick={() => handleSelect(option)}
                        >
                            {option}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default Select;