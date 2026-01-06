import React from 'react';
import { Icon } from '@iconify-icon/react/dist/iconify.mjs';
import './FormPreview.scss';

const FormPreview = ({ form }) => {
    return (
        <div className="form-preview">
            <div className="preview-header">
                <Icon icon="ion:document-text" />
                <h3>{form.title}</h3>
            </div>
            <p>{form.description}</p>
        </div>
    );
};

export default FormPreview;