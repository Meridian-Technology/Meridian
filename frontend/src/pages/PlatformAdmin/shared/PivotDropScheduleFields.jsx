import React from 'react';
import { PIVOT_DROP_DAY_OPTIONS } from '../shared/pivotDropScheduleForm';

export default function PivotDropScheduleFields({
  form,
  onChange,
  onOverrideChange,
  onAddOverride,
  onRemoveOverride,
  showOverrides = true,
}) {
  return (
    <div className="pivot-drop-fields">
      <h3 className="pivot-drop-fields__title">Weekly drop</h3>
      <p className="pivot-drop-fields__hint">
        Configurable per city — default pilot suggestion is Thursday 18:00 local.
      </p>
      <div className="pivot-drop-fields__grid">
        <label className="tenant-metadata-modal__field tenant-metadata-modal__field--full">
          <span className="tenant-metadata-modal__label">Timezone (IANA)</span>
          <input
            className="tenant-metadata-modal__input"
            value={form.pivotDropTimezone}
            onChange={(e) => onChange('pivotDropTimezone', e.target.value)}
            placeholder="America/New_York"
            required
          />
        </label>
        <label className="tenant-metadata-modal__field">
          <span className="tenant-metadata-modal__label">Day of week</span>
          <select
            className="tenant-metadata-modal__input"
            value={form.pivotDropDayOfWeek}
            onChange={(e) => onChange('pivotDropDayOfWeek', e.target.value)}
          >
            {PIVOT_DROP_DAY_OPTIONS.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="tenant-metadata-modal__field">
          <span className="tenant-metadata-modal__label">Hour (local)</span>
          <input
            className="tenant-metadata-modal__input"
            type="number"
            min={0}
            max={23}
            value={form.pivotDropHour}
            onChange={(e) => onChange('pivotDropHour', e.target.value)}
            required
          />
        </label>
        <label className="tenant-metadata-modal__field">
          <span className="tenant-metadata-modal__label">Minute</span>
          <input
            className="tenant-metadata-modal__input"
            type="number"
            min={0}
            max={59}
            value={form.pivotDropMinute}
            onChange={(e) => onChange('pivotDropMinute', e.target.value)}
            required
          />
        </label>
      </div>

      {showOverrides ? (
        <div className="pivot-drop-fields__overrides">
          <div className="pivot-drop-fields__overrides-head">
            <span className="tenant-metadata-modal__label">Per-week overrides</span>
            <button type="button" className="pivot-drop-fields__add" onClick={onAddOverride}>
              Add override
            </button>
          </div>
          {(form.pivotDropOverrides || []).length === 0 ? (
            <p className="pivot-drop-fields__empty">No overrides — default schedule applies.</p>
          ) : (
            (form.pivotDropOverrides || []).map((row, index) => (
              <div key={`override-${index}`} className="pivot-drop-fields__override-row">
                <input
                  className="tenant-metadata-modal__input"
                  value={row.batchWeek}
                  onChange={(e) => onOverrideChange(index, 'batchWeek', e.target.value.toUpperCase())}
                  placeholder="2026-W26"
                />
                <select
                  className="tenant-metadata-modal__input"
                  value={row.dayOfWeek}
                  onChange={(e) => onOverrideChange(index, 'dayOfWeek', e.target.value)}
                >
                  {PIVOT_DROP_DAY_OPTIONS.map((option) => (
                    <option key={option.value} value={String(option.value)}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  className="tenant-metadata-modal__input"
                  type="number"
                  min={0}
                  max={23}
                  value={row.hour}
                  onChange={(e) => onOverrideChange(index, 'hour', e.target.value)}
                />
                <input
                  className="tenant-metadata-modal__input"
                  type="number"
                  min={0}
                  max={59}
                  value={row.minute}
                  onChange={(e) => onOverrideChange(index, 'minute', e.target.value)}
                />
                <button
                  type="button"
                  className="pivot-drop-fields__remove"
                  aria-label="Remove override"
                  onClick={() => onRemoveOverride(index)}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
