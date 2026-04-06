import React from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import './OnboardingBuilder.scss';

const CUSTOM_STEP_TYPES = [
  { value: 'short_text', label: 'Short text' },
  { value: 'long_text', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'single_select', label: 'Single select' },
  { value: 'multi_select', label: 'Multi select' },
  { value: 'picture_upload', label: 'Picture upload' },
];

function slugify(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return normalized || '';
}

function makeId() {
  return `step-${Math.random().toString(36).slice(2, 10)}`;
}

function buildNewStep(type = 'short_text') {
  const isSelect = type === 'single_select' || type === 'multi_select';
  return {
    id: makeId(),
    key: '',
    type,
    title: '',
    description: '',
    placeholder: '',
    required: false,
    options: isSelect ? [] : undefined,
  };
}

function parseOptionsFromText(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label) => ({
      label,
      value: slugify(label),
    }))
    .filter((entry) => entry.value);
}

function optionsToTextareaValue(options = []) {
  return options.map((option) => option.label || option.value).join('\n');
}

function sanitizeStepBeforeSave(step) {
  const normalized = {
    id: step.id || makeId(),
    key: step.key || '',
    type: step.type || 'short_text',
    title: step.title || '',
    description: step.description || '',
    placeholder: step.placeholder || '',
    required: Boolean(step.required),
  };
  if (normalized.type === 'single_select' || normalized.type === 'multi_select') {
    normalized.options = Array.isArray(step.options) ? step.options : [];
  }
  return normalized;
}

function StepCard({
  step,
  index,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  allowTemplates,
}) {
  const isSelect = step.type === 'single_select' || step.type === 'multi_select';
  const isTemplate = step.type === 'template_follow_orgs' || step.type === 'template_add_friends';

  return (
    <div className="onboarding-builder-step-card">
      <div className="onboarding-builder-step-header">
        <h4>Step {index + 1}</h4>
        <div className="onboarding-builder-step-actions">
          <button type="button" onClick={onMoveUp} aria-label="Move step up">
            <Icon icon="mdi:arrow-up" />
          </button>
          <button type="button" onClick={onMoveDown} aria-label="Move step down">
            <Icon icon="mdi:arrow-down" />
          </button>
          <button type="button" onClick={onDelete} aria-label="Delete step">
            <Icon icon="mdi:delete-outline" />
          </button>
        </div>
      </div>

      <div className="onboarding-builder-grid">
        <label>
          Title
          <input
            type="text"
            value={step.title || ''}
            placeholder="What should we ask?"
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </label>
        <label>
          Key
          <input
            type="text"
            value={step.key || ''}
            placeholder="interest_area"
            onChange={(event) => onChange({ key: slugify(event.target.value) })}
          />
        </label>
        <label>
          Type
          <select
            value={step.type || 'short_text'}
            onChange={(event) => {
              const nextType = event.target.value;
              const isNextSelect = nextType === 'single_select' || nextType === 'multi_select';
              onChange({
                ...step,
                type: nextType,
                options: isNextSelect ? (step.options || []) : undefined,
              });
            }}
            disabled={!allowTemplates && isTemplate}
          >
            {CUSTOM_STEP_TYPES.map((fieldType) => (
              <option key={fieldType.value} value={fieldType.value}>
                {fieldType.label}
              </option>
            ))}
            {allowTemplates && (
              <>
                <option value="template_follow_orgs">Template: Follow organizations</option>
                <option value="template_add_friends">Template: Add friends</option>
              </>
            )}
          </select>
        </label>
        <label>
          Placeholder
          <input
            type="text"
            value={step.placeholder || ''}
            placeholder="Optional helper text"
            onChange={(event) => onChange({ placeholder: event.target.value })}
            disabled={isTemplate || step.type === 'picture_upload'}
          />
        </label>
      </div>

      <label className="onboarding-builder-description">
        Description
        <textarea
          value={step.description || ''}
          placeholder="Why are we asking this?"
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </label>

      {isSelect && (
        <label className="onboarding-builder-description">
          Options (one per line)
          <textarea
            value={optionsToTextareaValue(step.options || [])}
            placeholder={'Freshman\nSophomore\nJunior\nSenior'}
            onChange={(event) => {
              onChange({
                options: parseOptionsFromText(event.target.value),
              });
            }}
          />
        </label>
      )}

      <label className="onboarding-builder-required">
        <input
          type="checkbox"
          checked={Boolean(step.required)}
          onChange={(event) => onChange({ required: event.target.checked })}
        />
        Required
      </label>
    </div>
  );
}

function StepsEditor({ value = [], onChange, allowTemplates = false }) {
  const steps = Array.isArray(value) ? value : [];

  const updateStep = (index, patch) => {
    const next = [...steps];
    next[index] = sanitizeStepBeforeSave({
      ...next[index],
      ...patch,
    });
    onChange(next);
  };

  const removeStep = (index) => {
    const next = [...steps];
    next.splice(index, 1);
    onChange(next);
  };

  const moveStep = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const addStep = (type = 'short_text') => {
    onChange([...steps, buildNewStep(type)]);
  };

  return (
    <div className="onboarding-builder-steps">
      {steps.map((step, index) => (
        <StepCard
          key={step.id || `${index}-${step.key || 'step'}`}
          step={sanitizeStepBeforeSave(step)}
          index={index}
          onChange={(patch) => updateStep(index, patch)}
          onDelete={() => removeStep(index)}
          onMoveUp={() => moveStep(index, -1)}
          onMoveDown={() => moveStep(index, 1)}
          allowTemplates={allowTemplates}
        />
      ))}
      <button type="button" className="onboarding-builder-add-step" onClick={() => addStep()}>
        <Icon icon="mdi:plus" />
        Add step
      </button>
    </div>
  );
}

function OnboardingBuilder({
  value = [],
  onChange,
  context = 'platform',
  templateLibrary = [],
}) {
  const allowTemplates = context === 'tenant';

  const appendTemplate = (template) => {
    if (!allowTemplates || !template?.step) return;
    const next = [
      ...(Array.isArray(value) ? value : []),
      {
        ...sanitizeStepBeforeSave(template.step),
        id: `${template.step.id || makeId()}-${Date.now().toString(36)}`,
      },
    ];
    onChange(next);
  };

  return (
    <div className="onboarding-builder">
      <StepsEditor value={value} onChange={onChange} allowTemplates={allowTemplates} />
      {allowTemplates && templateLibrary.length > 0 && (
        <div className="onboarding-template-grid">
          {templateLibrary.map((template) => (
            <div className="onboarding-template-card" key={template.id}>
              <h4>{template.label}</h4>
              <p>{template.description}</p>
              <button type="button" onClick={() => appendTemplate(template)}>
                <Icon icon="mdi:plus" />
                Add template
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default OnboardingBuilder;
