import React, { useEffect, useState } from 'react';

/**
 * Small cover thumbnail for import / catalog / curation tables.
 * Shows a dashed placeholder when src is missing or fails to load.
 */
function PivotImportThumb({ src, alt }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <span
        className="pivot-lab__thumb pivot-lab__thumb--empty"
        title={failed ? 'Image failed to load' : 'No cover image'}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.6" />
          <path d="M21 15l-4.5-4.5L6 21" />
        </svg>
      </span>
    );
  }

  return (
    <img
      className="pivot-lab__thumb"
      src={src}
      alt={alt ? `${alt} cover` : 'Event cover'}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

export default PivotImportThumb;
