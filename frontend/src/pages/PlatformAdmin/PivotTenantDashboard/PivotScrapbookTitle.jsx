import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import justGoBurst from '../../../assets/pivot/just-go-burst.svg';
import './PivotScrapbookTitle.scss';

const SHAPE_INSET = 5;
const SHAPE_VIEWBOX = '0 0 100 50';

const COLORS = {
  cream: '#FAF6EF',
  ink: '#1A1714',
  accent: '#FF4F1F',
  tickerBar: '#4AB5FF',
};

/** Same strip geometry / palette as mobile `getScrapbookTitleStripLayouts`. */
const STRIP_LAYOUTS_MD = [
  {
    rotateDeg: -1.4,
    marginLeft: 0,
    marginTop: 0,
    backgroundColor: COLORS.cream,
    textColor: COLORS.ink,
    strokeColor: COLORS.ink,
    fontSize: 34,
    paddingTop: 4,
    paddingBottom: 5,
    paddingLeft: 8,
    paddingRight: 12,
    shapePath: 'M 1 2 L 99 4 L 97 48 L 0 45 Z',
  },
  {
    rotateDeg: 1.1,
    marginLeft: 12,
    marginTop: -2,
    backgroundColor: COLORS.accent,
    textColor: COLORS.cream,
    strokeColor: COLORS.ink,
    fontSize: 30,
    paddingTop: 5,
    paddingBottom: 4,
    paddingLeft: 10,
    paddingRight: 9,
    shapePath: 'M 3 1 L 100 3 L 98 49 L 0 47 Z',
  },
  {
    rotateDeg: -0.9,
    marginLeft: 4,
    marginTop: -3,
    backgroundColor: COLORS.tickerBar,
    textColor: COLORS.ink,
    strokeColor: COLORS.ink,
    fontSize: 28,
    paddingTop: 4,
    paddingBottom: 5,
    paddingLeft: 7,
    paddingRight: 11,
    shapePath: 'M 0 4 L 98 1 L 100 46 L 2 48 Z',
  },
];

/** Compact blue strip for tenant / city meta (single bound). */
const STRIP_LAYOUTS_SM = [
  {
    rotateDeg: 0.2,
    marginLeft: 2,
    marginTop: 0,
    backgroundColor: COLORS.tickerBar,
    textColor: COLORS.ink,
    strokeColor: COLORS.ink,
    fontSize: 13,
    fontWeight: 500,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 6,
    paddingRight: 7,
    shapePath: 'M 0 4 L 98 1 L 100 46 L 2 48 Z',
  },
];

/** Split title into 1–3 scrapbook strips (word groups, collage-style). */
export function layoutScrapbookTitleLines(title) {
  const words = String(title || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return ['untitled'];
  if (words.length <= 3) return words;
  if (words.length === 4) {
    return [words.slice(0, 2).join(' '), words.slice(2).join(' ')];
  }
  if (words.length === 5) {
    return [words.slice(0, 2).join(' '), words[2], words.slice(3).join(' ')];
  }
  const chunk = Math.ceil(words.length / 3);
  return [
    words.slice(0, chunk).join(' '),
    words.slice(chunk, chunk * 2).join(' '),
    words.slice(chunk * 2).join(' '),
  ].filter(Boolean);
}

function ScrapbookStrip({ line, layout }) {
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
  }, [line, layout]);

  const shapeWidth = size.width + SHAPE_INSET * 2;
  const shapeHeight = size.height + SHAPE_INSET * 2;

  return (
    <div
      className="pivot-scrapbook-title__strip"
      style={{
        marginLeft: layout.marginLeft,
        marginTop: layout.marginTop,
        transform: `rotate(${layout.rotateDeg}deg)`,
      }}
    >
      <div
        ref={bodyRef}
        className="pivot-scrapbook-title__strip-body"
        style={{
          paddingTop: layout.paddingTop,
          paddingBottom: layout.paddingBottom,
          paddingLeft: layout.paddingLeft,
          paddingRight: layout.paddingRight,
        }}
      >
        {size.width > 0 && size.height > 0 ? (
          <svg
            className="pivot-scrapbook-title__shape"
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
              d={layout.shapePath}
              fill={layout.backgroundColor}
              stroke={layout.strokeColor}
              strokeWidth={2.5}
              strokeLinejoin="miter"
            />
          </svg>
        ) : null}
        <span
          className="pivot-scrapbook-title__text"
          style={{
            color: layout.textColor,
            fontSize: layout.fontSize,
            fontWeight: layout.fontWeight ?? 700,
            lineHeight: `${Math.round(layout.fontSize * 1.15)}px`,
            transform: `rotate(${-layout.rotateDeg}deg)`,
          }}
        >
          {line}
        </span>
      </div>
    </div>
  );
}

/**
 * Neo-brutalist collage title — cut-paper strips + burst, matching mobile event detail.
 *
 * @param {object} props
 * @param {string} props.title
 * @param {'md'|'sm'} [props.size='md']
 * @param {boolean} [props.showBurst=true]
 * @param {boolean} [props.splitWords=true] — when false, keep the full title on one strip
 * @param {string} [props.as='h1']
 */
function PivotScrapbookTitle({
  title,
  size = 'md',
  showBurst = true,
  splitWords = true,
  as: Tag = 'h1',
}) {
  const lines = useMemo(() => {
    if (!splitWords) {
      const trimmed = String(title || '')
        .trim()
        .toLowerCase();
      return [trimmed || 'untitled'];
    }
    return layoutScrapbookTitleLines(title);
  }, [title, splitWords]);
  const layouts = size === 'sm' ? STRIP_LAYOUTS_SM : STRIP_LAYOUTS_MD;

  return (
    <Tag
      className={`pivot-scrapbook-title${
        size === 'sm' ? ' pivot-scrapbook-title--sm' : ''
      }`}
    >
      {showBurst ? (
        <img
          src={justGoBurst}
          alt=""
          className="pivot-scrapbook-title__burst"
          aria-hidden="true"
          draggable={false}
        />
      ) : null}
      {lines.map((line, index) => (
        <div
          key={`${line}-${index}`}
          className="pivot-scrapbook-title__line"
          style={{ zIndex: index + 1 }}
        >
          <ScrapbookStrip line={line} layout={layouts[index % layouts.length]} />
        </div>
      ))}
    </Tag>
  );
}

export default PivotScrapbookTitle;
