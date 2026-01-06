import React, { useState, useEffect } from 'react';
import './Condition.scss';
import Select from '../../../../../components/Select/Select';
import AutocompleteInput from '../../../../../components/AutocompleteInput/AutocompleteInput';
import { useFetch } from '../../../../../hooks/useFetch';

const operatorLabels = {
    'equals': 'is',
    'notEquals': 'is not',
    'contains': 'contains',
    'notContains': 'does not contain',
    'in': 'is one of',
    'notIn': 'is not one of',
    'greaterThan': 'is greater than',
    'lessThan': 'is less than',
    'greaterThanOrEqual': 'is greater than or equal to',
    'lessThanOrEqual': 'is less than or equal to',
    'before': 'is before',
    'after': 'is after',
    'between': 'is between'
}

const Condition = ({condition, onChange, fieldDefinitions, allowedOperators}) => {
    const [field, setField] = useState(condition.field);
    const [operator, setOperator] = useState(condition.operator);
    const [value, setValue] = useState(condition.value);
    const [inputType, setInputType] = useState('text');
    const [locations, setLocations] = useState([]);

    const rooms = useFetch('/getrooms');

    useEffect(() => {
        if (rooms.data) {
            setLocations(Object.keys(rooms.data.data).sort());
        }
    }, [rooms.data]);

    useEffect(() => {
        const fieldDef = fieldDefinitions.find(f => f.name === field);
        if (fieldDef) {
            setInputType(fieldDef.inputType);
        }
    }, [field, fieldDefinitions]);

    const handleFieldChange = (newField) => {
        const fieldDef = fieldDefinitions.find(f => f.label === newField);
        setField(fieldDef.name);
        setInputType(fieldDef.inputType);
        
        // Reset operator and value when field changes
        const defaultOperator = allowedOperators
            .find(op => op.type === fieldDef.type)
            ?.operators[0] || 'equals';
        setOperator(defaultOperator);
        setValue('');

        notifyParent(fieldDef.name, defaultOperator, '');
    };

    const handleOperatorChange = (newOperator) => {
        const operatorValue = Object.entries(operatorLabels).find(([_, label]) => label === newOperator)?.[0];
        setOperator(operatorValue);
        notifyParent(field, operatorValue, value);
    };

    const handleValueChange = (newValue) => {
        setValue(newValue);
        notifyParent(field, operator, newValue);
    };

    const notifyParent = (field, operator, value) => {
        onChange({
            field,
            operator,
            value
        });
    };

    const getFieldOptions = () => {
        return fieldDefinitions.map(field => field.label);
    };

    const getOperatorOptions = () => {
        const fieldDef = fieldDefinitions.find(f => f.name === field);
        if (!fieldDef) return [];

        const operators = allowedOperators
            .find(op => op.type === fieldDef.type)
            ?.operators || [];

        return operators.map(op => operatorLabels[op]);
    };

    return(
        <div className="condition">
            <Select 
                options={getFieldOptions()} 
                onChange={handleFieldChange} 
                defaultValue={fieldDefinitions.find(f => f.name === field)?.label} 
            />
            <Select 
                options={getOperatorOptions()} 
                onChange={handleOperatorChange} 
                defaultValue={operatorLabels[operator]} 
            />
            {inputType === "text" && 
                (
                    field === "location" ? (
                        <AutocompleteInput
                            options={locations}
                            value={value}
                            onChange={handleValueChange}
                        />
                    ) : (
                        <input 
                            type="text" 
                            value={value} 
                            onChange={(e) => handleValueChange(e.target.value)} 
                        />
                    )
                )
            }

            {inputType === "number" && (
                <input 
                    type="number" 
                    value={value} 
                    onChange={(e) => handleValueChange(Number(e.target.value))} 
                />
            )}
            {inputType === "boolean" && (
                <input 
                    type="checkbox" 
                    checked={value} 
                    onChange={(e) => handleValueChange(e.target.checked)} 
                />
            )}
        </div>
    )
}

export default Condition;