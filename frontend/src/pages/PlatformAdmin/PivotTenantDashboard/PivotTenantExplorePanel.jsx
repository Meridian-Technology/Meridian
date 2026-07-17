import React from 'react';
import { Icon } from '@iconify-icon/react';
import { useDashboard } from '../../../contexts/DashboardContext';
import PivotBatchExplorePreview from './PivotBatchExplorePreview';
import './PivotTenantExplorePanel.scss';

/**
 * Full dashboard overlay — mobile Explore preview for the selected batch week.
 */
function PivotTenantExplorePanel({
  tenantKey,
  batchWeek,
  cityDisplayName,
  weekRangeLabel,
}) {
  const { hideOverlay } = useDashboard();

  return (
    <div className="pivot-tenant-explore-panel">
      <header className="pivot-tenant-explore-panel__header">
        <button
          type="button"
          className="pivot-tenant-explore-panel__back linear-btn linear-btn--ghost"
          onClick={hideOverlay}
        >
          <Icon icon="mdi:arrow-left" aria-hidden="true" />
          Back to curation
        </button>
        <div className="pivot-tenant-explore-panel__titles">
          <h1 className="pivot-tenant-explore-panel__title">Explore preview</h1>
          <p className="pivot-tenant-explore-panel__subtitle">
            {batchWeek}
            {weekRangeLabel ? ` · ${weekRangeLabel}` : ''}
            {cityDisplayName ? ` · ${cityDisplayName}` : ''}
          </p>
        </div>
      </header>
      <div className="pivot-tenant-explore-panel__body">
        <PivotBatchExplorePreview
          tenantKey={tenantKey}
          batchWeek={batchWeek}
          cityDisplayName={cityDisplayName}
          weekRangeLabel={weekRangeLabel}
          layout="panel"
        />
      </div>
    </div>
  );
}

export default PivotTenantExplorePanel;
