import React, { useCallback, useState } from 'react';
import { Icon } from '@iconify-icon/react';
import { useFetch, authenticatedRequest } from '../../../../hooks/useFetch';
import { useNotification } from '../../../../NotificationContext';
import '../PivotReferralCodesPanel/PivotReferralCodesPanel.scss';
import './PivotTagCatalogPanel.scss';

function PivotTagCatalogPanel() {
  const { addNotification } = useNotification();
  const [seeding, setSeeding] = useState(false);
  const {
    data: tagsResponse,
    loading,
    error,
    refetch,
  } = useFetch('/admin/pivot/tags', {
    cache: { enabled: false },
  });

  const tags = tagsResponse?.success ? (tagsResponse.data?.tags ?? []) : [];

  const handleSeed = useCallback(async () => {
    setSeeding(true);
    const { data: res, error: reqError } = await authenticatedRequest('/admin/pivot/tags/seed', {
      method: 'POST',
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });
    setSeeding(false);

    if (reqError || !res?.success) {
      addNotification({
        title: 'Seed failed',
        message: res?.message || reqError || 'Unable to seed tag catalog',
        type: 'error',
      });
      return;
    }

    const { upserted, activeCount, legacyNotInSeed } = res.data || {};
    addNotification({
      title: 'Tag catalog seeded',
      message: `Upserted ${upserted} tags (${activeCount} active${
        legacyNotInSeed ? `, ${legacyNotInSeed} legacy slug(s) not in seed` : ''
      }).`,
      type: 'success',
    });
    refetch();
  }, [addNotification, refetch]);

  return (
    <section className="linear-section pivot-referral pivot-tag-catalog" aria-labelledby="pivot-tag-catalog-title">
      <div className="pivot-referral__head">
        <div>
          <h3 id="pivot-tag-catalog-title" className="linear-section__title">Pivot tag catalog</h3>
          <p className="pivot-referral__hint">
            Global taxonomy shared by all Pivot cities — Lab ingest, mobile interests, and feed ranker.
            {loading ? ' Loading…' : ` ${tags.length} active tag${tags.length === 1 ? '' : 's'} loaded.`}
          </p>
        </div>
        <button
          type="button"
          className="linear-btn linear-btn--secondary linear-btn--sm"
          onClick={handleSeed}
          disabled={seeding || loading}
        >
          <Icon icon="mdi:tag-multiple-outline" />
          {seeding ? 'Seeding…' : tags.length ? 'Refresh from seed' : 'Seed tag catalog'}
        </button>
      </div>

      {error ? <p className="pivot-referral__error">{error}</p> : null}

      {!loading && !tags.length ? (
        <p className="pivot-tag-catalog__empty">
          No tags in the catalog yet. Seed once before publishing events or assigning interests in Lab.
        </p>
      ) : null}

      {tags.length ? (
        <ul className="pivot-tag-catalog__list">
          {tags.map((tag) => (
            <li key={tag.slug} className="pivot-tag-catalog__chip">
              <span className="pivot-tag-catalog__label">{tag.label}</span>
              <code className="linear-code linear-code--inline">{tag.slug}</code>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default PivotTagCatalogPanel;
