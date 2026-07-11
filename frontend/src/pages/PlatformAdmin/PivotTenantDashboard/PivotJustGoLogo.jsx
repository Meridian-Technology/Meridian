import React, { useLayoutEffect, useRef, useState } from 'react';
import justGoWordmark from '../../../assets/pivot/just-go-wordmark-dark.svg';
import './PivotJustGoLogo.scss';

const SHAPE_INSET = 7;
const SHAPE_VIEWBOX = '0 0 100 50';
/* Four-edge cut-paper scrap — slight skew, not a perfect rect. */
const SHAPE_PATH = 'M 1 5 L 99 1 L 97 48 L 2 46 Z';

/**
 * Just Go wordmark in a scrapbook cut-paper bound (same geometry as title strips).
 * Short scrapbook frame; wordmark is centered and allowed to peek past the edges.
 */
function PivotJustGoLogo() {
  const bodyRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;

    const measure = () => {
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };

    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    return () => observer?.disconnect();
  }, []);

  const shapeWidth = size.width + SHAPE_INSET * 2;
  const shapeHeight = size.height + SHAPE_INSET * 2;

  return (
    <div className="pivot-just-go-logo" aria-label="just go">
      <div ref={bodyRef} className="pivot-just-go-logo__body">
        {/* {size.width > 0 && size.height > 0 ? (
          <svg
            className="pivot-just-go-logo__shape"
            width={shapeWidth}
            height={shapeHeight}
            viewBox={SHAPE_VIEWBOX}
            preserveAspectRatio="none"
            aria-hidden="true"
            style={{
              width: shapeWidth,
              height: shapeHeight,
              top: -SHAPE_INSET,
              left: -SHAPE_INSET,
            }}
          >
            <path
              d={SHAPE_PATH}
              fill="#1A1714"
              stroke="#1A1714"
              strokeWidth={2.5}
              strokeLinejoin="miter"
            />
          </svg>
        ) : null} */}
        <div className="pivot-just-go-logo__window">
          <img
            className="pivot-just-go-logo__mark"
            src={justGoWordmark}
            alt="just go"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

export default PivotJustGoLogo;
