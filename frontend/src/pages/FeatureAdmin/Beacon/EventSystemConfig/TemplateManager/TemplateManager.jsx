import React from 'react';
import './TemplateManager.scss';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';

const TemplateManager = ({ templates = [], onChange }) => {
    return (
        <div className="template-manager">
            <div className="template-header">
                <div className="header-content">
                    <h2>Event Templates</h2>
                    <p>Create and manage reusable event templates for different event types</p>
                </div>
                <button className="add-template-btn">
                    <Icon icon="mdi:plus" />
                    Add Template
                </button>
            </div>
            
            <div className="coming-soon">
                <Icon icon="mdi:file-document-multiple" />
                <h3>Template Management Coming Soon</h3>
                <p>This section will include:</p>
                <ul>
                    <li>Drag-and-drop template builder</li>
                    <li>Pre-configured event types (academic, social, sports, etc.)</li>
                    <li>Custom field definitions</li>
                    <li>Template sharing and versioning</li>
                    <li>Auto-fill rules and validation</li>
                </ul>
            </div>
        </div>
    );
};

export default TemplateManager;
