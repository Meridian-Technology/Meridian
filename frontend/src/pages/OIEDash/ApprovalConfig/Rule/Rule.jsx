import React, { useState, useEffect } from 'react';
import './Rule.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import Condition from './Condition/Condition';
import { useFetch } from '../../../../hooks/useFetch';
import Select from '../../../../components/Select/Select';

const conditonTypes = [
    {
        label: 'location',
        value: 'location',
        type: 'string'
    },
    {
        label: 'expected attendance',
        value: 'expectedAttendance',
        type: 'number'
    },
    {
        label: 'event type',
        value: 'eventType',
        type: 'string'
    },

]

const operators = {
    string: ["equals", "notEquals", "contains", "notContains"],
    number: ["equals", "notEquals", "greaterThan", "lessThan", "greaterThanOrEqual", "lessThanOrEqual"],
    boolean: ["equals", "notEquals"],
    date: ["equals", "notEquals", "before", "after", "between"]
  };

const ConditionGroup = ({group, onChange, fieldDefinitions, allowedOperators, index, onDelete}) => {
    const [conditions, setConditions] = useState(group.conditions);
    const [conditionLogicalOperators, setConditionLogicalOperators] = useState(group.conditionLogicalOperators || []);

    useEffect(() => {
        setConditions(group.conditions);
        setConditionLogicalOperators(group.conditionLogicalOperators || []);
    }, [group]);

    const handleConditionChange = (index, updatedCondition) => {
        const newConditions = [...conditions];
        newConditions[index] = updatedCondition;
        setConditions(newConditions);
        
        // Notify parent of changes
        onChange({
            conditionGroups: [{
                conditions: newConditions,
                conditionLogicalOperators
            }]
        });
    };

    const handleAddRule = () => {
        const newCondition = {
            field: fieldDefinitions[0].name,
            operator: allowedOperators.find(op => op.type === fieldDefinitions[0].type)?.operators[0] || 'equals',
            value: ''
        };
        
        const newConditions = [...conditions, newCondition];
        setConditions(newConditions);
        const newConditionLogicalOperators = conditions.length > 0 ? [...conditionLogicalOperators, 'AND'] : conditionLogicalOperators;
        setConditionLogicalOperators(newConditionLogicalOperators);
        
        // Notify parent of changes
        onChange({
            conditionGroups: [{
                conditions: newConditions,
                conditionLogicalOperators: newConditionLogicalOperators
            }]
        });
    };

    const handleDeleteCondition = (indexToDelete) => {
        // Create new arrays to maintain immutability
        const newConditions = [...conditions];
        const newConditionLogicalOperators = [...conditionLogicalOperators];
        
        // Remove the condition at the specified index
        newConditions.splice(indexToDelete, 1);
        
        // Remove the logical operator before this condition (if it's not the first condition)
        if (indexToDelete > 0) {
            newConditionLogicalOperators.splice(indexToDelete - 1, 1);
        }
        
        setConditions(newConditions);
        setConditionLogicalOperators(newConditionLogicalOperators);
        
        // Notify parent of changes
        onChange({
            conditionGroups: [{
                conditions: newConditions,
                conditionLogicalOperators: newConditionLogicalOperators
            }]
        });
    };

    return(
        <div className="rule">
            <div className="rule-header">
                <h4>Rule {index + 1}</h4>
                <button className="delete-rule" onClick={() => onDelete(index)}>
                    remove rule
                </button>
            </div>
            <div className="condition-group">
                {
                    conditions.map((condition, i)=>{
                        return(
                            <div key={`${condition}${i}`} className="condition-container">
                                { i === 0 && <Icon icon="foundation:arrow-right" />}
                                <div className="condition-logical-operator">
                                    <p>
                                    {
                                        i > 0 ? 'and' : 'If'
                                    }
                                    </p>
                                </div>
                                <Condition 
                                    condition={condition} 
                                    onChange={(updatedCondition) => handleConditionChange(i, updatedCondition)} 
                                    fieldDefinitions={fieldDefinitions} 
                                    allowedOperators={allowedOperators} 
                                />
                                {conditions.length > 1 && (
                                    <button className="delete-condition" onClick={() => handleDeleteCondition(i)}>
                                        <Icon icon="mdi:delete" />
                                    </button>
                                )}
                            </div>
                        )
                    })
                }
                <button className="add-rule-button" onClick={handleAddRule}>
                    <Icon icon="mdi:plus" />
                    Add Condition
                </button>
            </div>
            <div className="action">
                <Icon icon="mynaui:lightning-solid" />
                <p>
                    then
                </p>
                <Select
                    options={['require approval', 'insert form']}
                    defaultValue={index !== 0 ? 'require approval' : 'insert form'}
                />
            </div>
        </div>
    )
}

export default ConditionGroup;