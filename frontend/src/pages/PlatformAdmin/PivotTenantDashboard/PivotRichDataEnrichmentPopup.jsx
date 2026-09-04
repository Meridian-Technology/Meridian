import React from 'react';
import Popup from '../../../components/Popup/Popup';
import PivotImportThumb from '../PivotLab/PivotImportThumb';
import './PivotRichDataEnrichmentPopup.scss';

function missingFields(event) {
  if (Array.isArray(event?.missingRichData)) return event.missingRichData;
  return [
    !event?.description?.trim() ? 'description' : null,
    !event?.image ? 'image' : null,
  ].filter(Boolean);
}

function resultTone(status) {
  if (status === 'enriched') return 'ok';
  if (status === 'incomplete' || status === 'failed') return 'warn';
  return 'muted';
}

function PivotRichDataEnrichmentPopup({
  open,
  events,
  running,
  result,
  onRun,
  onClose,
}) {
  const resultsById = new Map(
    (result?.results || []).map((row) => [String(row.eventId), row]),
  );

  return (
    <Popup
      isOpen={open}
      onClose={onClose}
      customClassName="pivot-rich-enrich-popup"
      disableOutsideClick={running}
    >
      <section className="pivot-rich-enrich" aria-labelledby="pivot-rich-enrich-title">
        <header className="pivot-rich-enrich__head">
          <div>
            <p className="pivot-rich-enrich__eyebrow">Manual curation job</p>
            <h2 id="pivot-rich-enrich-title">Enrich event details</h2>
            <p>
              Visit the selected source pages and fill only missing descriptions or images.
              This never runs as part of Discover or Refresh.
            </p>
          </div>
          <span className="pivot-rich-enrich__count">{events.length} selected</span>
        </header>

        <div className="pivot-rich-enrich__list">
          {events.map((event) => {
            const fields = missingFields(event);
            const outcome = resultsById.get(String(event._id));
            const sourceHref = event.externalLink || event.sourceUrl;
            return (
              <article className="pivot-rich-enrich__row" key={event._id}>
                <PivotImportThumb src={event.image} alt={event.name} />
                <div className="pivot-rich-enrich__row-copy">
                  <strong>{event.name || 'Untitled'}</strong>
                  <span>{event.organizerName || 'No host'}</span>
                  <div className="pivot-rich-enrich__missing">
                    {fields.map((field) => (
                      <span key={field}>Missing {field}</span>
                    ))}
                  </div>
                  {outcome ? (
                    <p className={`pivot-rich-enrich__result is-${resultTone(outcome.status)}`}>
                      {outcome.message}
                    </p>
                  ) : null}
                </div>
                {sourceHref ? (
                  <a href={sourceHref} target="_blank" rel="noreferrer">
                    Source ↗
                  </a>
                ) : null}
              </article>
            );
          })}
        </div>

        {result?.totals ? (
          <p className="pivot-rich-enrich__summary" role="status">
            {result.totals.enriched} completed · {result.totals.incomplete} still incomplete
            {result.totals.failed ? ` · ${result.totals.failed} failed` : ''}
          </p>
        ) : null}

        <footer className="pivot-rich-enrich__actions">
          <button
            type="button"
            className="linear-btn linear-btn--ghost"
            onClick={onClose}
            disabled={running}
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            className="linear-btn linear-btn--primary"
            onClick={onRun}
            disabled={running || !events.length}
          >
            {running ? 'Enriching…' : result ? 'Run again' : `Enrich ${events.length}`}
          </button>
        </footer>
      </section>
    </Popup>
  );
}

export default PivotRichDataEnrichmentPopup;
export { missingFields };
