import React, { useState, useRef, useEffect } from 'react';
import './AutocompleteInput.scss';

const AutocompleteInput = ({
    options,
    maxSuggestions = 5,
    placeholder = '',
    value,
    onChange,
    className = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [filteredOptions, setFilteredOptions] = useState([]);
    const containerRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleInputChange = (e) => {
        const inputValue = e.target.value;
        onChange(inputValue);

        if (inputValue.trim() === '') {
            setFilteredOptions([]);
            setIsOpen(false);
            return;
        }

        const filtered = options
            .filter(option => option.toLowerCase().startsWith(inputValue.toLowerCase()))
            .slice(0, maxSuggestions);

        setFilteredOptions(filtered);
        setIsOpen(filtered.length > 0);
    };

    const handleOptionClick = (option) => {
        onChange(option);
        setIsOpen(false);
    };

    return (
        <div className={`autocomplete-container ${className}`} ref={containerRef}>
            <div className="autocomplete-header">
                <input
                    type="text"
                    value={value}
                    onChange={handleInputChange}
                    placeholder={placeholder}
                    className="autocomplete-input"
                />
            </div>
            {isOpen && (
                <div className="autocomplete-options">
                    {filteredOptions.map((option, index) => (
                        <div
                            key={index}
                            className="autocomplete-option"
                            onClick={() => handleOptionClick(option)}
                        >
                            {option}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AutocompleteInput; 