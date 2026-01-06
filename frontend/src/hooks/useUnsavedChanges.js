import { useState, useEffect } from 'react';

const useUnsavedChanges = (originalData, currentData, onSave, onDiscard) => {
    const [hasChanges, setHasChanges] = useState(false);
    const [saving, setSaving] = useState(false);

    // Check if there are changes by comparing current data with original data
    useEffect(() => {
        if (!originalData || !currentData) return;

        const hasUnsavedChanges = JSON.stringify(currentData) !== JSON.stringify(originalData);
        setHasChanges(hasUnsavedChanges);
    }, [originalData, currentData]);

    // Prevent navigation when there are unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (hasChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasChanges]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const success = await onSave();
            if (success) {
                setHasChanges(false);
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDiscard = () => {
        onDiscard();
        setHasChanges(false);
    };

    return {
        hasChanges,
        saving,
        handleSave,
        handleDiscard
    };
};

export default useUnsavedChanges; 