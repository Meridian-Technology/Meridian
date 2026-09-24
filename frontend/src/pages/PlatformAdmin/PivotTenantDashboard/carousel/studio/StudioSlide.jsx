import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import stickerDark from '../../../../../assets/pivot/JustGoDieCutDark.png';
import stickerLight from '../../../../../assets/pivot/JustGoDieCutLight.png';
import { formatWhen } from '../../../../../shared/carouselStudio/date';
import { textStyle } from '../../../../../shared/carouselStudio/layout';
import { reflowCard } from '../../../../../shared/carouselStudio/document';
import { walkElements } from '../../../../../shared/carouselStudio/presets';
import { SLIDE_FONTS } from './studioDocument';
import './StudioSlide.scss';

export function frameStyle(element, index = 0) {
  const { frame, rotation = 0 } = element;
  return { left: frame.x, top: frame.y, width: frame.width, height: frame.height,
    transform: `rotate(${rotation}deg)`, zIndex: Number.isFinite(element.stack) ? element.stack : index };
}
function cropStyle(element) {
  const crop = element.crop || {};
  return { objectPosition: `${(crop.focalX ?? 0.5) * 100}% ${(crop.focalY ?? 0.5) * 100}%`,
    transform: `translate(${(crop.panX || 0) * Math.max(0, (crop.scale || 1) - 1) * 50}%, ${(crop.panY || 0) * Math.max(0, (crop.scale || 1) - 1) * 50}%) scale(${crop.scale || 1}) rotate(${element.style?.imageRotation || 0}deg)`,
    filter: `saturate(1.06) contrast(1.03) brightness(${element.style?.brightness ?? 1})` };
}
function TextBlock({ element, editing, editingLabel, onEdit, onMeasure, timezone }) {
  const ref = useRef(null);
  const labelRef = useRef(null);
  useLayoutEffect(() => { if (editingLabel && labelRef.current) { labelRef.current.focus(); const range = document.createRange(); range.selectNodeContents(labelRef.current); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); } }, [editingLabel]);
  const styleKey = JSON.stringify(element.style);
  const value = element.presence === 'blank' ? '' : String(element.text || '');
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    let alive = true;
    const measure = () => {
      if (alive && !editing && onMeasure) onMeasure(element.id, node.offsetHeight + (element.label ? 38 : 0), node.scrollWidth);
    };
    measure();
    document.fonts?.ready?.then(measure);
    if (editing) {
      node.focus();
      const selection = window.getSelection(); const range = document.createRange();
      range.selectNodeContents(node); selection.removeAllRanges(); selection.addRange(range);
    }
    return () => { alive = false; };
  }, [value, editing, element.id, element.frame.width, styleKey, element.label, onMeasure]);
  const paint = textStyle(element);
  const isDate = element.role === 'event-date';
  const dateContent = !editing && /date|logistics/.test(element.role || '') ? value.split('\n').map((line, index) => {
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(line.trim()) && !Number.isNaN(new Date(line.trim()).getTime());
    return <React.Fragment key={index}>{index > 0 ? '\n' : null}{iso || isDate ? <strong style={{ fontWeight: 700 }}>{iso ? formatWhen({ startTime: line.trim(), timezone }) : line}</strong> : line}</React.Fragment>;
  }) : null;
  return <>
    {element.label && <div ref={labelRef} data-text-label="true" className="studio-art__label" contentEditable={editingLabel || undefined} suppressContentEditableWarning onBlur={editingLabel ? event => onEdit?.(element.id, event.currentTarget.innerText ?? event.currentTarget.textContent, 'label') : undefined}>{element.label}</div>}
    <div ref={ref} className={`studio-art__text${editing ? ' is-editing' : ''}`} style={paint}
      contentEditable={editing || undefined} suppressContentEditableWarning
      onBlur={editing ? event => onEdit?.(element.id, event.currentTarget.innerText ?? event.currentTarget.textContent) : undefined}
      onPaste={editing ? event => {
        event.preventDefault();
        const value = event.clipboardData.getData('text/plain');
        const selection = window.getSelection();
        if (selection?.rangeCount) { const range = selection.getRangeAt(0); range.deleteContents(); const text = document.createTextNode(value); range.insertNode(text); range.setStartAfter(text); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); }
      } : undefined}
    >{!editing && element.style?.lettering ? value.split('\n').map((line, lineIndex) => <div className="studio-art__letter-line" key={lineIndex}><span style={{ background: element.style.textBackground || undefined }}>{Array.from(line).map((letter, i) => <span key={i} style={{ transform: `translateY(${[0, 2.16, -1.62, 2.16, 0, -1.62, 2.16][i % 7]}px) rotate(${[-2, 1, -1, 2, -2, 1, 2][i % 7]}deg)` }}>{letter === ' ' ? '\u00a0' : letter}</span>)}</span></div>) : dateContent || (!editing && !value && onEdit && element.placeholder ? <span className="studio-art__text-placeholder">{element.placeholder}</span> : null) || (element.style?.textBackground && !editing ? <span className="studio-art__paper-text" style={{ background: element.style.textBackground }}>{value}</span> : value)}</div>
  </>;
}
function ElementNode({ element, index, editingId, onEdit, onMeasure, onImageRequest, timezone, inheritedLocked = false }) {
  if (!element || element.visibility === 'hidden' || element.presence === 'removed') return null;
  if (element.role === 'event-logistics' && element.kind === 'card' && (element.children || []).every(child => child.presence === 'removed' || child.visibility === 'hidden')) return null;
  const locked = inheritedLocked || element.locked;
  const style = { ...frameStyle(element, index), background: element.style?.fill, opacity: element.style?.opacity ?? 1, '--rule-color': element.style?.ruleColor || 'currentColor' };
  const treatment = element.style?.treatment || '';
  const blankText = element.kind === 'text' && !(element.presence === 'blank' ? '' : String(element.text || '')).trim();
  const classes = `studio-art__node studio-art__node--${element.kind}${treatment ? ` studio-art__node--${treatment}` : ''}${blankText ? ' is-blank' : ''}${element.style?.borderTop ? ' has-rule' : ''}${element.style?.shadow ? ' has-shadow' : ''}`;
  return <div className={classes} data-element-id={element.id} data-kind={element.kind} data-locked={locked ? 'true' : 'false'}
    data-frame={`${element.frame.x},${element.frame.y},${element.frame.width},${element.frame.height}`} data-rotation={element.rotation || 0} style={style}>
    {element.kind === 'card' ? (element.children || []).map((child, childIndex) => <ElementNode key={child.id} element={child} index={childIndex} editingId={editingId} onEdit={onEdit} onMeasure={onMeasure} onImageRequest={onImageRequest} timezone={timezone} inheritedLocked={locked} />)
      : element.kind === 'text' ? <TextBlock element={element} editing={!locked && editingId === element.id} editingLabel={!locked && editingId === `${element.id}:label`} onEdit={onEdit} onMeasure={onMeasure} timezone={timezone} />
        : element.kind === 'image' ? <div className={`studio-art__photo-mask${element.style?.mask ? ` studio-art__photo-mask--${element.style.mask}` : ''}`}>
          {element.asset?.src ? <img src={element.asset.src} alt={element.asset.alt || ''} draggable={false} style={cropStyle(element)} /> : onImageRequest ? <button type="button" data-add-photo="true" className="studio-art__missing" disabled={locked} onClick={event => { event.stopPropagation(); onImageRequest(element.id); }}><span>＋</span><span>Add a photograph</span></button> : <div className="studio-art__missing"><span>＋</span><span>Add a photograph</span></div>}
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
  const measure = useCallback((id, height, width) => {
    if (!Number.isFinite(height) || height <= 0) return;
    const rounded = Math.ceil(height);
    if (measuredRef.current[id] !== rounded) { measuredRef.current = { ...measuredRef.current, [id]: rounded }; setMeasured(measuredRef.current); }
    onMeasure?.(id, rounded, width);
  }, [onMeasure]);
  const slide = useMemo(() => {
    if (!source) return source;
    const next = JSON.parse(JSON.stringify(source)); let changed = false;
    walkElements(next.elements, element => { if (element.autoHeight && element.layout === 'flow' && measured[element.id] && element.frame.height !== measured[element.id]) { element.frame.height = measured[element.id]; changed = true; } });
    if (changed) for (const element of next.elements || []) if (element.kind === 'card') reflowCard(element);
    return next;
  }, [source, measured]);
  if (!slide) return null;
  const logicalWidth = slide.width || doc.width || 1080; const logicalHeight = slide.height || doc.height || 1350;
  const scale = width / logicalWidth;
  return <div className="studio-art" style={{ width, height: logicalHeight * scale }}>
    <div className="studio-art__surface" data-export-root="true" data-slide-width={logicalWidth} data-slide-height={logicalHeight}
      data-font-faces={SLIDE_FONTS.join(', ')} style={{ width: logicalWidth, height: logicalHeight, transform: `scale(${scale})`, background: slide.background?.color || slide.background?.fill || '#faf6ef' }}>
      {slide.background?.kind === 'image' && slide.background.asset?.src && <img className="studio-art__background" src={slide.background.asset.src} alt="" draggable={false} style={cropStyle(slide.background)} />}
      {(slide.elements || []).map((element, index) => <ElementNode key={element.id} element={element} index={index} editingId={editingId} onEdit={onEdit} onMeasure={measure} onImageRequest={onImageRequest} timezone={slide.sourceTimezone || doc.editorial?.curation?.snapshots?.find(item => item.ref?.eventId === slide.source?.eventId && item.ref?.sourceTenantKey === slide.source?.sourceTenantKey)?.snapshot?.city?.timezone || 'UTC'} />)}
      <div className="studio-art__grain" aria-hidden="true" />
    </div>
  </div>;
}
