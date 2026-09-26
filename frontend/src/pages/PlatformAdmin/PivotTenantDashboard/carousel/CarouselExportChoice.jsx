import React, { useEffect, useState } from 'react';
import { authenticatedRequest } from '../../../../hooks/useFetch';

/**
 * A bare count still means "the first N slides", which is what copied commands
 * already do. A range or a comma list is an explicit selection, so slide 2 of
 * a longer deck is `2-2` rather than `2`.
 */
export function formatSlideSpec(slideNumbers, slideCount) {
  if (!Array.isArray(slideNumbers) || !slideNumbers.length) return String(slideCount ?? '');
  const sorted = [...new Set(slideNumbers.map(Number))].filter(Number.isInteger).sort((left, right) => left - right);
  if (!sorted.length) return String(slideCount ?? '');
  const prefix = sorted.every((number, index) => number === index + 1);
  if (prefix) return String(sorted.length);
  const contiguous = sorted.every((number, index) => index === 0 || number === sorted[index - 1] + 1);
  if (sorted.length === 1 || contiguous) return `${sorted[0]}-${sorted[sorted.length - 1]}`;
  return sorted.join(',');
}

export function localExportCommand({ deckId, token, slideCount, slideNumbers, baseUrl }) {
  const spec = formatSlideSpec(slideNumbers, slideCount);
  return `node scripts/export-carousel.js ${deckId} '${token}' ${spec} '${baseUrl}'`;
}

function initialSelection(slides, currentNumber) {
  if (!slides.length) return [];
  const current = slides.some((slide) => slide.number === currentNumber) ? currentNumber : slides[0].number;
  return [current];
}

export default function CarouselExportChoice({
  onRelay,
  onClose,
  tenantKey,
  deckId,
  slides = [],
  currentNumber = 1,
}) {
  const choosing = slides.length > 0;
  const identity = slides.map((slide) => slide.number).join(',');
  const [picked, setPicked] = useState(() => new Set(initialSelection(slides, currentNumber)));
  const [command, setCommand] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPicked(new Set(initialSelection(slides, currentNumber)));
    setCommand('');
  }, [identity, currentNumber]); // eslint-disable-line react-hooks/exhaustive-deps -- identity is the slide list

  const selected = [...picked].sort((left, right) => left - right);
  const ready = !choosing || selected.length > 0;

  const toggle = (number) => {
    setCommand('');
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  };

  const commandLine = async () => {
    if (!ready) return;
    setBusy(true);
    setNotice('');
    setCommand('');
    const result = await authenticatedRequest(
      `/admin/pivot/tenants/${encodeURIComponent(tenantKey)}/carousels/${encodeURIComponent(deckId)}/export-token`,
      { method: 'POST' },
    );
    setBusy(false);
    const data = result.data?.data;
    if (!result.data?.success || !data?.token) {
      setNotice(result.data?.message || result.error || 'Could not prepare the command.');
      return;
    }
    setCommand(localExportCommand({
      deckId: data.deckId,
      token: data.token,
      slideCount: data.slideCount,
      slideNumbers: choosing ? selected : null,
      baseUrl: window.location.origin,
    }));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setNotice('Copied. Run it from the Meridian directory within ten minutes.');
    } catch (_) {
      setNotice('Select the command and copy it. Run it from the Meridian directory within ten minutes.');
    }
  };

  return (
    <div className="jgz-export-choice">
      <h2>Export</h2>
      <p>Relay queues a worker job. The command line renders this saved revision in Chrome on this machine. Later edits do not change either export.</p>
      {choosing ? (
        <>
          <p>{selected.length === 1 ? 'One slide downloads as a PNG.' : selected.length ? `${selected.length} slides come as a ZIP.` : 'Choose at least one slide.'}</p>
          <div className="jgz-export-choice__shortcuts">
            <button type="button" onClick={() => { setCommand(''); setPicked(new Set(initialSelection(slides, currentNumber))); }}>This slide</button>
            <button type="button" onClick={() => { setCommand(''); setPicked(new Set(slides.map((slide) => slide.number))); }}>All slides</button>
          </div>
          <ul className="jgz-export-choice__list">
            {slides.map((slide) => {
              const id = `jgz-export-choice-slide-${slide.number}`;
              return (
                <li key={slide.number}>
                  <label htmlFor={id}>
                    <input
                      id={id}
                      type="checkbox"
                      checked={picked.has(slide.number)}
                      onChange={() => toggle(slide.number)}
                    />
                    <span><b>{String(slide.number).padStart(2, '0')}</b> {slide.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <div className="jgz-export-choice__actions">
        <button type="button" className="jgz-export-choice__go" onClick={() => onRelay?.(choosing ? selected : undefined)} disabled={!ready}>Relay</button>
        <button type="button" onClick={commandLine} disabled={busy || !ready || !tenantKey || !deckId}>
          {busy ? 'Preparing…' : 'Command line'}
        </button>
      </div>
      {command ? (
        <>
          <p>Run this from the Meridian directory. The token lasts ten minutes.</p>
          <textarea aria-label="Export command" readOnly rows={4} value={command} />
          <button type="button" onClick={copy}>Copy</button>
        </>
      ) : null}
      {notice ? <p role="alert">{notice}</p> : null}
      <button type="button" onClick={onClose}>Close</button>
    </div>
  );
}
