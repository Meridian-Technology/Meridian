import React from 'react';

function PivotTagMultiSelect({
  catalogTags,
  selectedSlugs,
  onChange,
  labelId,
  hint,
  compact = false,
  showLabel = true,
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
          catalogTags.map((tag) => {
            const selected = selectedSlugs.includes(tag.slug);
            return (
              <button
                key={tag.slug}
                type="button"
                className={`pivot-lab__tag-chip${selected ? ' pivot-lab__tag-chip--selected' : ''}`}
                aria-pressed={selected}
                onClick={() => toggleSlug(tag.slug)}
              >
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
