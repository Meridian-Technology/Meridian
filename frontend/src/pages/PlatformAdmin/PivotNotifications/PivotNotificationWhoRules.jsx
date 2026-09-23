import React from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import Select from '../../../components/Select/Select';

function attributeByKey(catalog, key) {
  return (catalog?.attributes || []).find((row) => row.key === key) || null;
}

function operatorsFor(catalog, attribute) {
  if (!attribute) return [];
  return catalog?.operators?.[attribute.type] || [];
}

function defaultValue(attribute, operator) {
  if (!attribute) return '';
  if (attribute.type === 'boolean') return false;
  if (attribute.type === 'number') return 0;
  if (operator === 'one_of') return attribute.options?.[0]?.value ? [attribute.options[0].value] : [];
  return attribute.options?.[0]?.value || '';
}

function blankCondition(catalog) {
  const attribute = catalog.attributes[0];
  const operator = operatorsFor(catalog, attribute)[0]?.key || 'is';
  return {
    attribute: attribute.key,
    operator,
    value: defaultValue(attribute, operator),
  };
}

function blankGroup(catalog) {
  return {
    outcome: 'send',
    conditions: [blankCondition(catalog)],
  };
}

function PivotNotificationWhoRules({
  catalog,
  rules,
  onChange,
  disabled = false,
  labelPrefix = 'Who',
}) {
  const attributes = catalog?.attributes || [];
  const groups = Array.isArray(rules) ? rules : [];

  if (!catalog) {
    return <p className="pivot-notification-definition-editor__hint">Loading who rules…</p>;
  }

  if (!attributes.length) {
    return (
      <p className="pivot-notification-definition-editor__hint">
        This notification has no conditions.
      </p>
    );
  }

  const updateGroup = (index, group) => {
    const next = groups.slice();
    next[index] = group;
    onChange(next);
  };

  return (
    <div className="pivot-notification-definition-editor__who">
      <div className="pivot-notification-definition-editor__who-head">
        <h3 className="pivot-notification-definition-editor__section-title">Who gets it</h3>
        <div className="pivot-notification-definition-editor__who-actions">
          {Array.isArray(catalog.defaultRules) ? (
            <button
              type="button"
              className="pivot-notification-definition-editor__text-btn"
              disabled={disabled}
              onClick={() => {
                if (!window.confirm('Restore the default conditions?')) return;
                onChange(JSON.parse(JSON.stringify(catalog.defaultRules)));
              }}
            >
              Restore defaults
            </button>
          ) : null}
          <button
            type="button"
            className="pivot-notification-definition-editor__add"
            disabled={disabled}
            onClick={() => onChange([...groups, blankGroup(catalog)])}
          >
            <Icon icon="mdi:plus" />
            Add condition
          </button>
        </div>
      </div>
      {groups.length === 0 ? (
        <p className="pivot-notification-definition-editor__hint">
          No conditions. This notification will not send.
        </p>
      ) : null}
      {groups.map((group, groupIndex) => (
        <div key={`${labelPrefix}-group-${groupIndex}`}>
          {groupIndex > 0 ? (
            <p className="pivot-notification-definition-editor__or">or</p>
          ) : null}
          <div className="pivot-notification-definition-editor__group">
            <div className="pivot-notification-definition-editor__who-head">
              <h4>Condition {groupIndex + 1}</h4>
              <button
                type="button"
                className="pivot-notification-definition-editor__text-btn"
                aria-label={`${labelPrefix} remove condition ${groupIndex + 1}`}
                disabled={disabled}
                onClick={() => {
                  if (!window.confirm(`Remove condition ${groupIndex + 1}?`)) return;
                  onChange(groups.filter((_, index) => index !== groupIndex));
                }}
              >
                remove condition
              </button>
            </div>
            {(group.conditions || []).map((condition, conditionIndex) => {
              const attribute = attributeByKey(catalog, condition.attribute) || attributes[0];
              const operators = operatorsFor(catalog, attribute);
              const valueLabel = `${labelPrefix} value ${groupIndex + 1} ${conditionIndex + 1}`;
              return (
                <div
                  className={[
                    'pivot-notification-definition-editor__condition',
                    conditionIndex > 0 ? 'is-follow' : '',
                  ].filter(Boolean).join(' ')}
                  key={`${labelPrefix}-condition-${groupIndex}-${conditionIndex}`}
                >
                  {conditionIndex === 0 ? <Icon icon="foundation:arrow-right" /> : null}
                  <p className="pivot-notification-definition-editor__join">
                    {conditionIndex === 0 ? 'If' : 'and'}
                  </p>
                  <Select
                    className="pivot-notification-rule-select"
                    ariaLabel={`${labelPrefix} attribute ${groupIndex + 1} ${conditionIndex + 1}`}
                    optionItems={attributes.map((row) => ({ value: row.key, label: row.label }))}
                    defaultValue={attribute.key}
                    disabled={disabled}
                    onChange={(value) => {
                      const nextAttribute = attributeByKey(catalog, value);
                      const nextOperator = operatorsFor(catalog, nextAttribute)[0]?.key || 'is';
                      const conditions = group.conditions.slice();
                      conditions[conditionIndex] = {
                        attribute: nextAttribute.key,
                        operator: nextOperator,
                        value: defaultValue(nextAttribute, nextOperator),
                      };
                      updateGroup(groupIndex, { ...group, conditions });
                    }}
                  />
                  <Select
                    className="pivot-notification-rule-select"
                    ariaLabel={`${labelPrefix} operator ${groupIndex + 1} ${conditionIndex + 1}`}
                    optionItems={operators.map((row) => ({ value: row.key, label: row.label }))}
                    defaultValue={condition.operator}
                    disabled={disabled}
                    onChange={(value) => {
                      const conditions = group.conditions.slice();
                      conditions[conditionIndex] = {
                        ...condition,
                        operator: value,
                        value: defaultValue(attribute, value),
                      };
                      updateGroup(groupIndex, { ...group, conditions });
                    }}
                  />
                  {attribute.type === 'boolean' ? (
                    <Select
                      className="pivot-notification-rule-select"
                      ariaLabel={valueLabel}
                      optionItems={[
                        { value: 'true', label: 'yes' },
                        { value: 'false', label: 'no' },
                      ]}
                      defaultValue={condition.value === true ? 'true' : 'false'}
                      disabled={disabled}
                      onChange={(value) => {
                        const conditions = group.conditions.slice();
                        conditions[conditionIndex] = {
                          ...condition,
                          value: value === 'true',
                        };
                        updateGroup(groupIndex, { ...group, conditions });
                      }}
                    />
                  ) : null}
                  {attribute.type === 'number' ? (
                    <input
                      type="number"
                      className="pivot-notification-definition-editor__value"
                      aria-label={valueLabel}
                      value={condition.value}
                      disabled={disabled}
                      onChange={(event) => {
                        const conditions = group.conditions.slice();
                        conditions[conditionIndex] = {
                          ...condition,
                          value: event.target.value === '' ? '' : Number(event.target.value),
                        };
                        updateGroup(groupIndex, { ...group, conditions });
                      }}
                    />
                  ) : null}
                  {attribute.type === 'enum' && condition.operator !== 'one_of' ? (
                    <Select
                      className="pivot-notification-rule-select"
                      ariaLabel={valueLabel}
                      optionItems={(attribute.options || []).map((option) => ({
                        value: option.value,
                        label: option.label,
                      }))}
                      defaultValue={condition.value}
                      disabled={disabled}
                      onChange={(value) => {
                        const conditions = group.conditions.slice();
                        conditions[conditionIndex] = { ...condition, value };
                        updateGroup(groupIndex, { ...group, conditions });
                      }}
                    />
                  ) : null}
                  {attribute.type === 'enum' && condition.operator === 'one_of' ? (
                    <select
                      multiple
                      className="pivot-notification-definition-editor__value"
                      aria-label={valueLabel}
                      value={Array.isArray(condition.value) ? condition.value : []}
                      disabled={disabled}
                      onChange={(event) => {
                        const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
                        const conditions = group.conditions.slice();
                        conditions[conditionIndex] = { ...condition, value: selected };
                        updateGroup(groupIndex, { ...group, conditions });
                      }}
                    >
                      {(attribute.options || []).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : null}
                  <button
                    type="button"
                    className="pivot-notification-definition-editor__icon-btn"
                    aria-label={`${labelPrefix} remove line ${groupIndex + 1} ${conditionIndex + 1}`}
                    disabled={disabled || group.conditions.length === 1}
                    onClick={() => {
                      if (!window.confirm('Remove this line?')) return;
                      updateGroup(groupIndex, {
                        ...group,
                        conditions: group.conditions.filter((_, index) => index !== conditionIndex),
                      });
                    }}
                  >
                    <Icon icon="mdi:delete" />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="pivot-notification-definition-editor__add"
              disabled={disabled}
              onClick={() => updateGroup(groupIndex, {
                ...group,
                conditions: [...group.conditions, blankCondition(catalog)],
              })}
            >
              <Icon icon="mdi:plus" />
              Add line
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default PivotNotificationWhoRules;
