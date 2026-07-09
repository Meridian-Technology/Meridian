import React from 'react';

function PivotTagMultiSelect({
  catalogTags,
  selectedSlugs,
  onChange,
  labelId,
  hint,
  compact = false,
  showLabel = true,
  showHotkeys = false,
}) {
  const toggleSlug = (slug) => {
    if (selectedSlugs.includes(slug)) {
      onChange(selectedSlugs.filter((entry) => entry !== slug));
      return;
    }
    onChange([...selectedSlugs, slug]);
  };

  return (
    <div className={`pivot-lab__tag-field${compact ? ' pivot-lab__tag-field--compact' : ''}`}>
      {showLabel ? (
        <span className="linear-field__label" id={labelId}>
          Tags
        </span>
      ) : null}
      {hint ? <p className="pivot-lab__tag-hint">{hint}</p> : null}
      <div
        className={`pivot-lab__tag-picker${compact ? ' pivot-lab__tag-picker--compact' : ''}`}
        role="group"
        aria-labelledby={showLabel ? labelId : undefined}
      >
        {catalogTags.length ? (
          catalogTags.map((tag, index) => {
            const selected = selectedSlugs.includes(tag.slug);
            const hotkey = showHotkeys && index < 9 ? index + 1 : null;
            return (
              <button
                key={tag.slug}
                type="button"
                className={`pivot-lab__tag-chip${selected ? ' pivot-lab__tag-chip--selected' : ''}${
                  hotkey ? ' pivot-lab__tag-chip--hotkey' : ''
                }`}
                aria-pressed={selected}
                aria-keyshortcuts={hotkey ? String(hotkey) : undefined}
                onClick={() => toggleSlug(tag.slug)}
              >
                {hotkey ? <span className="pivot-lab__tag-hotkey">{hotkey}</span> : null}
                {tag.label}
              </button>
            );
          })
        ) : (
          <p className="pivot-lab__tag-hint">Loading tag catalog…</p>
        )}
      </div>
    </div>
  );
}

export default PivotTagMultiSelect;
