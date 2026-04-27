import React from 'react';
import './KeybindTooltip.scss';

/**
 * Reusable keybind tooltip for hover-triggered UI hints.
 *
 * Intended usage:
 * - Place inside a parent trigger that has `position: relative`.
 * - Reveal on hover/focus from the parent container CSS.
 * - Keep tooltip non-interactive (`pointer-events: none`) for simple hint behavior.
 *
 * @param {Object} props
 * @param {string|React.ReactNode} props.label - Tooltip body label (e.g. "Month")
 * @param {string|React.ReactNode} [props.keybind] - Optional keyboard hint shown in a boxed <kbd> (e.g. "M")
 * @param {string} [props.className] - Optional class name for placement/style overrides
 *
 * @example
 * <button className="range-btn">
 *   month
 *   <KeybindTooltip label="Month" keybind="M" />
 * </button>
 */
function KeybindTooltip({ label, keybind, className = '' }) {
    return (
        <span className={`keybind-tooltip ${className}`.trim()}>
            <span>{label}</span>
            {keybind ? <kbd>{keybind}</kbd> : null}
        </span>
    );
}

export default KeybindTooltip;
