import React, { useState, useEffect } from 'react';
import { useFetch } from '../../../../hooks/useFetch';
import { useGradient } from '../../../../hooks/useGradient';
import apiRequest from '../../../../utils/postRequest';
import { useNotification } from '../../../../NotificationContext';
import { Icon } from '@iconify-icon/react';

export default function FinanceTemplatesConfig() {
    const { data: res, loading, error, refetch } = useFetch('/org-management/finance/config');
    const { AtlasMain } = useGradient();
    const { addNotification } = useNotification();
    const [templatesJson, setTemplatesJson] = useState('[]');
    const [presetsJson, setPresetsJson] = useState('[]');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (res?.data) {
            setTemplatesJson(JSON.stringify(res.data.budgetTemplates || [], null, 2));
            setPresetsJson(JSON.stringify(res.data.workflowPresets || [], null, 2));
        }
    }, [res]);

    const handleSave = async () => {
        let budgetTemplates;
        let workflowPresets;
        try {
            budgetTemplates = JSON.parse(templatesJson);
            workflowPresets = JSON.parse(presetsJson);
        } catch (e) {
            addNotification({ title: 'Invalid JSON', message: e.message, type: 'error' });
            return;
        }
        if (!Array.isArray(budgetTemplates) || !Array.isArray(workflowPresets)) {
            addNotification({ title: 'Invalid shape', message: 'Expected arrays for both fields.', type: 'error' });
            return;
        }
        setSaving(true);
        try {
            const r = await apiRequest(
                '/org-management/finance/config',
                { budgetTemplates, workflowPresets },
                { method: 'PUT' }
            );
            if (r.success) {
                addNotification({ title: 'Saved', message: 'Finance configuration updated.', type: 'success' });
                refetch();
            } else {
                addNotification({ title: 'Error', message: r.message || 'Save failed', type: 'error' });
            }
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
                            <Icon icon="mdi:file-table-outline" />
                            Budget templates (JSON array)
                        </h2>
                        <p className="config-help">
                            Each template has <code>templateKey</code>, <code>displayName</code>,{' '}
                            <code>orgTypeKeys</code>, <code>workflowPresetKey</code>, and{' '}
                            <code>lineItemDefinitions</code> (key, label, required, kind: currency|number|text).
                        </p>
                        <textarea
                            className="config-json-textarea"
                            rows={16}
                            value={templatesJson}
                            onChange={(e) => setTemplatesJson(e.target.value)}
                            spellCheck={false}
                        />
                    </div>
                    <div className="config-section">
                        <h2>
                            <Icon icon="mdi:source-branch" />
                            Workflow presets (JSON array)
                        </h2>
                        <p className="config-help">
                            Stages use <code>actorType</code> <code>org_permission</code> (officer review) or{' '}
                            <code>platform_admin</code> (finance office in Atlas).
                        </p>
                        <textarea
                            className="config-json-textarea"
                            rows={12}
                            value={presetsJson}
                            onChange={(e) => setPresetsJson(e.target.value)}
                            spellCheck={false}
                        />
                    </div>
                    <button type="button" className="save-btn" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving…' : 'Save finance configuration'}
                    </button>
                </div>
            </div>
        </div>
    );
}
