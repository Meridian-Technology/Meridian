/**
 * The carousel editor.
 *
 * Slides on the left, the selected one at working size on the right, and every
 * control derived from the manifest the server sent with the deck. Nothing here
 * names a slide type: the add menu, the slot caps, the event slot counts and
 * the completeness check all read the manifest, which is what makes a new
 * template an entry in that file plus a component in zineFrames.jsx.
 *
 * Text is edited on the slide itself rather than in a side panel, so what you
 * type is laid out in the geometry it will print in.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ZineEditProvider, writePath } from './zineField';
import { frameClass, resolveSlide, slideGaps } from './zineDeck';
import PivotCarouselVoicePanel from './PivotCarouselVoicePanel';
import PivotCarouselEventPicker from './PivotCarouselEventPicker';
import PivotCarouselAddSlide from './PivotCarouselAddSlide';
import PivotCarouselExportPanel from './PivotCarouselExportPanel';
import PivotCarouselExportPicker from './PivotCarouselExportPicker';
import PivotCarouselPopup from './PivotCarouselPopup';
import CarouselExportChoice from './CarouselExportChoice';

/** Fixed types cannot be added, removed or moved — they open and close the deck. */
function isFixed(manifest, type) {
  return Boolean(manifest?.types?.[type]?.fixed);
}

function typeLabel(manifest, type) {
  return manifest?.types?.[type]?.label || type;
}

function EventSlotRow({
  entry,
  slotIndex,
  slotMin,
  slotCount,
  acceptsUpload,
  slideId,
  onSlotImage,
  onPick,
  onClear,
  onDrop,
}) {
  return (
    <li className="jgz-editor__slot">
      <span className="jgz-editor__slotname">
        {entry.snapshot?.name || <em>empty slot</em>}
      </span>
      <span className="jgz-editor__slotops">
        <button type="button" onClick={() => onPick(slotIndex)}>
          {entry.snapshot?.name ? 'replace' : 'pick'}
        </button>
        {acceptsUpload && entry.snapshot ? (
          <label className="jgz-editor__upload">
            {entry.imageOverride?.url ? 'photo ✓' : 'photo'}
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) onSlotImage(slideId, slotIndex, file);
              }}
            />
          </label>
        ) : null}
        {entry.snapshot?.name ? (
          <button type="button" onClick={() => onClear(slotIndex)}>clear</button>
        ) : null}
        {slotCount > slotMin ? (
          <button
            type="button"
            className="jgz-editor__danger"
            onClick={() => onDrop(slotIndex)}
          >
            −
          </button>
        ) : null}
      </span>
    </li>
  );
}

function SlideThumb({ deck, slide, index, manifest, cityVoice, frames, selected, onSelect }) {
  const resolved = useMemo(
    () => resolveSlide(deck, slide, index, manifest, cityVoice),
    [deck, slide, index, manifest, cityVoice],
  );
  const Frame = frames[slide.type];
  const gaps = slideGaps(slide, manifest);

  return (
    <li className="jgz-strip__item">
      <button
        type="button"
        className={`jgz-strip__button${selected ? ' is-selected' : ''}`}
        aria-current={selected}
        onClick={() => onSelect(index)}
      >
        <span className={frameClass(deck)} aria-hidden="true">
          {Frame ? <Frame {...resolved.props} /> : null}
        </span>
        <span className="jgz-strip__caption">
          <b>{String(index + 1).padStart(2, '0')}</b>
          <span>{typeLabel(manifest, slide.type)}</span>
          {gaps.length ? <em className="jgz-strip__gap">{gaps.length}</em> : null}
        </span>
      </button>
    </li>
  );
}

export default function PivotCarouselEditor({
  deck,
  manifest,
  cityVoice,
  frames,
  dirty,
  saving,
  tenantKey,
  cityDisplayName,
  onDeckChange,
  onSave,
  onSlotImage,
  onVoiceSaved,
  exportState,
  tools = null,
  focused = false,
  onToggleFocus,
  onBack,
}) {
  const [selected, setSelected] = useState(0);
  const [adding, setAdding] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  /*
   * Off by default. The editing affordance tints every slot, so a slide under
   * it is not the slide — and the first thing this screen should show is the
   * truth about what will print.
   */
  const [editing, setEditing] = useState(false);
  const [pickingSlot, setPickingSlot] = useState(null);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [exportPicking, setExportPicking] = useState(false);
  const [exportChoice, setExportChoice] = useState(false);
  const lastStageTap = useRef(0);

  const toggleEditingFromSlide = useCallback((event) => {
    // A field, or the chrome that edits one, keeps its own click — double-
    // clicking a slot selects a word rather than leaving edit.
    if (event.target.closest('button, input, select, textarea, label, a, [contenteditable="true"], .jgz-editable, .jgz-editor__dock')) {
      lastStageTap.current = 0;
      return;
    }
    const now = Date.now();
    if (now - lastStageTap.current < 400) {
      lastStageTap.current = 0;
      setEditing((on) => !on);
      return;
    }
    lastStageTap.current = now;
  }, []);

  useEffect(() => {
    if (!focused && !eventsOpen && !exportPicking && !exportChoice) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (exportChoice) {
        setExportChoice(false);
        return;
      }
      if (exportPicking) {
        setExportPicking(false);
        return;
      }
      if (eventsOpen) {
        setEventsOpen(false);
        return;
      }
      if (focused && onToggleFocus) onToggleFocus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [focused, eventsOpen, exportPicking, exportChoice, onToggleFocus]);

  const index = Math.min(selected, Math.max(deck.slides.length - 1, 0));
  const slide = deck.slides[index];

  useEffect(() => {
    lastStageTap.current = 0;
  }, [index]);

  /**
   * A slot write lands on the deck, not on a copy of it. Paths under `issue.`
   * belong to the whole issue rather than to this slide, which is why the read
   * surface below merges the two and this routes them back apart.
   */
  const handleFieldChange = useCallback(
    (path, value) => {
      onDeckChange((current) => {
        if (path.startsWith('issue.')) {
          return writePath(current, path, value);
        }
        const slides = [...current.slides];
        slides[index] = writePath(slides[index], path, value);
        return { ...current, slides };
      });
    },
    [onDeckChange, index],
  );

  const move = useCallback(
    (from, to) => {
      onDeckChange((current) => {
        const slides = [...current.slides];
        if (to < 1 || to > slides.length - 2) return current;
        const [moved] = slides.splice(from, 1);
        slides.splice(to, 0, moved);
        return { ...current, slides };
      });
      setSelected(to);
    },
    [onDeckChange],
  );

  const removeSlide = useCallback(
    (at) => {
      onDeckChange((current) => ({
        ...current,
        slides: current.slides.filter((_, i) => i !== at),
      }));
      setSelected((prev) => Math.max(0, prev - (at <= prev ? 1 : 0)));
    },
    [onDeckChange],
  );

  const addSlide = useCallback(
    (type) => {
      setAdding(false);
      const spec = manifest.types[type];
      const events = spec.events === 'derived'
        ? []
        : Array.from({ length: spec.events.exactly ?? spec.events.min ?? 0 }, () => ({
          eventId: null, label: null, snapshot: null, imageOverride: null, values: {},
        }));
      const options = {};
      for (const option of spec.options || []) {
        if (option.default !== undefined) options[option.key] = option.default;
      }

      onDeckChange((current) => {
        const slides = [...current.slides];
        // New slides land after the selection, never outside the fixed pair.
        const at = Math.min(Math.max(index + 1, 1), slides.length - 1);
        slides.splice(at, 0, { type, values: {}, options, events });
        setSelected(at);
        return { ...current, slides };
      });
    },
    [manifest, onDeckChange, index],
  );

  /** Per-slide options, whatever the manifest declares for this type. */
  const setOption = useCallback(
    (key, value) => {
      onDeckChange((current) => {
        const slides = [...current.slides];
        slides[index] = {
          ...slides[index],
          options: { ...(slides[index].options || {}), [key]: value },
        };
        return { ...current, slides };
      });
    },
    [onDeckChange, index],
  );

  /** Drop a picked event into a slot, keeping the slots either side intact. */
  const fillSlot = useCallback(
    (slotIndex, entry) => {
      onDeckChange((current) => {
        const slides = [...current.slides];
        const events = [...(slides[index].events || [])];
        events[slotIndex] = entry;
        slides[index] = { ...slides[index], events };
        return { ...current, slides };
      });
    },
    [onDeckChange, index],
  );

  const clearSlot = useCallback(
    (slotIndex) => {
      fillSlot(slotIndex, {
        eventId: null, label: null, snapshot: null, imageOverride: null, values: {},
      });
    },
    [fillSlot],
  );

  /** Only where the type allows more than its minimum — the wall's fourth. */
  const addSlot = useCallback(() => {
    onDeckChange((current) => {
      const slides = [...current.slides];
      const events = [...(slides[index].events || []), {
        eventId: null, label: null, snapshot: null, imageOverride: null, values: {},
      }];
      slides[index] = { ...slides[index], events };
      return { ...current, slides };
    });
  }, [onDeckChange, index]);

  const dropSlot = useCallback(
    (slotIndex) => {
      onDeckChange((current) => {
        const slides = [...current.slides];
        const events = (slides[index].events || []).filter((_, i) => i !== slotIndex);
        slides[index] = { ...slides[index], events };
        return { ...current, slides };
      });
    },
    [onDeckChange, index],
  );

  const editContext = useMemo(
    () => ({
      editing,
      slide: { ...slide, issue: deck.issue },
      onChange: handleFieldChange,
    }),
    [editing, slide, deck.issue, handleFieldChange],
  );

  if (!slide) return null;

  const Frame = frames[slide.type];
  const gaps = slideGaps(slide, manifest);
  const fixed = isFixed(manifest, slide.type);
  const spec = manifest.types[slide.type];

  // The manifest decides how many slots this type takes and whether the count
  // can vary, so the slot rail never has to know which template it is showing.
  const derived = spec.events === 'derived';
  const slotMin = derived ? 0 : (spec.events.exactly ?? spec.events.min ?? 0);
  const slotMax = derived ? 0 : (spec.events.exactly ?? spec.events.max ?? 0);
  const slots = slide.events || [];
  const acceptsUpload = String(spec.photo || '').includes('upload');

  const requestExport = () => {
    if (dirty || exportState?.creating) return;
    setExportChoice(true);
  };

  const chooseRelay = (slideNumbers) => {
    setExportChoice(false);
    if (Array.isArray(slideNumbers) && slideNumbers.length) {
      exportState?.startExport(slideNumbers);
      return;
    }
    const count = deck.slides.length;
    if (count <= 1) {
      exportState?.startExport(count === 1 ? [1] : undefined);
      return;
    }
    setExportPicking(true);
  };

  const confirmExport = (slideNumbers) => {
    setExportPicking(false);
    exportState?.startExport(slideNumbers);
  };

  const exportButton = exportState?.uiEnabled !== false ? (
    <button
      type="button"
      className="jgz__action"
      onClick={requestExport}
      disabled={dirty || exportState?.creating}
      title={dirty ? 'Save first — the export renders what is stored' : undefined}
    >
      {exportState?.creating ? 'exporting…' : 'export'}
    </button>
  ) : null;

  const saveButton = (
    <button
      type="button"
      className="jgz__action"
      onClick={onSave}
      disabled={!dirty || saving}
    >
      {saving ? 'saving…' : 'save deck'}
    </button>
  );

  const voiceButton = (
    <button
      type="button"
      className="jgz__action"
      onClick={() => setVoiceOpen(true)}
    >
      static copy…
    </button>
  );

  return (
    <div className={`jgz-editor${focused ? ' is-focused' : ''}`}>
      <div className="jgz-editor__bar">
        <div className="jgz-editor__bar-main">
          {onBack ? (
            <button
              type="button"
              className="jgz__action"
              onClick={() => {
                if (!dirty || window.confirm('Leave this carousel and discard unsaved changes?')) onBack();
              }}
            >
              All carousels
            </button>
          ) : null}
          {onToggleFocus ? (
            <button
              type="button"
              className={`jgz__action jgz__action--fill${focused ? ' jgz__action--icon' : ''}`}
              aria-pressed={focused}
              aria-label={focused ? 'exit' : undefined}
              onClick={onToggleFocus}
            >
              {focused ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6 L18 18 M18 6 L6 18" />
                </svg>
              ) : (
                'full screen'
              )}
            </button>
          ) : null}
          <p className="jgz-editor__title">{deck.title}</p>
          {tools}
        </div>
        <div className="jgz-editor__bar-actions">
          <span className="jgz-editor__secondary">
            {voiceButton}
          </span>
          <span className={`jgz-flag${dirty ? '' : ' jgz-flag--saved'}`}>
            {dirty ? 'unsaved changes' : 'saved'}
          </span>
          {dirty || saving ? saveButton : exportButton}
        </div>
      </div>

      <div className="jgz-editor__body">
        <div className="jgz-editor__strip">
          <ul className="jgz-strip">
            {deck.slides.map((row, i) => (
              <SlideThumb
                key={row._id || `slide-${i}`}
                deck={deck}
                slide={row}
                index={i}
                manifest={manifest}
                cityVoice={cityVoice}
                frames={frames}
                selected={i === index}
                onSelect={setSelected}
              />
            ))}
          </ul>

          <div className="jgz-strip__add">
            <button type="button" onClick={() => setAdding(true)}>
              + add slide
            </button>
          </div>
        </div>

          <div className="jgz-editor__canvas">
            <div
              className={`jgz-editor__stage${editing ? ' is-editing' : ''}`}
              onClick={toggleEditingFromSlide}
              onDoubleClick={(event) => {
                if (!event.target.closest('button, input, select, textarea, label, a, [contenteditable="true"], .jgz-editable, .jgz-editor__dock')) {
                  event.preventDefault();
                }
              }}
              title={editing ? 'Double-click to finish editing' : 'Double-click to edit'}
            >
              <div className="jgz-editor__board">
                <div className="jgz-editor__viewbox">
                  <div className={frameClass(deck)}>
                    <ZineEditProvider value={editContext}>
                      {Frame
                        ? <Frame {...resolveSlide(deck, slide, index, manifest, cityVoice).props} />
                        : null}
                    </ZineEditProvider>
                  </div>
                </div>
              </div>
            </div>

                <div className={`jgz-editor__dock${eventsOpen ? ' is-open' : ''}`}>
                  <div className="jgz-editor__peek">
                    <div className="jgz-editor__peek-main">
                      <p className="jgz-editor__slidename">
                        {String(index + 1).padStart(2, '0')} · {typeLabel(manifest, slide.type)}
                        <span>{spec.blurb}</span>
                      </p>
                      {derived ? (
                        <p className="jgz-editor__derived">
                          counts the whole issue — no events of its own
                        </p>
                      ) : slots[0] ? (
                        <ul className="jgz-editor__peek-events">
                          <EventSlotRow
                            entry={slots[0]}
                            slotIndex={0}
                            slotMin={slotMin}
                            slotCount={slots.length}
                            acceptsUpload={acceptsUpload}
                            slideId={slide._id}
                            onSlotImage={onSlotImage}
                            onPick={setPickingSlot}
                            onClear={clearSlot}
                            onDrop={dropSlot}
                          />
                        </ul>
                      ) : slotMax > 0 ? (
                        <button type="button" className="jgz-editor__slotadd" onClick={addSlot}>
                          + add event
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="jgz-editor__lift"
                      aria-expanded={eventsOpen}
                      aria-label={eventsOpen ? 'hide events' : 'all events'}
                      onClick={() => setEventsOpen((open) => !open)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 14.5 L12 7.5 L19 14.5" />
                      </svg>
                    </button>
                  </div>

                  <div className="jgz-editor__dock-rest">
                    <div className="jgz-editor__dock-rest-inner">
                      <div className="jgz-editor__secondary jgz-editor__secondary--sheet">
                        {tools}
                        {voiceButton}
                        {exportButton}
                      </div>

                      {gaps.length ? (
                        <p className="jgz-editor__gaps">
                          still empty: {gaps.join(', ')}
                        </p>
                      ) : (
                        <p className="jgz-editor__gaps jgz-editor__gaps--ok">every slot filled</p>
                      )}

                      {(spec.options || []).length ? (
                        <div className="jgz-editor__options">
                          {spec.options.map((option) => {
                            const current = slide.options?.[option.key] ?? option.default;
                            const label = option.label || option.key;

                            if (option.kind === 'boolean') {
                              return (
                                <label key={option.key} className="jgz-editor__option">
                                  <input
                                    type="checkbox"
                                    checked={current !== false}
                                    onChange={(event) => setOption(option.key, event.target.checked)}
                                  />
                                  <span>{label}</span>
                                </label>
                              );
                            }

                            return (
                              <label key={option.key} className="jgz-editor__option">
                                <span>{label}</span>
                                <select
                                  value={String(current)}
                                  onChange={(event) => {
                                    const picked = option.values.find(
                                      (value) => String(value) === event.target.value,
                                    );
                                    setOption(option.key, picked);
                                  }}
                                >
                                  {option.values.map((value) => (
                                    <option key={String(value)} value={String(value)}>
                                      {String(value)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            );
                          })}
                        </div>
                      ) : null}

                      {derived || (slots.length <= 1 && slots.length >= slotMax) ? null : (
                        <div className="jgz-editor__slots">
                          <p className="jgz-editor__slotshead">
                            events
                            <span>
                              {slots.filter((e) => e.snapshot?.name).length} of {slotMax}
                            </span>
                          </p>

                          <ul>
                            {slots.slice(1).map((entry, offset) => (
                              <EventSlotRow
                                key={`slot-${offset + 1}`}
                                entry={entry}
                                slotIndex={offset + 1}
                                slotMin={slotMin}
                                slotCount={slots.length}
                                acceptsUpload={acceptsUpload}
                                slideId={slide._id}
                                onSlotImage={onSlotImage}
                                onPick={setPickingSlot}
                                onClear={clearSlot}
                                onDrop={dropSlot}
                              />
                            ))}
                          </ul>

                          {slots.length < slotMax ? (
                            <button type="button" className="jgz-editor__slotadd" onClick={addSlot}>
                              + add event slot
                            </button>
                          ) : null}
                        </div>
                      )}

                      <div className="jgz-editor__slideops">
                        <button type="button" onClick={() => move(index, index - 1)} disabled={fixed || index <= 1}>
                          move up
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, index + 1)}
                          disabled={fixed || index >= deck.slides.length - 2}
                        >
                          move down
                        </button>
                        <button
                          type="button"
                          className="jgz-editor__danger"
                          onClick={() => removeSlide(index)}
                          disabled={fixed}
                        >
                          remove
                        </button>
                      </div>

                      {fixed ? (
                        <p className="jgz-editor__fixed">
                          every carousel opens and closes the same way, so this one stays put
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
          </div>
        </div>

      <PivotCarouselExportPanel
        open={Boolean(exportState?.panelOpen)}
        onClose={exportState?.closePanel}
        onOpen={exportState?.openPanel}
        job={exportState?.job}
        uiState={exportState?.uiState}
        progressLabel={exportState?.progressLabel}
        failureLabel={exportState?.failureLabel}
        revisionStale={exportState?.revisionStale}
        artifactsExpired={exportState?.artifactsExpired}
        onCancel={exportState?.cancelExport}
        onRetry={exportState?.retryExport}
        onDownload={exportState?.downloadArtifact}
        busy={exportState?.busy}
        showStrip={!focused}
      />

      <PivotCarouselPopup open={exportChoice} onClose={() => setExportChoice(false)}>
        <CarouselExportChoice
          tenantKey={tenantKey}
          deckId={deck._id}
          slides={(deck.slides || []).map((item, slideNumber) => ({
            number: slideNumber + 1,
            label: manifest?.types?.[item.type]?.label || item.type || 'Slide',
          }))}
          currentNumber={index + 1}
          onRelay={chooseRelay}
          onClose={() => setExportChoice(false)}
        />
      </PivotCarouselPopup>

      <PivotCarouselExportPicker
        open={exportPicking}
        slides={deck.slides}
        manifest={manifest}
        currentIndex={index}
        onClose={() => setExportPicking(false)}
        onConfirm={confirmExport}
      />

      <PivotCarouselAddSlide
        open={adding}
        manifest={manifest}
        frames={frames}
        edition={deck.edition}
        inkPlate={deck.inkPlate}
        issue={deck.issue}
        cityVoice={cityVoice}
        onClose={() => setAdding(false)}
        onAdd={addSlide}
      />

      <PivotCarouselEventPicker
        tenantKey={tenantKey}
        open={pickingSlot !== null}
        slotLabel={`${typeLabel(manifest, slide.type)} · slot ${(pickingSlot ?? 0) + 1}`}
        onClose={() => setPickingSlot(null)}
        onPick={(entry) => fillSlot(pickingSlot, entry)}
      />

      <PivotCarouselVoicePanel
        tenantKey={tenantKey}
        cityDisplayName={cityDisplayName}
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onSaved={onVoiceSaved}
      />
    </div>
  );
}
