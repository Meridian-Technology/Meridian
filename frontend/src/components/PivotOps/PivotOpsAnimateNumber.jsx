import React, { useEffect, useRef, useState } from 'react';
import './PivotOpsAnimateNumber.scss';

/**
 * Per-digit transition (iOS numericText style):
 * outgoing shrinks + blurs toward the top of the glyph box;
 * incoming rises from the bottom and scales up.
 * Scale is eased; a slight vertical bump is springed separately.
 */
const ZWSP = '\u200b';

function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}

function formatValue(value, locale, opts) {
  try {
    return new Intl.NumberFormat(locale, opts).format(value);
  } catch {
    return String(value);
  }
}

function CharSlot({ char, durationMs, blur }) {
  const prev = useRef(char);
  const genRef = useRef(0);
  const [state, setState] = useState(() => ({
    cur: char,
    out: null,
    gen: 0,
  }));

  useEffect(() => {
    if (char === prev.current) return;
    genRef.current += 1;
    setState({ cur: char, out: prev.current, gen: genRef.current });
    prev.current = char;
  }, [char]);

  const animating = state.out !== null;
  const style = {
    '--pon-dur': `${durationMs}ms`,
    '--pon-blur': `${blur}px`,
  };

  return (
    <span className="pivot-ops-animate-number__slot" style={style} aria-hidden>
      <span
        key={`in-${state.gen}`}
        className={cn(
          'pivot-ops-animate-number__bump',
          animating && 'pivot-ops-animate-number__bump--in',
        )}
        onAnimationEnd={
          animating ? () => setState((s) => ({ ...s, out: null })) : undefined
        }
      >
        <span
          className={cn(
            'pivot-ops-animate-number__layer',
            animating && 'pivot-ops-animate-number__in',
          )}
        >
          {state.cur === '' ? ZWSP : state.cur}
        </span>
      </span>
      {animating ? (
        <span
          key={`out-${state.gen}`}
          className="pivot-ops-animate-number__bump pivot-ops-animate-number__bump--out"
        >
          <span className="pivot-ops-animate-number__layer pivot-ops-animate-number__out">
            {state.out === '' ? ZWSP : state.out}
          </span>
        </span>
      ) : null}
    </span>
  );
}

function PivotOpsAnimateNumber({
  value,
  format,
  locale = 'en-US',
  prefix,
  suffix,
  duration = 520,
  blur = 12,
  className = '',
  ...rest
}) {
  const numeric = Number(value);
  const safeValue = Number.isFinite(numeric) ? numeric : 0;
  const formatted = formatValue(safeValue, locale, format);

  const chars = formatted.split('');
  const len = chars.length;
  const label = [
    typeof prefix === 'string' ? prefix : '',
    formatted,
    typeof suffix === 'string' ? suffix : '',
  ].join('');

  if (!Number.isFinite(numeric)) {
    return (
      <span className={cn('pivot-ops-animate-number', className)} {...rest}>
        {value ?? '—'}
      </span>
    );
  }

  return (
    <span {...rest} className={cn('pivot-ops-animate-number', className)}>
      <span className="pivot-ops-animate-number__sr">{label}</span>
      {prefix != null ? <span aria-hidden>{prefix}</span> : null}
      {chars.map((ch, i) => (
        <CharSlot
          key={len - 1 - i}
          char={ch}
          durationMs={duration}
          blur={blur}
        />
      ))}
      {suffix != null ? <span aria-hidden>{suffix}</span> : null}
    </span>
  );
}

export default PivotOpsAnimateNumber;
