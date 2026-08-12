import React, { useCallback, useEffect, useRef, useState } from 'react';
import './pivotOpsTokens.scss';
import './PivotOpsPage.scss';
import './pivotOpsLabBridge.scss';

const COLLAPSE_SCROLL_PX = 28;

/**
 * Quiet ops page shell — sticky header, plain title, scrollable body.
 */
function PivotOpsPage({
  title,
  subtitle,
  actions,
  className = '',
  children,
}) {
  const pageRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);

  const syncCollapsed = useCallback(() => {
    const el = pageRef.current;
    if (!el) return;
    const next = el.scrollTop > COLLAPSE_SCROLL_PX;
    if (next === collapsedRef.current) return;
    collapsedRef.current = next;
    setCollapsed(next);
  }, []);

  useEffect(() => {
    const el = pageRef.current;
    if (!el) return undefined;

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        syncCollapsed();
      });
    };

    syncCollapsed();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [syncCollapsed]);

  return (
    <div
      ref={pageRef}
      className={`pivot-ops pivot-ops-page${collapsed ? ' is-collapsed' : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      <header className="pivot-ops-page__header">
        <div className="pivot-ops-page__header-inner">
          <div className="pivot-ops-page__heading">
            <h1 className="pivot-ops-page__title">{title}</h1>
            {subtitle ? (
              <p className="pivot-ops-page__subtitle">{subtitle}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="pivot-ops-page__actions">{actions}</div>
          ) : null}
        </div>
      </header>
      <div className="pivot-ops-page__body">{children}</div>
    </div>
  );
}

export default PivotOpsPage;
