import React, { useState, useEffect } from 'react';
import './BudgetMessageModal.scss';

/**
 * Content for {@link Popup}: cloneElement injects `handleClose`.
 * Omit overlay styles; Popup supplies the shell.
 */
export default function BudgetStageMessagePopupBody({
    handleClose,
    title,
    description,
    placeholder = '',
    submitLabel = 'Submit',
    cancelLabel = 'Cancel',
    requireNonEmpty = false,
    multiline = true,
    rows = 5,
    onSubmit
}) {
    const [text, setText] = useState('');

    useEffect(() => {
        setText('');
    }, [title]);

    const submit = () => {
        const t = text.trim();
        if (requireNonEmpty && !t) return;
        onSubmit(t);
    };

    return (
        <div
            className="budget-msg-modal budget-msg-modal--in-popup"
            role="dialog"
            aria-modal="true"
            aria-labelledby="budget-stage-msg-title"
            onClick={(e) => e.stopPropagation()}
        >
            <h2 id="budget-stage-msg-title">{title}</h2>
            {description && <p className="budget-msg-modal__desc">{description}</p>}
            {multiline ? (
                <textarea
                    className="budget-msg-modal__input"
                    rows={rows}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={placeholder}
                />
            ) : (
                <input
                    type="text"
                    className="budget-msg-modal__input budget-msg-modal__input--single"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={placeholder}
                />
            )}
            <div className="budget-msg-modal__actions">
                <button type="button" className="budget-msg-modal__btn budget-msg-modal__btn--ghost" onClick={handleClose}>
                    {cancelLabel}
                </button>
                <button
                    type="button"
                    className="budget-msg-modal__btn budget-msg-modal__btn--primary"
                    onClick={submit}
                    disabled={requireNonEmpty && !text.trim()}
                >
                    {submitLabel}
                </button>
            </div>
        </div>
    );
}
