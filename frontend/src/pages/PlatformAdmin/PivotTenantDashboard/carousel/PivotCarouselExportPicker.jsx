import React, { useEffect, useMemo, useState } from 'react';
import PivotCarouselPopup from './PivotCarouselPopup';

function typeLabel(manifest, type) {
  return manifest?.types?.[type]?.label || type;
}

export default function PivotCarouselExportPicker({
  open,
  slides = [],
  manifest,
  currentIndex = 0,
  onClose,
  onConfirm,
}) {
  const [picked, setPicked] = useState(() => new Set());

  useEffect(() => {
    if (!open) return;
    const current = Math.min(Math.max(currentIndex, 0), Math.max(slides.length - 1, 0)) + 1;
    setPicked(new Set(slides.length ? [current] : []));
  }, [open, currentIndex, slides.length]);

  const selected = useMemo(
    () => [...picked].sort((left, right) => left - right),
    [picked],
  );

  if (!open) return null;

  const toggle = (slideNumber) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(slideNumber)) next.delete(slideNumber);
      else next.add(slideNumber);
      return next;
    });
  };

  const count = selected.length;
  const confirmLabel = count === 1 ? 'export 1 slide' : `export ${count} slides`;

  return (
    <PivotCarouselPopup open={open} onClose={onClose} className="jgz-export-popup">
      <div className="jgz-export-pick">
        <header className="jgz-export-pick__head">
          <h2>Export slides</h2>
          <p>One slide downloads as a PNG. Two or more come as a ZIP.</p>
        </header>

        <div className="jgz-export-pick__shortcuts">
          <button type="button" onClick={() => setPicked(new Set([currentIndex + 1]))}>
            this slide
          </button>
          <button
            type="button"
            onClick={() => setPicked(new Set(slides.map((_, index) => index + 1)))}
          >
            all slides
          </button>
        </div>

        <ul className="jgz-export-pick__list">
          {slides.map((slide, index) => {
            const slideNumber = index + 1;
            const id = `jgz-export-slide-${slideNumber}`;
            return (
              <li key={slide._id || id}>
                <label htmlFor={id}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={picked.has(slideNumber)}
                    onChange={() => toggle(slideNumber)}
                  />
                  <span>
                    <b>{String(slideNumber).padStart(2, '0')}</b>
                    {' '}
                    {typeLabel(manifest, slide.type)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="jgz-export-pick__ops">
          <button type="button" onClick={onClose}>cancel</button>
          <button
            type="button"
            className="jgz-export-pick__go"
            disabled={!count}
            onClick={() => onConfirm(selected)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </PivotCarouselPopup>
  );
}
