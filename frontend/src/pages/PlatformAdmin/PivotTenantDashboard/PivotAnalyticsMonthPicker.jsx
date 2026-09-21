import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import KeybindTooltip from '../../../components/Interface/KeybindTooltip/KeybindTooltip';
import './PivotBatchWeekPicker.scss';

const DEFAULT_PAST = 12;
const DEFAULT_FUTURE = 1;
const MENU_GAP = 6;
const MENU_MIN_WIDTH = 280;
const VIEWPORT_PAD = 8;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidUtcMonth(value) {
  return typeof value === 'string' && MONTH_PATTERN.test(value);
}

export function toUtcMonth(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function shiftUtcMonth(month, delta) {
  if (!isValidUtcMonth(month)) return month;
  const [year, monthIndex] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  return toUtcMonth(next);
}

export function formatUtcMonthLabel(month) {
  if (!isValidUtcMonth(month)) return '—';
  const [year, monthIndex] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthIndex - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatUtcMonthRange(month) {
  if (!isValidUtcMonth(month)) return '—';
  const [year, monthIndex] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const last = new Date(Date.UTC(year, monthIndex, 0));
  const sameYear = start.getUTCFullYear() === last.getUTCFullYear();
  const startLabel = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
  const endLabel = last.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${startLabel} – ${endLabel}`;
}

function buildMonthOptions(centerMonth, { past = DEFAULT_PAST, future = DEFAULT_FUTURE } = {}) {
  const center = isValidUtcMonth(centerMonth) ? centerMonth : toUtcMonth();
  const options = [];
  for (let delta = -past; delta <= future; delta += 1) {
    const month = shiftUtcMonth(center, delta);
    options.push({
      month,
      rangeLabel: formatUtcMonthRange(month),
      delta,
    });
  }
  return options;
}

function measureMenuPosition(triggerEl) {
  if (!triggerEl || typeof window === 'undefined') return null;
  const rect = triggerEl.getBoundingClientRect();
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const width = Math.max(MENU_MIN_WIDTH, rect.width);
  let left = rect.left;
  if (left + width > viewportW - VIEWPORT_PAD) {
    left = Math.max(VIEWPORT_PAD, viewportW - VIEWPORT_PAD - width);
  }
  const top = rect.bottom + MENU_GAP;
  const maxHeight = Math.max(120, viewportH - top - VIEWPORT_PAD);
  return { top, left, width, maxHeight };
}

/**
 * Month stepper matching PivotBatchWeekPicker: ghost ‹ ›, labeled trigger, portaled list.
 */
function PivotAnalyticsMonthPicker({
  month,
  onChange,
  disabled = false,
  keyboardNavActive = null,
  pending = false,
  pastMonths = DEFAULT_PAST,
  futureMonths = DEFAULT_FUTURE,
  label = 'Month',
  showLabel = true,
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const listRef = useRef(null);
  const valid = isValidUtcMonth(month);

  const options = useMemo(
    () => buildMonthOptions(month, { past: pastMonths, future: futureMonths }),
    [month, pastMonths, futureMonths],
  );

  const close = useCallback(() => setOpen(false), []);

  const updateMenuPosition = useCallback(() => {
    setMenuPos(measureMenuPosition(triggerRef.current));
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return undefined;
    }
    updateMenuPosition();
    const onReposition = () => updateMenuPosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      const target = event.target;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const selected = listRef.current.querySelector('[aria-selected="true"]');
    if (selected?.scrollIntoView) {
      selected.scrollIntoView({ block: 'center' });
    }
  }, [open, month]);

  const step = useCallback(
    (delta) => {
      if (disabled) return;
      onChange((current) => shiftUtcMonth(current, delta));
    },
    [disabled, onChange],
  );

  const selectMonth = useCallback(
    (next) => {
      onChange(next);
      close();
    },
    [onChange, close],
  );

  const rangeHint = valid ? formatUtcMonthRange(month) : '—';
  const longLabel = valid ? formatUtcMonthLabel(month) : '—';

  const menu =
    open && menuPos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="pivot-batch-week-picker__menu pivot-batch-week-picker__menu--portal"
            role="listbox"
            aria-label="Choose month"
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
            }}
          >
            <div className="pivot-batch-week-picker__menu-scroll" ref={listRef}>
              {options.map((opt) => {
                const selected = opt.month === month;
                const badge = opt.delta === 0 ? 'Selected' : null;
                return (
                  <button
                    key={opt.month}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`pivot-batch-week-picker__option${
                      selected ? ' is-selected' : ''
                    }`}
                    onClick={() => selectMonth(opt.month)}
                  >
                    <span className="pivot-batch-week-picker__option-week">{opt.month}</span>
                    <span className="pivot-batch-week-picker__option-range">
                      {opt.rangeLabel}
                    </span>
                    {badge ? (
                      <span className="pivot-batch-week-picker__option-badge">{badge}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className={`pivot-batch-week-picker${pending ? ' is-pending' : ''}${
        open ? ' is-open' : ''
      }`}
      ref={rootRef}
    >
      {showLabel ? (
        <span className="linear-field__label pivot-batch-week-picker__label">{label}</span>
      ) : null}
      <div className="pivot-lab__week-stepper pivot-batch-week-picker__stepper">
        <button
          type="button"
          className={`linear-btn linear-btn--ghost pivot-lab__week-step pivot-tenant-kbd-btn${
            keyboardNavActive === 'left' ? ' is-key-active' : ''
          }`}
          onClick={() => step(-1)}
          disabled={disabled || !valid}
          aria-label="Previous month"
        >
          ‹
          <KeybindTooltip label="Previous month" keybind="←" />
        </button>

        <button
          ref={triggerRef}
          type="button"
          className={`pivot-batch-week-picker__trigger${open ? ' is-open' : ''}`}
          onClick={() => {
            if (!disabled) setOpen((v) => !v);
          }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Month ${month || ''}. ${longLabel}`}
          title={rangeHint}
        >
          <span className="pivot-batch-week-picker__week">{month || '—'}</span>
          <span className="pivot-batch-week-picker__range">{rangeHint}</span>
        </button>

        <button
          type="button"
          className={`linear-btn linear-btn--ghost pivot-lab__week-step pivot-tenant-kbd-btn${
            keyboardNavActive === 'right' ? ' is-key-active' : ''
          }`}
          onClick={() => step(1)}
          disabled={disabled || !valid}
          aria-label="Next month"
        >
          ›
          <KeybindTooltip label="Next month" keybind="→" />
        </button>
      </div>

      {menu}
    </div>
  );
}

export default PivotAnalyticsMonthPicker;
