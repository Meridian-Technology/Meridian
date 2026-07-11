import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PivotDashBurst from './PivotDashBurst';
import PivotScrapbookTitle from './PivotScrapbookTitle';
import './PivotTenantPage.scss';
import './PivotScrapbookTitle.scss';

const COLLAPSE_SCROLL_PX = 28;

function buildTenantLabel(cityDisplayName, tenantKey) {
  const city = String(cityDisplayName || '').trim();
  const key = String(tenantKey || '').trim();
  if (city && key && city.toLowerCase() !== key.toLowerCase()) {
    return `${city} · ${key}`;
  }
  return city || key;
}

/**
 * Shared Just Go ops page shell — corner burst, sticky collapsing header, scrapbook titles.
 * Pass page body as children.
 */
function PivotTenantPage({
  title,
  tenantKey,
  cityDisplayName,
  subtitle,
  actions,
  className = '',
  children,
}) {
  const pageRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);

  const tenantLabel = useMemo(
    () => buildTenantLabel(cityDisplayName, tenantKey),
    [cityDisplayName, tenantKey],
  );
  const showTenantScrapbook = subtitle === undefined && Boolean(tenantLabel);

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
      className={`pivot-tenant-page pivot-lab linear-admin general dash${
        collapsed ? ' is-collapsed' : ''
      } ${className}`.trim()}
    >
      {/* Page-level burst — unbounded until scroll; sits behind header/body. */}
      <PivotDashBurst />
      <header className="pivot-tenant-page__header">
        <div className="pivot-tenant-page__header-inner">
          <div className="pivot-tenant-page__heading">
            <div className="pivot-tenant-page__titles">
              <PivotScrapbookTitle title={title} />
              {showTenantScrapbook ? (
                <PivotScrapbookTitle
                  title={tenantLabel}
                  size="sm"
                  showBurst={false}
                  splitWords={false}
                  as="p"
                />
              ) : null}
            </div>
            {subtitle !== undefined && subtitle ? (
              <p className="pivot-tenant-page__subtitle">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="pivot-lab__controls">{actions}</div> : null}
        </div>
      </header>
      <div className="pivot-tenant-page__body">{children}</div>
    </div>
  );
}

export default PivotTenantPage;
