import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import { useNotification } from '../../../../../NotificationContext';
import postRequest from '../../../../../utils/postRequest';
import './EventTypeConfig.scss';

const DEFAULT_EVENT_TYPE_OPTIONS = [
    'Meeting',
    'Workshop',
    'Social',
    'Community',
    'Training',
    'Networking',
    'Fundraiser',
    'Performance',
    'Competition',
    'Other',
];

const DEFAULT_EVENT_TYPE_VALUE = 'Meeting';
const DEFAULT_EVENT_TAG_OPTIONS = [
    'Computer Science',
    'Gaming',
    'Career',
    'Entrepreneurship',
    'Arts',
    'Music',
    'Sports',
    'Health & Wellness',
    'Community Service',
    'Culture',
    'Academic',
];

function normalizeDisplayName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function dedupeDisplayNames(items) {
    const seen = new Set();
    const out = [];
    (items || []).forEach((item) => {
        const normalized = normalizeDisplayName(item);
        if (!normalized) return;
        const key = normalized.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(normalized);
    });
    return out;
}

function upsertTypeField(formConfig) {
    const fields = Array.isArray(formConfig?.fields) ? formConfig.fields : [];
    const existing = fields.find((f) => f.name === 'type');
    if (existing) return existing;
    return {
        name: 'type',
        type: 'select',
        label: 'Event Type',
        description: 'Category of the event',
        inputType: 'select',
        isActive: true,
        isLocked: false,
        isRequired: true,
        order: 2,
        step: 'basic-info',
        validation: {
            required: true,
            options: DEFAULT_EVENT_TYPE_OPTIONS,
            defaultValue: DEFAULT_EVENT_TYPE_VALUE,
        },
        helpText: 'Choose the category that best describes your event',
    };
}

function upsertTagsField(formConfig) {
    const fields = Array.isArray(formConfig?.fields) ? formConfig.fields : [];
    const existing = fields.find((f) => f.name === 'event_tags');
    if (existing) return existing;
    return {
        name: 'event_tags',
        type: 'select',
        label: 'Event Tags',
        description: 'Optional tags to help people discover your event',
        inputType: 'multi-select',
        isActive: true,
        isLocked: false,
        isRequired: false,
        order: 3,
        step: 'basic-info',
        validation: {
            required: false,
            options: DEFAULT_EVENT_TAG_OPTIONS,
            multiple: true,
            defaultValue: [],
        },
        helpText: 'Select all tags that fit this event.',
    };
}

function EventTypeConfig({ config, onChange }) {
    const { addNotification } = useNotification();
    const [typeOptions, setTypeOptions] = useState(DEFAULT_EVENT_TYPE_OPTIONS);
    const [defaultType, setDefaultType] = useState(DEFAULT_EVENT_TYPE_VALUE);
    const [tagOptions, setTagOptions] = useState(DEFAULT_EVENT_TAG_OPTIONS);
    const [newTypeInput, setNewTypeInput] = useState('');
    const [newTagInput, setNewTagInput] = useState('');

    const typeField = useMemo(() => upsertTypeField(config?.formConfig), [config]);
    const tagsField = useMemo(() => upsertTagsField(config?.formConfig), [config]);

    useEffect(() => {
        const options = dedupeDisplayNames(typeField?.validation?.options)?.length
            ? typeField.validation.options
            : DEFAULT_EVENT_TYPE_OPTIONS;
        const fieldDefault = typeField?.validation?.defaultValue || options[0] || DEFAULT_EVENT_TYPE_VALUE;
        setTypeOptions(dedupeDisplayNames(options));
        setDefaultType(fieldDefault);
    }, [typeField]);

    useEffect(() => {
        const options = dedupeDisplayNames(tagsField?.validation?.options)?.length
            ? tagsField.validation.options
            : DEFAULT_EVENT_TAG_OPTIONS;
        setTagOptions(dedupeDisplayNames(options));
    }, [tagsField]);

    const addTypeOption = () => {
        const value = normalizeDisplayName(newTypeInput);
        if (!value) return;
        const next = dedupeDisplayNames([...typeOptions, value]);
        setTypeOptions(next);
        if (!next.includes(defaultType)) setDefaultType(next[0] || DEFAULT_EVENT_TYPE_VALUE);
        setNewTypeInput('');
    };

    const removeTypeOption = (value) => {
        const next = typeOptions.filter((item) => item !== value);
        setTypeOptions(next);
        if (!next.includes(defaultType)) setDefaultType(next[0] || DEFAULT_EVENT_TYPE_VALUE);
    };

    const addTagOption = () => {
        const value = normalizeDisplayName(newTagInput);
        if (!value) return;
        setTagOptions(dedupeDisplayNames([...tagOptions, value]));
        setNewTagInput('');
    };

    const removeTagOption = (value) => {
        setTagOptions(tagOptions.filter((item) => item !== value));
    };

    const save = async () => {
        const nextOptions = dedupeDisplayNames(typeOptions).length > 0 ? dedupeDisplayNames(typeOptions) : DEFAULT_EVENT_TYPE_OPTIONS;
        const nextDefault = nextOptions.includes(defaultType) ? defaultType : (nextOptions[0] || DEFAULT_EVENT_TYPE_VALUE);

        const formConfig = config?.formConfig || { steps: [], fields: [] };
        const fields = Array.isArray(formConfig.fields) ? formConfig.fields : [];
        const typeIndex = fields.findIndex((f) => f.name === 'type');
        const tagsIndex = fields.findIndex((f) => f.name === 'event_tags');
        const baseField = upsertTypeField(formConfig);
        const baseTagsField = upsertTagsField(formConfig);
        const nextTypeField = {
            ...baseField,
            validation: {
                ...(baseField.validation || {}),
                required: true,
                options: nextOptions,
                defaultValue: nextDefault,
            },
        };
        const nextTagOptions = dedupeDisplayNames(tagOptions).length > 0 ? dedupeDisplayNames(tagOptions) : DEFAULT_EVENT_TAG_OPTIONS;
        const nextTagsField = {
            ...baseTagsField,
            validation: {
                ...(baseTagsField.validation || {}),
                required: false,
                multiple: true,
                options: nextTagOptions,
                defaultValue: [],
            },
        };

        const nextFields = [...fields];
        if (typeIndex >= 0) {
            nextFields[typeIndex] = nextTypeField;
        } else {
            nextFields.push(nextTypeField);
        }
        if (tagsIndex >= 0) {
            nextFields[tagsIndex] = nextTagsField;
        } else {
            nextFields.push(nextTagsField);
        }

        onChange({
            formConfig: {
                ...formConfig,
                fields: nextFields,
            },
        });
        try {
            const response = await postRequest('/api/event-system-config/form-config', { fields: nextFields }, { method: 'PUT' });
            if (!response?.success) {
                throw new Error(response?.message || 'Failed to persist event tag settings');
            }
            addNotification({
                title: 'Event classification settings updated',
                message: 'Event type and tag options are now live for forms and onboarding.',
                type: 'success',
            });
        } catch (error) {
            addNotification({
                title: 'Saved locally, but not persisted',
                message: 'The new options are staged in this page, but backend persistence failed. Please try again.',
                type: 'error',
            });
        }
    };

    const applyRecommendedDefaults = () => {
        setTypeOptions(DEFAULT_EVENT_TYPE_OPTIONS);
        setDefaultType(DEFAULT_EVENT_TYPE_VALUE);
        setTagOptions(DEFAULT_EVENT_TAG_OPTIONS);
    };

    return (
        <section className="event-type-config">
            <div className="event-type-config__header">
                <h2>
                    <Icon icon="mdi:shape-outline" />
                    Event type settings
                </h2>
                <p>
                    Configure the primary event-type list in one place instead of editing it through form-builder
                    field internals.
                </p>
            </div>

            <div className="event-type-config__card">
                <label htmlFor="event-type-input">Event type options</label>
                <div className="event-type-config__adder">
                    <input
                        id="event-type-input"
                        type="text"
                        value={newTypeInput}
                        onChange={(e) => setNewTypeInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addTypeOption();
                            }
                        }}
                        placeholder="Add event type (e.g., Workshop)"
                    />
                    <button type="button" className="event-type-config__btn event-type-config__btn--secondary" onClick={addTypeOption}>
                        Add
                    </button>
                </div>
                <div className="event-type-config__chip-list" aria-label="Event type options">
                    {typeOptions.map((opt) => (
                        <div key={opt} className="event-type-config__chip">
                            <span>{opt}</span>
                            <button type="button" onClick={() => removeTypeOption(opt)} aria-label={`Remove ${opt}`}>
                                <Icon icon="mdi:close" />
                            </button>
                        </div>
                    ))}
                </div>
                <p className="event-type-config__hint">
                    Use human-friendly names only. These will appear directly in the event form.
                </p>

                <label htmlFor="event-type-default">Default event type</label>
                <select
                    id="event-type-default"
                    value={typeOptions.includes(defaultType) ? defaultType : (typeOptions[0] || '')}
                    onChange={(e) => setDefaultType(e.target.value)}
                    disabled={typeOptions.length === 0}
                >
                    {(typeOptions.length > 0 ? typeOptions : DEFAULT_EVENT_TYPE_OPTIONS).map((opt) => (
                        <option key={opt} value={opt}>
                            {opt}
                        </option>
                    ))}
                </select>
            </div>

            <div className="event-type-config__card">
                <label htmlFor="event-tag-input">Event tags</label>
                <div className="event-type-config__adder">
                    <input
                        id="event-tag-input"
                        type="text"
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addTagOption();
                            }
                        }}
                        placeholder="Add tag (e.g., Computer Science)"
                    />
                    <button type="button" className="event-type-config__btn event-type-config__btn--secondary" onClick={addTagOption}>
                        Add
                    </button>
                </div>
                <div className="event-type-config__chip-list" aria-label="Event tag options">
                    {tagOptions.map((opt) => (
                        <div key={opt} className="event-type-config__chip">
                            <span>{opt}</span>
                            <button type="button" onClick={() => removeTagOption(opt)} aria-label={`Remove ${opt}`}>
                                <Icon icon="mdi:close" />
                            </button>
                        </div>
                    ))}
                </div>
                <p className="event-type-config__hint">
                    Event creators can select multiple tags during event creation.
                </p>

                <div className="event-type-config__actions">
                    <button type="button" className="event-type-config__btn event-type-config__btn--secondary" onClick={applyRecommendedDefaults}>
                        Use recommended defaults
                    </button>
                    <button type="button" className="event-type-config__btn event-type-config__btn--primary" onClick={save}>
                        Apply event type + tag settings
                    </button>
                </div>
            </div>
        </section>
    );
}

export default EventTypeConfig;
