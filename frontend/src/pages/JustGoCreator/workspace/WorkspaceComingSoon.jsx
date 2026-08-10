import React from 'react';
import PivotScrapbookTitle from '../../../components/PivotBranding/PivotScrapbookTitle';

/**
 * Flare-register placeholder, the Just Go answer to the original dashboard's `ComingSoon`.
 *
 * Used where Phase 1 genuinely has nothing to show rather than something half-built: the
 * Communications tab (no pivot-safe sender exists) and the Insights tab until Task 4.4 fills it.
 */
function WorkspaceComingSoon({ title, body }) {
  return (
    <section className="jg-coming-soon">
      <PivotScrapbookTitle title={title} as="h2" />
      <p className="jg-coming-soon__body">{body}</p>
    </section>
  );
}

export default WorkspaceComingSoon;
