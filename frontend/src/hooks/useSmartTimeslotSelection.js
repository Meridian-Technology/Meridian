import { useState, useCallback } from 'react';

/**
 * Smart Timeslot Selection Hook
 * 
 * Implements the proven philosophy from RoomHelpers but adapted for modern ISO datetime infrastructure.
 * Key principles:
 * - Automatic smart merging of overlapping/adjacent selections
 * - Conflict prevention with existing events
 * - Clean state management with ISO datetime strings
 * - Predictable behavior users can rely on
 */
const useSmartTimeslotSelection = (timeIncrement = 15, existingEvents = []) => {
    const [selections, setSelections] = useState([]);

    /**
     * Smart merging logic - combines overlapping or adjacent selections
     * Philosophy: Users shouldn't have to manually manage overlaps
     */
    const mergeSelections = useCallback((selectionsToMerge) => {
        if (selectionsToMerge.length <= 1) return selectionsToMerge;

        // Sort by start time
        const sorted = [...selectionsToMerge].sort((a, b) => 
            new Date(a.startTime) - new Date(b.startTime)
        );

        // Merge overlapping/adjacent selections
        return sorted.reduce((merged, current) => {
            if (merged.length === 0) {
                return [current];
            }

            const lastSelection = merged[merged.length - 1];
            const lastEnd = new Date(lastSelection.endTime);
            const currentStart = new Date(current.startTime);
            
            // Check if selections should be merged
            // Adjacent = end time equals start time (or within one time increment)
            const timeDiffMinutes = (currentStart - lastEnd) / (1000 * 60);
            const shouldMerge = timeDiffMinutes <= timeIncrement;

            if (shouldMerge) {
                // Merge: extend the last selection
                const mergedEndTime = new Date(Math.max(
                    new Date(lastSelection.endTime),
                    new Date(current.endTime)
                ));
                
                lastSelection.endTime = mergedEndTime.toISOString();
                lastSelection.endMinutes = mergedEndTime.getHours() * 60 + mergedEndTime.getMinutes();
                lastSelection.id = `merged-${Date.now()}-${Math.random()}`;
                
                return merged;
            } else {
                // No merge needed: add as separate selection
                return [...merged, current];
            }
        }, []);
    }, [timeIncrement]);

    /**
     * Conflict detection - prevents selections that overlap with existing events
     * Philosophy: Proactive conflict prevention is better than reactive resolution
     */
    const hasConflict = useCallback((newSelection) => {
        return existingEvents.some(event => {
            const eventStart = new Date(event.start_time);
            const eventEnd = new Date(event.end_time);
            const selectionStart = new Date(newSelection.startTime);
            const selectionEnd = new Date(newSelection.endTime);
            
            // Same day check
            if (eventStart.toDateString() !== selectionStart.toDateString()) {
                return false;
            }
            
            // Time overlap check
            return !(eventEnd <= selectionStart || selectionEnd <= eventStart);
        });
    }, [existingEvents]);

    /**
     * Add selection with smart merging and conflict checking
     * Philosophy: System should handle complexity, not the user
     */
    const addSelection = useCallback((newSelection) => {
        // Prevent conflicting selections
        if (hasConflict(newSelection)) {
            console.warn('Selection conflicts with existing event:', newSelection);
            return false; // Indicate failure
        }

        setSelections(prev => {
            const allSelections = [...prev, newSelection];
            return mergeSelections(allSelections);
        });
        
        return true; // Indicate success
    }, [hasConflict, mergeSelections]);

    /**
     * Remove selection
     * Philosophy: Simple, direct removal without side effects
     */
    const removeSelection = useCallback((selectionId) => {
        setSelections(prev => prev.filter(sel => sel.id !== selectionId));
    }, []);

    /**
     * Update existing selection (for drag/resize operations)
     * Philosophy: Maintain smart merging even during modifications
     */
    const updateSelection = useCallback((selectionId, updates) => {
        setSelections(prev => {
            const updated = prev.map(sel => {
                if (sel.id !== selectionId) return sel;
                
                const updatedSelection = { ...sel, ...updates };
                
                // If startMinutes or endMinutes were updated, recalculate ISO strings
                if (updates.startMinutes !== undefined || updates.endMinutes !== undefined) {
                    const baseDate = new Date(sel.startTime);
                    
                    if (updates.startMinutes !== undefined) {
                        const startTime = new Date(baseDate);
                        startTime.setHours(Math.floor(updates.startMinutes / 60));
                        startTime.setMinutes(updates.startMinutes % 60);
                        startTime.setSeconds(0);
                        updatedSelection.startTime = startTime.toISOString();
                    }
                    
                    if (updates.endMinutes !== undefined) {
                        const endTime = new Date(baseDate);
                        endTime.setHours(Math.floor(updates.endMinutes / 60));
                        endTime.setMinutes(updates.endMinutes % 60);
                        endTime.setSeconds(0);
                        updatedSelection.endTime = endTime.toISOString();
                    }
                }
                
                return updatedSelection;
            });
            
            // Re-apply smart merging after update
            return mergeSelections(updated);
        });
    }, [mergeSelections]);

    /**
     * Clear all selections
     * Philosophy: Simple reset functionality
     */
    const clearSelections = useCallback(() => {
        setSelections([]);
    }, []);

    /**
     * Get conflicting events for a selection
     * Philosophy: Provide detailed feedback for user understanding
     */
    const getConflictingEvents = useCallback((selection) => {
        return existingEvents.filter(event => {
            const eventStart = new Date(event.start_time);
            const eventEnd = new Date(event.end_time);
            const selectionStart = new Date(selection.startTime);
            const selectionEnd = new Date(selection.endTime);
            
            // Same day check
            if (eventStart.toDateString() !== selectionStart.toDateString()) {
                return false;
            }
            
            // Time overlap check
            return !(eventEnd <= selectionStart || selectionEnd <= eventStart);
        });
    }, [existingEvents]);

    return {
        selections,
        addSelection,
        removeSelection,
        updateSelection,
        clearSelections,
        hasConflict,
        getConflictingEvents,
        // Computed properties
        hasSelections: selections.length > 0,
        selectionCount: selections.length
    };
};

export default useSmartTimeslotSelection;