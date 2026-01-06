import React from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import './FilterPanel.scss';

function FilterPanel({ filterOptions, filters, onFilterToggle }) {
    const handleKeyDown = (event, field, value) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onFilterToggle(field, value);
        }
    };

    return (
        <div className="filters" role="region" aria-label="Event filters">
            <div className="header">                       
                <Icon icon="cuida:filter-outline" aria-hidden="true" />
                <span>filters</span>
            </div>
            <div className="filter-content">
                {Object.keys(filterOptions).map((key, i) => {
                    const optionData = filterOptions[key];
                    const field = optionData.field;
                    const fieldId = `filter-${field}`;
                    return (
                        <fieldset className="filter-section" key={i}>
                            <legend className="filter-legend">{optionData.label}</legend>
                            <div 
                                className="filter-options" 
                                role="group" 
                                aria-labelledby={fieldId}
                            >
                                {optionData.options.map((option, j) => {
                                    const optionValue = optionData.optionValues[j];
                                    const isSelected = filters[field].includes(optionValue);
                                    const optionId = `${fieldId}-${j}`;
                                    return (
                                        <button
                                            key={j}
                                            id={optionId}
                                            className={`filter-option ${isSelected ? 'selected' : ''}`}
                                            onClick={() => onFilterToggle(field, optionValue)}
                                            onKeyDown={(e) => handleKeyDown(e, field, optionValue)}
                                            aria-pressed={isSelected}
                                            aria-label={`${option} filter ${isSelected ? 'selected' : 'not selected'}`}
                                            type="button"
                                        >
                                            {option}
                                        </button>
                                    );
                                })}
                            </div>
                        </fieldset>
                    );
                })}
            </div>
        </div>
    );
}

export default FilterPanel; 