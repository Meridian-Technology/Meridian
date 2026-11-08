import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import stickerDark from '../../../../../assets/pivot/JustGoDieCutDark.png';
import stickerLight from '../../../../../assets/pivot/JustGoDieCutLight.png';
import appStoreBadge from '../../../../../assets/pivot/download-on-the-app-store.svg';
import { formatWhen } from '../../../../../shared/carouselStudio/date';
import { textStyle } from '../../../../../shared/carouselStudio/layout';
import { reflowCard, cardFitOverflow, scaleCardText, fitRatio, nextFitScale } from '../../../../../shared/carouselStudio/document';
import { walkElements } from '../../../../../shared/carouselStudio/presets';
import { SLIDE_FONTS } from './studioDocument';
import './StudioSlide.scss';

export function frameStyle(element, index = 0) {
  const { frame, rotation = 0 } = element;
  return { left: frame.x, top: frame.y, width: frame.width, height: frame.height,
    transform: `rotate(${rotation}deg)`, zIndex: Number.isFinite(element.stack) ? element.stack : index };
}
export function slideEffects(slide) {
  return {
    grain: slide?.effects?.grain !== false,
    filmFilter: slide?.effects?.filmFilter !== false,
  };
}

function cropStyle(element, filmFilter = true) {
  const crop = element.crop || {};
  const brightness = element.style?.brightness ?? element.brightness ?? 1;
  const filter = filmFilter
    ? `saturate(1.06) contrast(1.03) brightness(${brightness})`
    : (brightness !== 1 ? `brightness(${brightness})` : undefined);
  return { objectPosition: `${(crop.focalX ?? 0.5) * 100}% ${(crop.focalY ?? 0.5) * 100}%`,
    transform: `translate(${(crop.panX || 0) * Math.max(0, (crop.scale || 1) - 1) * 50}%, ${(crop.panY || 0) * Math.max(0, (crop.scale || 1) - 1) * 50}%) scale(${crop.scale || 1}) rotate(${element.style?.imageRotation || 0}deg)`,
    ...(filter ? { filter } : {}) };
}
export function readEditableText(node) {
  return String(node?.innerText ?? node?.textContent ?? '').replace(/\u00a0/g, ' ').replace(/\n$/, '');
}
function selectContents(node) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}
function fontsLoaded() {
  return typeof document === 'undefined' || !document.fonts || document.fonts.status === 'loaded';
}
/** Widest line of lettered text, or the text's own box, in slide pixels. */
function measuredExtent(node) {
  const lines = node.querySelectorAll('.studio-art__letter-line > span');
  const width = lines.length ? Math.max(...[...lines].map(line => line.offsetWidth)) : node.scrollWidth;
  return { width, height: node.offsetHeight };
}
function TextBlock({ element, editing, editingLabel, onEdit, onMeasure, timezone }) {
  const ref = useRef(null);
  const labelRef = useRef(null);
  const styleKey = JSON.stringify(element.style);
  const value = element.presence === 'blank' ? '' : String(element.text || '');
  const label = String(element.label || '');
  // `fit: 'shrink'` text shrinks until it fits its frame: lettered lines to its
  // width, a free box to its height. Flow text that grows with its card is left
  // to the card's fit.
  const fits = element.style?.fit === 'shrink' && !editing;
  const fitKey = `${value}|${styleKey}|${element.frame.width}|${element.frame.height}`;
  const fitState = useRef({ key: null, scale: 1, rounds: 0 });
  const [fit, setFit] = useState({ scale: 1, done: !fits });
  if (fitState.current.key !== fitKey) fitState.current = { key: fitKey, scale: 1, rounds: 0 };
  useLayoutEffect(() => {
    if (!fits) { setFit(current => (current.scale === 1 && current.done ? current : { scale: 1, done: true })); return undefined; }
    let alive = true;
    const check = () => {
      const node = ref.current;
      if (!alive || !node || !fontsLoaded()) return;
      const state = fitState.current;
      const base = element.style?.fontSizePx || 30;
      const min = Math.min(1, (element.style?.minFontSizePx || base * 0.4) / base);
      const { ratio, widthBound } = fitRatio(measuredExtent(node), {
        width: element.frame.width,
        height: element.layout === 'flow' && element.autoHeight ? Infinity : element.frame.height - (element.label ? 38 : 0),
      });
      const next = nextFitScale(state.scale, ratio, { min, widthBound });
      if (next !== state.scale && state.rounds < 8) {
        state.scale = next; state.rounds += 1;
        setFit({ scale: next, done: false });
      } else setFit(current => (current.done && current.scale === state.scale ? current : { scale: state.scale, done: true }));
    };
    check();
    document.fonts?.ready?.then(check);
    return () => { alive = false; };
  }, [fits, fitKey, fit.scale, element.layout, element.autoHeight, element.label, element.frame.width, element.frame.height, element.style?.fontSizePx, element.style?.minFontSizePx]);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    let alive = true;
    const measure = () => {
      if (alive && !editing && onMeasure) onMeasure(element.id, node.offsetHeight + (element.label ? 38 : 0), node.scrollWidth);
    };
    measure();
    document.fonts?.ready?.then(measure);
    return () => { alive = false; };
  }, [value, editing, element.id, element.frame.width, styleKey, element.label, onMeasure]);
  useLayoutEffect(() => {
    if (!editing || !ref.current) return undefined;
    ref.current.textContent = value;
    ref.current.focus();
    selectContents(ref.current);
    return undefined;
  }, [editing, element.id]);
  useLayoutEffect(() => {
    if (!editingLabel || !labelRef.current) return undefined;
    labelRef.current.textContent = label;
    labelRef.current.focus();
    selectContents(labelRef.current);
    return undefined;
  }, [editingLabel, element.id]);
  const paint = textStyle(element);
  if (fits && fitState.current.scale !== 1) paint.fontSize *= fitState.current.scale;
  const isDate = element.role === 'event-date';
  const dateContent = !editing && /date|logistics/.test(element.role || '') ? value.split('\n').map((line, index) => {
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(line.trim()) && !Number.isNaN(new Date(line.trim()).getTime());
    return <React.Fragment key={index}>{index > 0 ? '\n' : null}{iso || isDate ? <strong style={{ fontWeight: 700 }}>{iso ? formatWhen({ startTime: line.trim(), timezone }) : line}</strong> : line}</React.Fragment>;
  }) : null;
  return <>
    {element.label && <div ref={labelRef} data-text-label="true" className="studio-art__label" contentEditable={editingLabel || undefined} suppressContentEditableWarning onBlur={editingLabel ? event => onEdit?.(element.id, readEditableText(event.currentTarget), 'label') : undefined}>{editingLabel ? null : element.label}</div>}
    <div key={editing ? 'editing' : 'display'} ref={ref} className={`studio-art__text${editing ? ' is-editing' : ''}`} style={paint}
      data-fit={fits ? (fit.done ? 'done' : 'pending') : undefined}
      contentEditable={editing || undefined} suppressContentEditableWarning
      onBlur={editing ? event => onEdit?.(element.id, readEditableText(event.currentTarget)) : undefined}
      onPaste={editing ? event => {
        event.preventDefault();
        const value = event.clipboardData.getData('text/plain');
        const selection = window.getSelection();
        if (selection?.rangeCount) { const range = selection.getRangeAt(0); range.deleteContents(); const text = document.createTextNode(value); range.insertNode(text); range.setStartAfter(text); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); }
      } : undefined}
    >{editing ? null : element.style?.lettering ? value.split('\n').map((line, lineIndex) => <div className="studio-art__letter-line" key={lineIndex}><span style={{ background: element.style.textBackground || undefined }}>{Array.from(line).map((letter, i) => <span key={i} style={{ transform: `translateY(${[0, 2.16, -1.62, 2.16, 0, -1.62, 2.16][i % 7]}px) rotate(${[-2, 1, -1, 2, -2, 1, 2][i % 7]}deg)` }}>{letter === ' ' ? '\u00a0' : letter}</span>)}</span></div>) : dateContent || (!value && onEdit && element.placeholder ? <span className="studio-art__text-placeholder">{element.placeholder}</span> : null) || (element.style?.textBackground ? <span className="studio-art__paper-text" style={{ background: element.style.textBackground }}>{value}</span> : value)}</div>
  </>;
}
function ElementNode({ element, index, editingId, onEdit, onMeasure, onImageRequest, timezone, inheritedLocked = false, filmFilter = true }) {
  if (!element || element.visibility === 'hidden' || element.presence === 'removed') return null;
  if (element.role === 'event-logistics' && element.kind === 'card' && (element.children || []).every(child => child.presence === 'removed' || child.visibility === 'hidden')) return null;
  const locked = inheritedLocked || element.locked;
  const style = { ...frameStyle(element, index), background: element.style?.fill, opacity: element.style?.opacity ?? 1, '--rule-color': element.style?.ruleColor || 'currentColor' };
  const treatment = element.style?.treatment || '';
  const blankText = element.kind === 'text' && !(element.presence === 'blank' ? '' : String(element.text || '')).trim();
  const classes = `studio-art__node studio-art__node--${element.kind}${treatment ? ` studio-art__node--${treatment}` : ''}${blankText ? ' is-blank' : ''}${element.style?.borderTop ? ' has-rule' : ''}${element.style?.shadow ? ' has-shadow' : ''}`;
  return <div className={classes} data-element-id={element.id} data-kind={element.kind} data-locked={locked ? 'true' : 'false'}
    data-frame={`${element.frame.x},${element.frame.y},${element.frame.width},${element.frame.height}`} data-rotation={element.rotation || 0} style={style}>
    {element.kind === 'card' ? (element.children || []).map((child, childIndex) => <ElementNode key={child.id} element={child} index={childIndex} editingId={editingId} onEdit={onEdit} onMeasure={onMeasure} onImageRequest={onImageRequest} timezone={timezone} inheritedLocked={locked} filmFilter={filmFilter} />)
      : element.kind === 'text' ? <TextBlock element={element} editing={!locked && editingId === element.id} editingLabel={!locked && editingId === `${element.id}:label`} onEdit={onEdit} onMeasure={onMeasure} timezone={timezone} />
        : element.role === 'back-badge' ? <img draggable={false} className="studio-art__badge" src={element.asset?.src || appStoreBadge} alt={element.asset?.alt || 'Download on the App Store'} />
        : element.kind === 'image' ? <div className={`studio-art__photo-mask${element.style?.mask ? ` studio-art__photo-mask--${element.style.mask}` : ''}`}>
          {element.asset?.src ? <img src={element.asset.src} alt={element.asset.alt || ''} draggable={false} style={cropStyle(element, filmFilter)} /> : onImageRequest ? <button type="button" data-add-photo="true" className="studio-art__missing" disabled={locked} onClick={event => { event.stopPropagation(); onImageRequest(element.id); }}><span>＋</span><span>Add a photograph</span></button> : <div className="studio-art__missing"><span>＋</span><span>Add a photograph</span></div>}
        </div>
          : element.kind === 'sticker' ? <img draggable={false} className="studio-art__sticker" src={element.asset?.src || (element.asset?.finish === 'dark' || element.style?.finish === 'dark' ? stickerDark : stickerLight)} alt={element.asset?.alt || 'Just Go'} /> : null}
  </div>;
}
export function slideAt(doc, slideIndex = 0) {
  if (Array.isArray(doc?.slides)) return doc.slides[slideIndex] || doc.slides[0];
  return doc;
}
export default function StudioSlide({ doc, width = 1080, slideIndex = 0, editingId = null, onEdit, onMeasure, onImageRequest }) {
  const source = slideAt(doc, slideIndex);
  const [measured, setMeasured] = useState({});
  const measuredRef = useRef({});
  // Per-card text scale for `fit: 'shrink'` cards, found by measuring.
  const [cardScales, setCardScales] = useState({});
  const cardRounds = useRef({});
  const [fontsReady, setFontsReady] = useState(fontsLoaded);
  useLayoutEffect(() => {
    if (fontsReady) return undefined;
    let alive = true;
    document.fonts?.ready?.then(() => { if (alive) setFontsReady(true); });
    return () => { alive = false; };
  }, [fontsReady]);
  const measure = useCallback((id, height, width) => {
    if (!Number.isFinite(height) || height <= 0) return;
    const rounded = Math.ceil(height);
    if (measuredRef.current[id] !== rounded) { measuredRef.current = { ...measuredRef.current, [id]: rounded }; setMeasured(measuredRef.current); }
    onMeasure?.(id, rounded, width);
  }, [onMeasure]);
  const slide = useMemo(() => {
    if (!source) return source;
    const next = JSON.parse(JSON.stringify(source)); let changed = false;
    walkElements(next.elements, element => { if (element.kind === 'card' && cardScales[element.id]) scaleCardText(element, cardScales[element.id]); });
    walkElements(next.elements, element => { if (element.autoHeight && element.layout === 'flow' && measured[element.id] && element.frame.height !== measured[element.id]) { element.frame.height = measured[element.id]; changed = true; } });
    if (changed || Object.keys(cardScales).length) for (const element of next.elements || []) if (element.kind === 'card') reflowCard(element);
    return next;
  }, [source, measured, cardScales]);
  const [cardsSettled, setCardsSettled] = useState(false);
  useLayoutEffect(() => {
    if (!slide) return;
    let pending = !fontsReady; const updates = {};
    walkElements(slide.elements, element => {
      if (element.kind !== 'card' || element.fit !== 'shrink') return;
      // A child measured since this render means another pass is coming.
      let stale = false;
      walkElements(element.children, child => { if (child.autoHeight && child.layout === 'flow' && child.presence !== 'removed' && measuredRef.current[child.id] !== child.frame.height) stale = true; });
      if (stale || !fontsReady) { pending = true; return; }
      const { overflow, used } = cardFitOverflow(element);
      const scale = cardScales[element.id] || 1;
      const rounds = cardRounds.current[element.id] || 0;
      if (overflow > 2 && scale > 0.6 && rounds < 8) {
        cardRounds.current[element.id] = rounds + 1;
        updates[element.id] = nextFitScale(scale, (used - overflow) / used, { min: 0.6 });
        pending = true;
      }
    });
    if (Object.keys(updates).length) setCardScales(current => ({ ...current, ...updates }));
    setCardsSettled(!pending);
  }, [slide, fontsReady, cardScales]);
  if (!slide) return null;
  const logicalWidth = slide.width || doc.width || 1080; const logicalHeight = slide.height || doc.height || 1350;
  const scale = width / logicalWidth;
  const effects = slideEffects(slide);
  const surfaceFill = slide.background?.kind === 'image'
    ? 'transparent'
    : (slide.background?.color || slide.background?.fill || '#faf6ef');
  return <div className="studio-art" style={{ width, height: logicalHeight * scale }}>
    <div className="studio-art__surface" data-export-root="true" data-slide-width={logicalWidth} data-slide-height={logicalHeight}
      data-fit-pending={cardsSettled ? undefined : '1'}
      data-font-faces={SLIDE_FONTS.join(', ')} style={{ width: logicalWidth, height: logicalHeight, transform: `scale(${scale})`, background: surfaceFill }}>
      {slide.background?.kind === 'image' && slide.background.asset?.src && <img className="studio-art__background" src={slide.background.asset.src} alt="" draggable={false} style={cropStyle(slide.background, effects.filmFilter)} />}
      {(slide.elements || []).map((element, index) => <ElementNode key={element.id} element={element} index={index} editingId={editingId} onEdit={onEdit} onMeasure={measure} onImageRequest={onImageRequest} filmFilter={effects.filmFilter} timezone={slide.sourceTimezone || doc.editorial?.curation?.snapshots?.find(item => item.ref?.eventId === slide.source?.eventId && item.ref?.sourceTenantKey === slide.source?.sourceTenantKey)?.snapshot?.city?.timezone || 'UTC'} />)}
      {effects.grain ? <div className="studio-art__grain" aria-hidden="true" /> : null}
    </div>
  </div>;
}
