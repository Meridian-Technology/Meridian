import React, { useMemo, useState, useEffect } from 'react';
import { useFetch } from '../../../../hooks/useFetch';
import { useGradient } from '../../../../hooks/useGradient';
import apiRequest from '../../../../utils/postRequest';
import { useNotification } from '../../../../NotificationContext';
import { Icon } from '@iconify-icon/react';
import SettingsList from '../../../../components/SettingsList/SettingsList';
import './FinanceTemplatesConfig.scss';

const LINE_ITEM_MODE_OPTIONS = [
    { value: 'template_only', label: 'Preset template only' },
    { value: 'template_plus_custom', label: 'Template + custom line items' }
];

function normalizeKey(value, fallback = 'item') {
    const base = String(value || fallback)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return base || fallback;
}

export default function FinanceTemplatesConfig() {
    const { data: res, loading, error, refetch } = useFetch('/org-management/finance/config');
    const { data: managementRes } = useFetch('/org-management/config');
    const { AtlasMain } = useGradient();
    const { addNotification } = useNotification();
    const [budgetTemplates, setBudgetTemplates] = useState([]);
    const [workflowPresets, setWorkflowPresets] = useState([]);
    const [selectedTemplateKey, setSelectedTemplateKey] = useState('');
    const [selectedPresetKey, setSelectedPresetKey] = useState('');
    const [lineItemPolicy, setLineItemPolicy] = useState({
        lineItemMode: 'template_only',
        maxCustomLineItems: 20
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (res?.data) {
            const templates = res.data.budgetTemplates || [];
            const presets = res.data.workflowPresets || [];
            setBudgetTemplates(templates);
            setWorkflowPresets(presets);
            setSelectedTemplateKey((prev) => prev || templates[0]?.templateKey || '');
            setSelectedPresetKey((prev) => prev || presets[0]?.presetKey || '');
        }
    }, [res]);

    useEffect(() => {
        const policy = managementRes?.data?.atlasPolicy?.budgets || {};
        setLineItemPolicy({
            lineItemMode: policy.lineItemMode === 'template_plus_custom' ? 'template_plus_custom' : 'template_only',
            maxCustomLineItems: Number.isFinite(Number(policy.maxCustomLineItems))
                ? Math.max(0, Math.min(100, Number(policy.maxCustomLineItems)))
                : 20
        });
    }, [managementRes]);

    const selectedTemplate = useMemo(
        () => budgetTemplates.find((t) => t.templateKey === selectedTemplateKey) || budgetTemplates[0] || null,
        [budgetTemplates, selectedTemplateKey]
    );

    const selectedPreset = useMemo(
        () => workflowPresets.find((p) => p.presetKey === selectedPresetKey) || workflowPresets[0] || null,
        [workflowPresets, selectedPresetKey]
    );

    const updateTemplate = (templateKey, updater) => {
        setBudgetTemplates((prev) => prev.map((t) => (t.templateKey === templateKey ? updater(t) : t)));
    };

    const updatePreset = (presetKey, updater) => {
        setWorkflowPresets((prev) => prev.map((p) => (p.presetKey === presetKey ? updater(p) : p)));
    };

    const addTemplate = () => {
        const keyBase = 'new_template';
        let idx = 1;
        let key = keyBase;
        const existing = new Set(budgetTemplates.map((t) => t.templateKey));
        while (existing.has(key)) {
            key = `${keyBase}_${idx}`;
            idx += 1;
        }
        const firstPresetKey = workflowPresets[0]?.presetKey || 'two_stage';
        const next = {
            templateKey: key,
            displayName: 'New budget template',
            orgTypeKeys: ['default'],
            fiscalLabel: 'Fiscal year',
            workflowPresetKey: firstPresetKey,
            lineItemDefinitions: []
        };
        setBudgetTemplates((prev) => [...prev, next]);
        setSelectedTemplateKey(key);
    };

    const removeTemplate = (templateKey) => {
        const next = budgetTemplates.filter((t) => t.templateKey !== templateKey);
        setBudgetTemplates(next);
        if (selectedTemplateKey === templateKey) {
            setSelectedTemplateKey(next[0]?.templateKey || '');
        }
    };

    const addLineItem = (templateKey) => {
        updateTemplate(templateKey, (template) => {
            const defs = template.lineItemDefinitions || [];
            const existing = new Set(defs.map((d) => d.key));
            let key = 'new_line_item';
            let i = 1;
            while (existing.has(key)) {
                key = `new_line_item_${i}`;
                i += 1;
            }
            return {
                ...template,
                lineItemDefinitions: [
                    ...defs,
                    { key, label: 'New line item', required: false, kind: 'currency', helpText: '' }
                ]
            };
        });
    };

    const addPreset = () => {
        const keyBase = 'new_preset';
        let idx = 1;
        let key = keyBase;
        const existing = new Set(workflowPresets.map((p) => p.presetKey));
        while (existing.has(key)) {
            key = `${keyBase}_${idx}`;
            idx += 1;
        }
        const next = { presetKey: key, stages: [] };
        setWorkflowPresets((prev) => [...prev, next]);
        setSelectedPresetKey(key);
    };

    const removePreset = (presetKey) => {
        const next = workflowPresets.filter((p) => p.presetKey !== presetKey);
        setWorkflowPresets(next);
        setSelectedPresetKey((curr) => (curr === presetKey ? next[0]?.presetKey || '' : curr));
        setBudgetTemplates((prev) =>
            prev.map((template) => ({
                ...template,
                workflowPresetKey:
                    template.workflowPresetKey === presetKey ? next[0]?.presetKey || '' : template.workflowPresetKey
            }))
        );
    };

    const addPresetStage = (presetKey) => {
        updatePreset(presetKey, (preset) => {
            const stages = preset.stages || [];
            const key = normalizeKey(`stage_${stages.length + 1}`, 'stage');
            return {
                ...preset,
                stages: [
                    ...stages,
                    {
                        key,
                        label: 'New stage',
                        actorType: 'org_permission',
                        permission: 'manage_finances'
                    }
                ]
            };
        });
    };

    const handleSave = async () => {
        if (!Array.isArray(budgetTemplates) || !Array.isArray(workflowPresets)) {
            addNotification({ title: 'Invalid shape', message: 'Templates and presets must be arrays.', type: 'error' });
            return;
        }
        const invalidTemplate = budgetTemplates.find((t) => !t.templateKey || !t.displayName);
        if (invalidTemplate) {
            addNotification({
                title: 'Missing template fields',
                message: 'Each template needs a template key and display name.',
                type: 'error'
            });
            return;
        }
        const invalidPreset = workflowPresets.find((p) => !p.presetKey);
        if (invalidPreset) {
            addNotification({ title: 'Missing preset key', message: 'Each workflow preset needs a key.', type: 'error' });
            return;
        }
        setSaving(true);
        try {
            const financeRes = await apiRequest(
                '/org-management/finance/config',
                { budgetTemplates, workflowPresets },
                { method: 'PUT' }
            );
            if (!financeRes.success) {
                addNotification({ title: 'Error', message: financeRes.message || 'Save failed', type: 'error' });
                return;
            }
            const policyRes = await apiRequest(
                '/org-management/config',
                {
                    atlasPolicy: {
                        budgets: lineItemPolicy
                    }
                },
                { method: 'PUT' }
            );
            if (!policyRes.success) {
                addNotification({
                    title: 'Partial save',
                    message: 'Templates saved, but budget line-item policy failed to save.',
                    type: 'error'
                });
                return;
            }
            addNotification({ title: 'Saved', message: 'Finance templates and policy updated.', type: 'success' });
            refetch();
        } catch (e) {
            addNotification({
                title: 'Error',
                message: e?.response?.data?.message || e?.message || 'Save failed',
                type: 'error'
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="configuration dash">
                <div className="content" style={{ padding: 40 }}>
                    Loading finance configuration…
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="configuration dash">
                <div className="content error" style={{ padding: 40 }}>
                    {error}
                </div>
            </div>
        );
    }

    const policySettingsItems = [
        {
            title: 'Budget category mode',
            subtitle: 'Control whether clubs are restricted to template categories or can add custom rows on top of template defaults.',
            action: (
                <select
                    value={lineItemPolicy.lineItemMode}
                    onChange={(e) =>
                        setLineItemPolicy((prev) => ({
                            ...prev,
                            lineItemMode: e.target.value === 'template_plus_custom' ? 'template_plus_custom' : 'template_only'
                        }))
                    }
                >
                    {LINE_ITEM_MODE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            )
        },
        {
            title: 'Max custom line items',
            subtitle: 'Only applies when custom line items are enabled.',
            action: (
                <input
                    type="number"
                    min="0"
                    max="100"
                    disabled={lineItemPolicy.lineItemMode !== 'template_plus_custom'}
                    value={lineItemPolicy.maxCustomLineItems}
                    onChange={(e) =>
                        setLineItemPolicy((prev) => ({
                            ...prev,
                            maxCustomLineItems: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0))
                        }))
                    }
                />
            )
        }
    ];

    return (
        <div className="configuration dash">
            <header className="header">
                <h1>Budget templates &amp; workflow</h1>
                <p>
                    Define line-item templates and multi-stage approval presets for organization budgets (Phase 2
                    finance MVP).
                </p>
                <img src={AtlasMain} alt="" />
            </header>
            <div className="content">
                <div className="config-sections">
                    <div className="config-section">
                        <h2>
                            <Icon icon="mdi:tune-variant" />
                            Budget line-item policy
                        </h2>
                        <SettingsList items={policySettingsItems} />
                    </div>
                    <div className="config-section">
                        <h2>
                            <Icon icon="mdi:file-table-outline" />
                            Budget templates builder
                        </h2>
                        <div className="finance-builder-layout">
                            <div className="finance-builder-sidebar">
                                <button type="button" className="builder-add-btn" onClick={addTemplate}>
                                    <Icon icon="mdi:plus" />
                                    Template
                                </button>
                                {(budgetTemplates || []).map((template) => (
                                    <button
                                        key={template.templateKey}
                                        type="button"
                                        className={`builder-sidebar-item ${selectedTemplate?.templateKey === template.templateKey ? 'active' : ''}`}
                                        onClick={() => setSelectedTemplateKey(template.templateKey)}
                                    >
                                        <span>{template.displayName || template.templateKey}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="finance-builder-main">
                                {selectedTemplate ? (
                                    <>
                                        <SettingsList
                                            items={[
                                                {
                                                    title: 'Template key',
                                                    subtitle: 'Internal identifier.',
                                                    action: (
                                                        <input
                                                            type="text"
                                                            value={selectedTemplate.templateKey}
                                                            onChange={(e) => {
                                                                const oldKey = selectedTemplate.templateKey;
                                                                const nextKey = normalizeKey(e.target.value, oldKey);
                                                                if (!nextKey || nextKey === oldKey) return;
                                                                if (budgetTemplates.some((t) => t.templateKey === nextKey && t.templateKey !== oldKey)) {
                                                                    return;
                                                                }
                                                                setBudgetTemplates((prev) =>
                                                                    prev.map((t) =>
                                                                        t.templateKey === oldKey ? { ...t, templateKey: nextKey } : t
                                                                    )
                                                                );
                                                                setSelectedTemplateKey(nextKey);
                                                            }}
                                                        />
                                                    )
                                                },
                                                {
                                                    title: 'Display name',
                                                    subtitle: 'What admins and clubs see.',
                                                    action: (
                                                        <input
                                                            type="text"
                                                            value={selectedTemplate.displayName || ''}
                                                            onChange={(e) =>
                                                                updateTemplate(selectedTemplate.templateKey, (t) => ({
                                                                    ...t,
                                                                    displayName: e.target.value
                                                                }))
                                                            }
                                                        />
                                                    )
                                                },
                                                {
                                                    title: 'Org type keys',
                                                    subtitle: 'Comma-separated org types this template applies to.',
                                                    action: (
                                                        <input
                                                            type="text"
                                                            value={(selectedTemplate.orgTypeKeys || []).join(', ')}
                                                            onChange={(e) =>
                                                                updateTemplate(selectedTemplate.templateKey, (t) => ({
                                                                    ...t,
                                                                    orgTypeKeys: e.target.value
                                                                        .split(',')
                                                                        .map((v) => v.trim())
                                                                        .filter(Boolean)
                                                                }))
                                                            }
                                                        />
                                                    )
                                                },
                                                {
                                                    title: 'Workflow preset',
                                                    subtitle: 'Approval flow used when submitted.',
                                                    action: (
                                                        <select
                                                            value={selectedTemplate.workflowPresetKey || ''}
                                                            onChange={(e) =>
                                                                updateTemplate(selectedTemplate.templateKey, (t) => ({
                                                                    ...t,
                                                                    workflowPresetKey: e.target.value
                                                                }))
                                                            }
                                                        >
                                                            {(workflowPresets || []).map((preset) => (
                                                                <option key={preset.presetKey} value={preset.presetKey}>
                                                                    {preset.presetKey}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    )
                                                }
                                            ]}
                                        />
                                        <div className="builder-subsection">
                                            <div className="builder-subsection-header">
                                                <h3>Line item definitions</h3>
                                                <button
                                                    type="button"
                                                    className="builder-add-btn"
                                                    onClick={() => addLineItem(selectedTemplate.templateKey)}
                                                >
                                                    <Icon icon="mdi:plus" />
                                                    Line item
                                                </button>
                                            </div>
                                            <div className="line-item-list">
                                                {(selectedTemplate.lineItemDefinitions || []).map((lineItem, index) => (
                                                    <div key={`${lineItem.key}-${index}`} className="line-item-row">
                                                        <input
                                                            type="text"
                                                            value={lineItem.key}
                                                            placeholder="key"
                                                            onChange={(e) =>
                                                                updateTemplate(selectedTemplate.templateKey, (t) => ({
                                                                    ...t,
                                                                    lineItemDefinitions: (t.lineItemDefinitions || []).map((li, i) =>
                                                                        i === index ? { ...li, key: normalizeKey(e.target.value, li.key) } : li
                                                                    )
                                                                }))
                                                            }
                                                        />
                                                        <input
                                                            type="text"
                                                            value={lineItem.label}
                                                            placeholder="label"
                                                            onChange={(e) =>
                                                                updateTemplate(selectedTemplate.templateKey, (t) => ({
                                                                    ...t,
                                                                    lineItemDefinitions: (t.lineItemDefinitions || []).map((li, i) =>
                                                                        i === index ? { ...li, label: e.target.value } : li
                                                                    )
                                                                }))
                                                            }
                                                        />
                                                        <select
                                                            value={lineItem.kind || 'currency'}
                                                            onChange={(e) =>
                                                                updateTemplate(selectedTemplate.templateKey, (t) => ({
                                                                    ...t,
                                                                    lineItemDefinitions: (t.lineItemDefinitions || []).map((li, i) =>
                                                                        i === index ? { ...li, kind: e.target.value } : li
                                                                    )
                                                                }))
                                                            }
                                                        >
                                                            <option value="currency">Currency</option>
                                                            <option value="number">Number</option>
                                                            <option value="text">Text</option>
                                                        </select>
                                                        <label className="builder-checkbox">
                                                            <input
                                                                type="checkbox"
                                                                checked={!!lineItem.required}
                                                                onChange={(e) =>
                                                                    updateTemplate(selectedTemplate.templateKey, (t) => ({
                                                                        ...t,
                                                                        lineItemDefinitions: (t.lineItemDefinitions || []).map((li, i) =>
                                                                            i === index ? { ...li, required: e.target.checked } : li
                                                                        )
                                                                    }))
                                                                }
                                                            />
                                                            Required
                                                        </label>
                                                        <button
                                                            type="button"
                                                            className="builder-remove-btn"
                                                            onClick={() =>
                                                                updateTemplate(selectedTemplate.templateKey, (t) => ({
                                                                    ...t,
                                                                    lineItemDefinitions: (t.lineItemDefinitions || []).filter(
                                                                        (_, i) => i !== index
                                                                    )
                                                                }))
                                                            }
                                                        >
                                                            <Icon icon="mdi:delete-outline" />
                                                        </button>
                                                    </div>
                                                ))}
                                                {(selectedTemplate.lineItemDefinitions || []).length === 0 ? (
                                                    <p className="config-help">No line items yet.</p>
                                                ) : null}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="builder-remove-template-btn"
                                            onClick={() => removeTemplate(selectedTemplate.templateKey)}
                                        >
                                            Remove template
                                        </button>
                                    </>
                                ) : (
                                    <p className="config-help">Create a template to get started.</p>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="config-section">
                        <h2>
                            <Icon icon="mdi:source-branch" />
                            Workflow presets builder
                        </h2>
                        <div className="finance-builder-layout">
                            <div className="finance-builder-sidebar">
                                <button type="button" className="builder-add-btn" onClick={addPreset}>
                                    <Icon icon="mdi:plus" />
                                    Preset
                                </button>
                                {(workflowPresets || []).map((preset) => (
                                    <button
                                        key={preset.presetKey}
                                        type="button"
                                        className={`builder-sidebar-item ${selectedPreset?.presetKey === preset.presetKey ? 'active' : ''}`}
                                        onClick={() => setSelectedPresetKey(preset.presetKey)}
                                    >
                                        <span>{preset.presetKey}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="finance-builder-main">
                                {selectedPreset ? (
                                    <>
                                        <SettingsList
                                            items={[
                                                {
                                                    title: 'Preset key',
                                                    subtitle: 'Internal identifier.',
                                                    action: (
                                                        <input
                                                            type="text"
                                                            value={selectedPreset.presetKey}
                                                            onChange={(e) => {
                                                                const oldKey = selectedPreset.presetKey;
                                                                const nextKey = normalizeKey(e.target.value, oldKey);
                                                                if (!nextKey || nextKey === oldKey) return;
                                                                if (workflowPresets.some((p) => p.presetKey === nextKey && p.presetKey !== oldKey)) {
                                                                    return;
                                                                }
                                                                setWorkflowPresets((prev) =>
                                                                    prev.map((p) =>
                                                                        p.presetKey === oldKey ? { ...p, presetKey: nextKey } : p
                                                                    )
                                                                );
                                                                setBudgetTemplates((prev) =>
                                                                    prev.map((template) =>
                                                                        template.workflowPresetKey === oldKey
                                                                            ? { ...template, workflowPresetKey: nextKey }
                                                                            : template
                                                                    )
                                                                );
                                                                setSelectedPresetKey(nextKey);
                                                            }}
                                                        />
                                                    )
                                                }
                                            ]}
                                        />
                                        <div className="builder-subsection">
                                            <div className="builder-subsection-header">
                                                <h3>Stages</h3>
                                                <button
                                                    type="button"
                                                    className="builder-add-btn"
                                                    onClick={() => addPresetStage(selectedPreset.presetKey)}
                                                >
                                                    <Icon icon="mdi:plus" />
                                                    Stage
                                                </button>
                                            </div>
                                            <div className="line-item-list">
                                                {(selectedPreset.stages || []).map((stage, index) => (
                                                    <div className="line-item-row" key={`${stage.key}-${index}`}>
                                                        <input
                                                            type="text"
                                                            value={stage.key}
                                                            placeholder="stage key"
                                                            onChange={(e) =>
                                                                updatePreset(selectedPreset.presetKey, (preset) => ({
                                                                    ...preset,
                                                                    stages: (preset.stages || []).map((s, i) =>
                                                                        i === index ? { ...s, key: normalizeKey(e.target.value, s.key) } : s
                                                                    )
                                                                }))
                                                            }
                                                        />
                                                        <input
                                                            type="text"
                                                            value={stage.label}
                                                            placeholder="stage label"
                                                            onChange={(e) =>
                                                                updatePreset(selectedPreset.presetKey, (preset) => ({
                                                                    ...preset,
                                                                    stages: (preset.stages || []).map((s, i) =>
                                                                        i === index ? { ...s, label: e.target.value } : s
                                                                    )
                                                                }))
                                                            }
                                                        />
                                                        <select
                                                            value={stage.actorType || 'org_permission'}
                                                            onChange={(e) =>
                                                                updatePreset(selectedPreset.presetKey, (preset) => ({
                                                                    ...preset,
                                                                    stages: (preset.stages || []).map((s, i) =>
                                                                        i === index ? { ...s, actorType: e.target.value } : s
                                                                    )
                                                                }))
                                                            }
                                                        >
                                                            <option value="org_permission">Org permission</option>
                                                            <option value="platform_admin">Platform admin</option>
                                                        </select>
                                                        <input
                                                            type="text"
                                                            value={stage.permission || ''}
                                                            placeholder="permission (optional)"
                                                            onChange={(e) =>
                                                                updatePreset(selectedPreset.presetKey, (preset) => ({
                                                                    ...preset,
                                                                    stages: (preset.stages || []).map((s, i) =>
                                                                        i === index ? { ...s, permission: e.target.value } : s
                                                                    )
                                                                }))
                                                            }
                                                        />
                                                        <button
                                                            type="button"
                                                            className="builder-remove-btn"
                                                            onClick={() =>
                                                                updatePreset(selectedPreset.presetKey, (preset) => ({
                                                                    ...preset,
                                                                    stages: (preset.stages || []).filter((_, i) => i !== index)
                                                                }))
                                                            }
                                                        >
                                                            <Icon icon="mdi:delete-outline" />
                                                        </button>
                                                    </div>
                                                ))}
                                                {(selectedPreset.stages || []).length === 0 ? (
                                                    <p className="config-help">No stages yet.</p>
                                                ) : null}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="builder-remove-template-btn"
                                            onClick={() => removePreset(selectedPreset.presetKey)}
                                        >
                                            Remove preset
                                        </button>
                                    </>
                                ) : (
                                    <p className="config-help">Create a preset to get started.</p>
                                )}
                            </div>
                        </div>
                    </div>
                    <button type="button" className="save-btn" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving…' : 'Save finance configuration'}
                    </button>
                </div>
            </div>
        </div>
    );
}
