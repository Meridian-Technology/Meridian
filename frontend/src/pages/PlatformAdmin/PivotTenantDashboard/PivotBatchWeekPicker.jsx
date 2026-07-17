import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  isValidIsoWeek,
  shiftIsoWeek,
  formatBatchWeekRange,
  toIsoWeek,
} from '../../../utils/pivotIsoWeek';
import KeybindTooltip from '../../../components/Interface/KeybindTooltip/KeybindTooltip';
import './PivotBatchWeekPicker.scss';

const DEFAULT_PAST = 8;
const DEFAULT_FUTURE = 8;
const MENU_GAP = 6;
const MENU_MIN_WIDTH = 280;
const VIEWPORT_PAD = 8;

function buildWeekOptions(
  centerWeek,
  { past = DEFAULT_PAST, future = DEFAULT_FUTURE, extraWeeks = [], dropDayOfWeek = 4, timeZone = 'UTC' } = {},
) {
  const center = isValidIsoWeek(centerWeek) ? centerWeek : toIsoWeek();
  const byWeek = new Map();
  for (let delta = -past; delta <= future; delta += 1) {
    const week = shiftIsoWeek(center, delta);
    if (!week) continue;
    byWeek.set(week, {
      week,
      rangeLabel: formatBatchWeekRange(week, { dropDayOfWeek, timeZone }),
      delta,
    });
  }
  for (const week of extraWeeks) {
    if (!isValidIsoWeek(week) || byWeek.has(week)) continue;
    byWeek.set(week, {
      week,
      rangeLabel: formatBatchWeekRange(week, { dropDayOfWeek, timeZone }),
      delta: week < center ? -past - 1 : future + 1,
    });
  }
  return Array.from(byWeek.values()).sort((a, b) => a.week.localeCompare(b.week));
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
 * Batch week stepper with keyboard tooltips + click-to-open week menu.
 * Menu is portaled to document.body so page stacking/overflow cannot cover it.
 */
function PivotBatchWeekPicker({
  batchWeek,
  onChange,
  disabled = false,
  keyboardNavActive = null,
  anchors = null,
  dropDayOfWeek = 4,
  timeZone = 'UTC',
  pastWeeks = DEFAULT_PAST,
  futureWeeks = DEFAULT_FUTURE,
  label = 'Batch week',
  showLabel = true,
  pending = false,
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const listRef = useRef(null);
  const valid = isValidIsoWeek(batchWeek);

  const options = useMemo(
    () =>
      buildWeekOptions(batchWeek, {
        past: pastWeeks,
        future: futureWeeks,
        extraWeeks: [anchors?.liveWeek, anchors?.curateWeek].filter(Boolean),
        dropDayOfWeek,
        timeZone,
      }),
    [batchWeek, pastWeeks, futureWeeks, anchors?.liveWeek, anchors?.curateWeek, dropDayOfWeek, timeZone],
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
    // Capture scroll from nested overflow containers too.
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
  }, [open, batchWeek]);

  const step = useCallback(
    (delta) => {
      if (disabled) return;
      onChange((current) => {
        const next = shiftIsoWeek(current, delta);
        return next || current;
      });
    },
    [disabled, onChange],
  );

  const selectWeek = useCallback(
    (week) => {
      onChange(week, { immediate: true });
      close();
    },
    [onChange, close],
  );

  const rangeHint = valid
    ? formatBatchWeekRange(batchWeek, { dropDayOfWeek, timeZone })
    : '—';

  const menu =
    open && menuPos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="pivot-batch-week-picker__menu pivot-batch-week-picker__menu--portal"
            role="listbox"
            aria-label="Choose batch week"
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
            }}
          >
            <div className="pivot-batch-week-picker__menu-scroll" ref={listRef}>
              {options.map((opt) => {
                const selected = opt.week === batchWeek;
                const isLive = anchors?.liveWeek === opt.week;
                const isReleaseWindow =
                  Boolean(anchors?.dropPending) && anchors?.curateWeek === opt.week;
                const isNext =
                  !anchors?.dropPending &&
                  anchors?.curateWeek === opt.week &&
                  anchors?.curateWeek !== anchors?.liveWeek;
                let badge = null;
                if (isLive) badge = 'Live';
                else if (isReleaseWindow) badge = 'Release';
                else if (isNext) badge = 'Next drop';
                else if (opt.delta === 0) badge = 'Selected';

                return (
                  <button
                    key={opt.week}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`pivot-batch-week-picker__option${
                      selected ? ' is-selected' : ''
                    }${isLive ? ' is-live' : ''}`}
                    onClick={() => selectWeek(opt.week)}
                  >
                    <span className="pivot-batch-week-picker__option-week">{opt.week}</span>
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
          aria-label="Previous week"
        >
          ‹
          <KeybindTooltip label="Previous week" keybind="←" />
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
          aria-label={`Batch week ${batchWeek || ''}. ${rangeHint}`}
          title={rangeHint}
        >
          <span className="pivot-batch-week-picker__week">{batchWeek || '—'}</span>
          <span className="pivot-batch-week-picker__range">{rangeHint}</span>
        </button>

        <button
          type="button"
          className={`linear-btn linear-btn--ghost pivot-lab__week-step pivot-tenant-kbd-btn${
            keyboardNavActive === 'right' ? ' is-key-active' : ''
          }`}
          onClick={() => step(1)}
          disabled={disabled || !valid}
          aria-label="Next week"
        >
          ›
          <KeybindTooltip label="Next week" keybind="→" />
        </button>
      </div>

      {menu}
    </div>
  );
}

export default PivotBatchWeekPicker;
