import React, { useCallback, useRef } from 'react';

const MIN_W = 0.05; // minimum QR box side as a fraction of poster width

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

/**
 * Drag-to-place editor for the QR box. `value` is a normalized square region
 * { x, y, w } where x/y are the top-left as fractions of the poster's width and
 * height, and w is the side length as a fraction of poster width (the box is
 * always square in pixels). Drag the box to move it, drag the corner to resize.
 */
function PivotPosterQrBoxEditor({ imageSrc, value, onChange, qrColor = '#1A1714', plate = true }) {
  const containerRef = useRef(null);
  const dragRef = useRef(null);

  const handlePointerMove = useCallback(
    (e) => {
      const drag = dragRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!drag || !rect) return;

      if (drag.mode === 'move') {
        const dx = (e.clientX - drag.startX) / rect.width;
        const dy = (e.clientY - drag.startY) / rect.height;
        const hFrac = (drag.startBox.w * rect.width) / rect.height;
        const x = clamp(drag.startBox.x + dx, 0, 1 - drag.startBox.w);
        const y = clamp(drag.startBox.y + dy, 0, 1 - hFrac);
        onChange({ x: round(x), y: round(y), w: round(drag.startBox.w) });
      } else if (drag.mode === 'resize') {
        const leftPx = drag.startBox.x * rect.width;
        const topPx = drag.startBox.y * rect.height;
        const maxPx = Math.min(rect.width - leftPx, rect.height - topPx);
        const sizePx = clamp(e.clientX - rect.left - leftPx, MIN_W * rect.width, maxPx);
        onChange({ x: round(drag.startBox.x), y: round(drag.startBox.y), w: round(sizePx / rect.width) });
      }
    },
    [onChange]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', endDrag);
  }, [handlePointerMove]);

  const startDrag = useCallback(
    (mode, e) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { mode, startX: e.clientX, startY: e.clientY, startBox: { ...value } };
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', endDrag);
    },
    [value, handlePointerMove, endDrag]
  );

  const boxStyle = {
    left: `${value.x * 100}%`,
    top: `${value.y * 100}%`,
    // Square in pixels: side is a fraction of the container's width.
    width: `${value.w * 100}%`,
    aspectRatio: '1 / 1',
  };

  return (
    <div className="pivot-poster-editor__stage" ref={containerRef}>
      <img className="pivot-poster-editor__img" src={imageSrc} alt="Poster preview" draggable={false} />
      <div
        className="pivot-poster-editor__box"
        style={boxStyle}
        onPointerDown={(e) => startDrag('move', e)}
        role="button"
        tabIndex={0}
        aria-label="Drag to position QR"
      >
        <div
          className="pivot-poster-editor__qr-preview"
          style={{
            background: plate ? '#ffffff' : 'transparent',
            color: qrColor,
            borderColor: qrColor,
          }}
        >
          <span>QR</span>
        </div>
        <span
          className="pivot-poster-editor__handle"
          onPointerDown={(e) => startDrag('resize', e)}
          role="button"
          tabIndex={0}
          aria-label="Drag to resize QR"
        />
      </div>
    </div>
  );
}

export default PivotPosterQrBoxEditor;
