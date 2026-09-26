import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import StudioSlide, { readEditableText } from './StudioSlide';
import StudioImagePicker, { eventImages, PhotoCredit } from './StudioImagePicker';
import PivotOpsStatus from '../../../../../components/PivotOps/PivotOpsStatus';
import PivotCarouselCurationWorkspace from '../PivotCarouselCurationWorkspace';
import { authenticatedRequest } from '../../../../../hooks/useFetch';
import { COVER_FAMILIES, EVENT_PRESETS, BACK_PRESETS, applyPreset, walkElements } from '../../../../../shared/carouselStudio/presets';
import { cardOverflow } from '../../../../../shared/carouselStudio/document';
import { textStyle } from '../../../../../shared/carouselStudio/layout';
import { createHistory, commitTransaction, undo, redo, findElement, findParent, LIMITS } from './studioDocument';
import * as commands from './studioEditorCommands';
import useStudioNavigationGuard from './useStudioNavigationGuard';
import useStudioAutosave from './useStudioAutosave';
import { compareDocuments, exportAvailability } from './studioPersistence';
import CarouselExportChoice from '../CarouselExportChoice';
import './StudioEditor.scss';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const NARROW_EDITOR = '(max-width: 840px)';
const TITLES = { 'loose-letters': 'Loose letters', 'open-invitation': 'Open invitation', 'kept-somewhere': 'Kept somewhere', 'photo-note': 'Photo note', 'on-the-bill': 'On the bill', 'in-the-room': 'In the room', 'paper-close': 'Paper close', 'orange-close': 'Orange close' };
const typingTarget = target => Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
const clone = value => JSON.parse(JSON.stringify(value));
function Button({ icon, children, title, ...props }) {
  const label = title || (typeof children === 'string' ? children : undefined);
  return <button type="button" title={label} {...props}>{icon && <Icon icon={icon} aria-hidden="true" />}{children != null && children !== false ? <span>{children}</span> : null}</button>;
}
function FileButton({ label, disabled, onFile }) {
  return <label className={`jg-editor__upload${disabled ? ' is-disabled' : ''}`}><Icon icon="lucide:upload" />{label}<input type="file" aria-label={label} accept="image/png,image/jpeg,image/webp,image/gif" disabled={disabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile(file); }} /></label>;
}
function editorDocument(issue) {
  return { ...clone(issue.document), editorial: { curation: clone(issue.curation || { refs: issue.sources || [] }), sources: clone(issue.sources || []) } };
}
function snapshotOf(value) {
  const snapshot = clone(value);
  const { editorial, ...document } = snapshot;
  return { document, editorial };
}
export default function StudioEditor({ issue, onSave, onSaveCopy, onReload, onOpenIssue, onExport, onEditSelection, account, onBack, userId, autosaveMs }) {
  const [history, setHistory] = useState(() => createHistory(editorDocument(issue)));
  const historyRef = useRef(history); historyRef.current = history;
  const doc = history.present; const docRef = useRef(doc); docRef.current = doc;
  const slides = commands.slidesOf(doc);
  const [slideId, setSlideId] = useState(slides[0]?.id || null);
  const [selected, setSelected] = useState([]);
  const [zoom, setZoom] = useState(0.42);
  const manualZoom = useRef(false);
  const [panel, setPanel] = useState('design');
  const [mode, setMode] = useState('select');
  const [editingId, setEditingId] = useState(null);
  const pendingText = useRef(null);
  const [guides, setGuides] = useState([]);
  const [notice, setNotice] = useState('');
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(editorDocument(issue)));
  const [checkpointsOpen, setCheckpointsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [checkpoints, setCheckpoints] = useState([]);
  const [checkpointName, setCheckpointName] = useState('');
  const [compareOpen, setCompareOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [accountAssets, setAccountAssets] = useState([]);
  const [curationId, setCurationId] = useState(null);
  const controlStart = useRef(null);
  const drag = useRef(null); const dragSlide = useRef(null); const suppressSlideClick = useRef(false);
  const [slideDropId, setSlideDropId] = useState(null);
  const [imageTarget, setImageTarget] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_EDITOR).matches);
  const stageRef = useRef(null); const canvasRef = useRef(null); const rootRef = useRef(null);
  const measurements = useRef({}); const measureFrame = useRef(null);
  const selectionRef = useRef(selected); selectionRef.current = selected;
  const slideRef = useRef(slideId); slideRef.current = slideId;
  const scaleRef = useRef(zoom); scaleRef.current = zoom;
  const slide = commands.slideById(doc, slideId);
  const index = Math.max(0, slides.findIndex(row => row.id === slide?.id));
  const primaryId = selected[selected.length - 1];
  const primary = findElement(slide, primaryId);
  const locked = primary && commands.isElementLocked(slide, primaryId);
  const dirty = JSON.stringify(doc) !== savedJson;
  useStudioNavigationGuard(dirty);
  const adopt = useCallback((savedIssue) => {
    const next = editorDocument({ ...issue, ...savedIssue });
    setHistory(createHistory(next));
    setSavedJson(JSON.stringify(next));
    setSelected([]);
  }, [issue]);
  const autosave = useStudioAutosave({
    userId,
    accountId: issue.accountId,
    issueId: issue._id || issue.id,
    serverUpdatedAt: issue.updatedAt,
    serverDocument: issue.document,
    serverEditorial: { curation: issue.curation || null, sources: issue.sources || [] },
    initialRevision: issue.revision || 1,
    getSnapshot: () => snapshotOf(docRef.current),
    onSave,
    autosaveMs,
    onResult: ({ outcome, result }) => {
      if (outcome === 'saved' && result.replaceDocument) {
        const saved = { ...(result.document || result.captured.document), editorial: result.editorial || result.captured.editorial };
        setSavedJson(JSON.stringify(saved));
        setHistory((current) => (JSON.stringify(snapshotOf(current.present)) === JSON.stringify(result.captured) ? { ...current, present: saved } : current));
        setNotice('');
      } else if (outcome === 'conflict') setNotice(result.error || 'This issue changed in another session. Your edits are still here.');
      else if (outcome === 'offline') setNotice('You are offline. These edits stay on this device until the connection returns.');
      else if (outcome === 'failed') setNotice('The save failed. Your edits are still here. Try again.');
    },
  });
  const { saveState, conflict, recovery, noteEdit, flush, dismissRecovery, clearConflict, revisionRef } = autosave;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const center = primary && commands.visualCenter(slide, primaryId);
  const bounds = selected.length > 1 ? commands.selectionBounds(slide, selected) : null;
  const [overflow, setOverflow] = useState({});

  const commit = useCallback((next, label) => {
    for (const slide of commands.slidesOf(next)) { let count = 0; walkElements(slide.elements, () => { count += 1; }); if (count > LIMITS.maxElements) { setNotice('A slide can contain up to 64 objects. Remove an object before adding another.'); return; } }
    setHistory(current => commitTransaction(current, next, label));
    noteEdit(snapshotOf(next));
  }, [noteEdit]);
  const beginControl = () => { controlStart.current = historyRef.current; };
  const endControl = () => { const before = controlStart.current; controlStart.current = null; if (before) setHistory(current => commitTransaction(before, current.present, 'Adjust control')); };
  const controlGesture = { onPointerDown: beginControl, onPointerUp: endControl, onPointerCancel: () => { const before = controlStart.current; controlStart.current = null; if (before) setHistory(before); } };
  const change = (command, ...args) => commit(command(docRef.current, slide?.id, ...args), command.name);
  const fit = useCallback(() => {
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box || box.width < 48 || box.height < 48) return;
    const styles = getComputedStyle(canvasRef.current);
    const padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
    const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
    setZoom(Math.max(0.1, Math.min(1, Math.min((box.width - padX) / 1080, (box.height - padY) / 1350))));
  }, []);
  useLayoutEffect(() => {
    fit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { if (!manualZoom.current) fit(); });
    if (canvasRef.current) observer?.observe(canvasRef.current);
    return () => observer?.disconnect();
  }, [fit]);
  useEffect(() => {
    const node = rootRef.current;
    const query = typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_EDITOR) : null;
    const update = () => {
      const width = node?.getBoundingClientRect().width || 0;
      setNarrow((query?.matches ?? false) || (width > 0 && width < 840));
    };
    update();
    if (query && typeof query.addEventListener === 'function') query.addEventListener('change', update);
    else query?.addListener?.(update);
    const observer = typeof ResizeObserver === 'undefined' || !node ? null : new ResizeObserver(update);
    observer?.observe(node);
    return () => {
      if (query && typeof query.removeEventListener === 'function') query.removeEventListener('change', update);
      else query?.removeListener?.(update);
      observer?.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!slides.some(item => item.id === slideId)) setSlideId(slides[0]?.id || null);
    setSelected(current => current.filter(id => Boolean(findElement(slide, id))));
  }, [slides, slideId, slide]);
  useEffect(() => {
    const beforeUnload = event => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    const followLink = event => {
      const link = event.target.closest?.('a[href]');
      if (dirtyRef.current && link && !link.target && new URL(link.href, window.location.href).origin !== window.location.origin && !window.confirm('Leave this issue and discard unsaved changes?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', beforeUnload); document.addEventListener('click', followLink, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', followLink, true); };
  }, []);
  const assetPath = `/admin/pivot/carousel-accounts/${issue.accountId}/assets`;
  useEffect(() => {
    if (!issue.accountId) return undefined;
    let active = true;
    authenticatedRequest(assetPath).then(result => { if (active && result.data?.success) setAccountAssets(result.data.data.assets || []); }).catch(() => {});
    return () => { active = false; };
  }, [assetPath, issue.accountId]);
  useEffect(() => () => { if (measureFrame.current != null) cancelAnimationFrame(measureFrame.current); }, []);
  const onMeasure = useCallback((id, height, width) => {
    const currentSlide = commands.slideById(docRef.current, slideRef.current);
    const element = findElement(currentSlide, id);
    if (!element || height <= 0) return;
    if (!element.autoHeight || element.layout !== 'flow') {
      setOverflow(current => Math.abs((current[id] || 0) - Math.max(0, height - element.frame.height, width > element.frame.width ? height * (width / element.frame.width - 1) : 0)) < 1 ? current : { ...current, [id]: Math.max(0, height - element.frame.height, width > element.frame.width ? height * (width / element.frame.width - 1) : 0) });
      return;
    }
    if (Math.abs(element.frame.height - height) < 1 || drag.current) return;
    measurements.current[id] = height;
    if (measureFrame.current != null) return;
    measureFrame.current = requestAnimationFrame(() => {
      measureFrame.current = null;
      const measured = measurements.current; measurements.current = {};
      setHistory(current => ({ ...current, present: commands.measureTextFrames(current.present, slideRef.current, measured) }));
    });
  }, []);

  const cancelGesture = useCallback(() => {
    const active = drag.current; drag.current = null; setGuides([]);
    if (active) setHistory(current => ({ ...current, present: active.start }));
  }, []);
  const begin = (event, kind = 'move', handle) => {
    if (event.button != null && event.button !== 0) return;
    const field = document.activeElement;
    if (field?.isContentEditable && rootRef.current?.contains(field)) {
      if (field.contains(event.target)) return;
      const editedId = field.closest('[data-element-id]')?.dataset.elementId;
      if (editedId) pendingText.current = { id: editedId, field: field.hasAttribute('data-text-label') ? 'label' : 'text', text: readEditableText(field) };
      field.blur();
      return;
    }
    if (typingTarget(event.target) || event.target.closest('[data-add-photo]')) return;
    const currentSlide = commands.slideById(docRef.current, slideId);
    let targetId = mode === 'background-crop' ? null : handle ? primaryId : event.target.closest('[data-element-id]')?.dataset.elementId;
    if (targetId && !handle && !selected.includes(targetId)) {
      let parent = findParent(currentSlide, targetId);
      while (parent && parent !== currentSlide) { if (parent.role === 'group' || selected.includes(parent.id)) targetId = parent.id; parent = findParent(currentSlide, parent.id); }
    }
    if (!targetId && mode !== 'background-crop') { setSelected([]); return; }
    const element = findElement(currentSlide, targetId);
    event.preventDefault(); event.stopPropagation(); rootRef.current?.focus({ preventScroll: true });
    const ids = handle ? selected : event.shiftKey ? (selected.includes(targetId) ? selected.filter(id => id !== targetId) : [...selected, targetId]) : selected.includes(targetId) ? selected : [targetId];
    setSelected(ids);
    if (event.shiftKey || (targetId && commands.isElementLocked(currentSlide, targetId))) return;
    const place = targetId ? commands.visualCenter(currentSlide, targetId) : null;
    const rect = stageRef.current.getBoundingClientRect();
    const screenCenter = place ? { x: rect.left + place.x * zoom, y: rect.top + place.y * zoom } : null;
    const gestureKind = mode === 'background-crop' ? mode : mode === 'crop' && element?.kind === 'image' ? 'crop' : kind;
    const capture = event.target.setPointerCapture ? event.target : event.currentTarget;
    drag.current = { pointerId: event.pointerId, capture, start: docRef.current, latest: docRef.current, slideId: currentSlide.id, ids, id: targetId, kind: gestureKind, handle,
      x: event.clientX, y: event.clientY, moved: false, place, center: screenCenter,
      angle: screenCenter ? Math.atan2(event.clientY - screenCenter.y, event.clientX - screenCenter.x) : 0 };
    capture.setPointerCapture?.(event.pointerId);
  };
  const move = event => {
    const active = drag.current; if (!active || event.pointerId !== active.pointerId) return;
    const sx = event.clientX - active.x; const sy = event.clientY - active.y;
    if (!active.moved && Math.hypot(sx, sy) < 3) return;
    active.moved = true;
    const dx = sx / zoom; const dy = sy / zoom;
    const startSlide = commands.slideById(active.start, active.slideId);
    const element = findElement(startSlide, active.id);
    let next = active.start;
    if (active.kind === 'rotate') {
      const angle = Math.atan2(event.clientY - active.center.y, event.clientX - active.center.x);
      let delta = (angle - active.angle) * 180 / Math.PI;
      if (event.shiftKey) delta = Math.round(delta / 15) * 15;
      next = commands.rotateBy(next, active.slideId, active.id, (element.rotation || 0) + delta);
    } else if (active.kind === 'resize') {
      const local = commands.screenDeltaToLocal(sx, sy, zoom, active.place?.rotation);
      next = commands.resizeElement(next, active.slideId, active.id, active.handle, local.dx, local.dy, { lockAspect: element.lockAspect || event.shiftKey });
    } else if (active.kind === 'crop' || active.kind === 'background-crop') {
      const background = active.kind === 'background-crop'; const target = background ? startSlide.background : element;
      const crop = { focalX: .5, focalY: .5, scale: 1, ...target.crop };
      const local = commands.screenDeltaToLocal(sx, sy, zoom, background ? 0 : active.place?.rotation);
      const width = background ? 1080 : element.frame.width; const height = background ? 1350 : element.frame.height;
      const patch = crop.scale > 1 ? { ...crop, panX: (crop.panX || 0) + local.dx / (width * (crop.scale - 1) / 2), panY: (crop.panY || 0) + local.dy / (height * (crop.scale - 1) / 2) } : { ...crop, focalX: crop.focalX - local.dx / width, focalY: crop.focalY - local.dy / height };
      next = background ? commands.setBackgroundCrop(next, active.slideId, patch) : commands.setCropOn(next, active.slideId, active.id, patch);
    } else {
      const box = commands.selectionBounds(startSlide, active.ids);
      const peers = startSlide.elements.filter(e => !active.ids.includes(e.id)).map(e => commands.selectionBounds(startSlide, [e.id])).filter(Boolean);
      const snap = !event.altKey && box ? commands.snapTranslation({ ...box, x: box.x + dx, y: box.y + dy }, peers) : { dx: 0, dy: 0, guides: [] };
      setGuides(snap.guides);
      next = commands.moveInSlideSpace(next, active.slideId, active.ids, dx + snap.dx, dy + snap.dy);
    }
    active.latest = next;
    setHistory(current => ({ ...current, present: next }));
  };
  const finish = event => {
    const active = drag.current; if (!active || (event && event.pointerId !== active.pointerId)) return;
    drag.current = null; setGuides([]);
    if (active.capture?.hasPointerCapture?.(active.pointerId)) active.capture.releasePointerCapture(active.pointerId);
    setHistory(current => active.moved ? commitTransaction({ ...current, present: active.start }, active.latest, active.kind) : { ...current, present: active.start });
    if (active.moved) noteEdit(snapshotOf(active.latest));
  };
  const doubleClick = event => {
    const id = event.target.closest('[data-element-id]')?.dataset.elementId;
    const element = findElement(slide, id); if (!element || commands.isElementLocked(slide, id)) return;
    cancelGesture(); setSelected([id]);
    if (element.kind === 'text') { setMode('text'); setEditingId(event.target.closest('[data-text-label]') ? `${id}:label` : id); }
    else if (element.kind === 'image') setMode('crop');
  };
  const keyDown = event => {
    if (event.key === 'Escape') { dragSlide.current = null; setSlideDropId(null); if (drag.current) cancelGesture(); else { setEditingId(null); setMode('select'); rootRef.current.focus(); } return; }
    if (typingTarget(event.target)) return;
    const mod = event.metaKey || event.ctrlKey; const key = event.key.toLowerCase();
    if (mod && key === 's') { event.preventDefault(); save(); return; }
    if (mod && key === 'z') { event.preventDefault(); setHistory(current => event.shiftKey ? redo(current) : undo(current)); return; }
    if (mod && key === 'c' && selected.length) { event.preventDefault(); commands.copyElements(doc, slide.id, commands.topSelection(slide, selected)); return; }
    if (mod && key === 'v') { event.preventDefault(); change(commands.pasteElements); return; }
    if (mod && key === 'd' && selected.length) { event.preventDefault(); change(commands.duplicateElements, commands.topSelection(slide, selected)); return; }
    if (mod && key === 'g') { event.preventDefault(); change(event.shiftKey ? commands.ungroupElements : commands.groupElements, commands.topSelection(slide, selected)); return; }
    if (['Delete', 'Backspace'].includes(event.key) && !selected.length && event.target.closest?.('[data-slide-id]') && slide) { event.preventDefault(); commit(commands.deleteSlide(doc, slide.id), 'Delete slide'); return; }
    if (['Delete', 'Backspace'].includes(event.key) && selected.length) { event.preventDefault(); change(commands.deleteElements, selected); setSelected([]); return; }
    if (event.key.startsWith('Arrow') && selected.length) {
      event.preventDefault(); const step = event.shiftKey ? 10 : 1;
      change(commands.moveInSlideSpace, selected, event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0);
    }
  };
  const save = () => flush();
  const acceptRecovery = () => {
    if (!recovery?.document) return;
    const next = { ...clone(recovery.document), editorial: clone(recovery.editorial || { curation: {}, sources: [] }) };
    setHistory(createHistory(next));
    dismissRecovery();
    noteEdit(snapshotOf(next));
    setNotice('Recovered edits from this browser. They are not saved on the server yet.');
  };
  const reloadServer = async () => {
    if (conflict?.serverIssue?.document) {
      adopt(conflict.serverIssue);
      clearConflict(conflict.serverIssue.revision);
      setCompareOpen(false);
      setNotice('Reloaded the saved issue. Your other edits were kept only in this dialog until now.');
      return;
    }
    const loaded = await onReload?.();
    if (loaded?.document) {
      adopt(loaded);
      clearConflict(loaded.revision);
      setCompareOpen(false);
    }
  };
  const saveCopy = async () => {
    const { document, editorial } = snapshotOf(docRef.current);
    const name = `${issue.name || issue.title || 'Issue'} recovered`.slice(0, 80);
    const created = await onSaveCopy?.(name, document, editorial);
    if (created?.id) {
      dismissRecovery();
      onOpenIssue?.(created.id);
    } else setNotice(created?.error || 'The copy could not be saved. Your edits are still here.');
  };
  const openCheckpoints = async () => {
    setCheckpointsOpen(true);
    if (!issue.accountId) return;
    const result = await authenticatedRequest(`/admin/pivot/carousel-accounts/${issue.accountId}/issues/${issue._id || issue.id}/checkpoints`);
    if (result.data?.success) setCheckpoints(result.data.data.checkpoints || []);
  };
  const saveCheckpoint = async () => {
    const name = checkpointName.trim();
    if (!name || !issue.accountId) return;
    if (dirty) await flush();
    const result = await authenticatedRequest(`/admin/pivot/carousel-accounts/${issue.accountId}/issues/${issue._id || issue.id}/checkpoints`, {
      method: 'POST', data: { name, revision: revisionRef.current },
    });
    if (!result.data?.success) { setNotice(result.error || result.data?.message || 'The checkpoint could not be saved.'); return; }
    setCheckpointName('');
    setCheckpoints((current) => [result.data.data.checkpoint, ...current]);
    setNotice(`Checkpoint “${name}” saved. The editable issue was not replaced.`);
  };
  const restoreCheckpoint = async (checkpoint) => {
    if (dirty && !window.confirm('Restore replaces unsaved edits with a new saved revision.')) return;
    const result = await authenticatedRequest(`/admin/pivot/carousel-accounts/${issue.accountId}/issues/${issue._id || issue.id}/checkpoints/${checkpoint.id}/restore`, {
      method: 'POST', data: { revision: revisionRef.current },
    });
    if (!result.data?.success) { setNotice(result.error || result.data?.message || 'The checkpoint could not be restored.'); return; }
    adopt(result.data.data.issue);
    clearConflict(result.data.data.issue.revision);
    setCheckpointsOpen(false);
    setNotice(`Restored “${checkpoint.name}” as revision ${result.data.data.issue.revision}.`);
  };
  const upload = async (file, apply) => {
    const check = commands.validateUpload(file); if (!check.ok) { setNotice(check.error); return check.error; }
    setUploading(true); setNotice('Uploading image…');
    try {
      const body = new FormData(); body.append('image', file);
      const result = await authenticatedRequest(assetPath, { method: 'POST', data: body });
      if (!result.data?.success) throw new Error(result.data?.message || 'Image upload failed.');
      const asset = result.data.data.asset; setAccountAssets(current => [asset, ...current]); apply(asset); setNotice('Image uploaded. Save to keep it in this issue.'); return true;
    } catch (error) { const message = error.message || 'Image upload failed. Try again.'; setNotice(message); return message; }
    finally { setUploading(false); }
  };
  const chooseImage = asset => {
    if (!imageTarget) return;
    const { slideId: targetSlide, id, background } = imageTarget;
    const current = docRef.current;
    const next = background ? commands.setBackgroundImage(current, targetSlide, asset) : id ? commands.replaceImageAsset(current, targetSlide, id, asset) : commands.insertUploadedImage(current, targetSlide, asset);
    commit(next, background ? 'Set background' : id ? 'Replace photograph' : 'Add photograph');
  };
  const editSelection = async () => {
    if (!account) { if (!dirty || window.confirm('Leave this issue and discard unsaved changes?')) onEditSelection?.(); return; }
    try {
    const editorial = docRef.current.editorial;
    const result = await authenticatedRequest(`/admin/pivot/carousel-accounts/${account.id}/curation/drafts`, { method: 'POST', data: {
      issueId: issue._id || issue.id, format: issue.format || account.defaultFormat,
      selected: editorial.curation?.snapshots || [], theme: editorial.curation?.theme || '',
      coverPreset: editorial.curation?.coverPreset, eventPreset: editorial.curation?.eventPreset,
    } });
    if (result.data?.success) setCurationId(result.data.data.draft.id); else setNotice(result.data?.message || 'Could not open the selection.');
    } catch (_) { setNotice('Could not open the selection. Your edits are still here.'); }
  };
  const applyTemplate = (preset, variation = 1) => { change(commands.applySlidePreset, preset, variation); setSelected([]); setMode('select'); if (narrow) setSheetOpen(false); };
  const selectSlide = id => { cancelGesture(); setSlideId(id); setSelected([]); setEditingId(null); setMode('select'); };
  const addSlide = role => { const next = commands.insertSlide(doc, index + 1, role); commit(next, 'Add slide'); selectSlide(next.slides[index + 1]?.id); setPanel('templates'); setSheetOpen(true); };
  const openPanel = tab => { if (panel === tab && sheetOpen) setSheetOpen(false); else { setPanel(tab); setSheetOpen(true); } };
  const beginSlideDrag = (event, id) => {
    if (event.button !== 0) return;
    dragSlide.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, scroll: narrow };
    if (!narrow) event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveSlideDrag = event => {
    const active = dragSlide.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.scroll) {
      if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > 8) active.moved = true;
      return;
    }
    if (Math.abs(event.clientY - active.y) < 5) return;
    active.moved = true;
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-slide-id]');
    if (target) { active.targetId = target.dataset.slideId; setSlideDropId(active.targetId); }
    const rail = event.currentTarget.parentElement;
    const box = rail.getBoundingClientRect();
    if (event.clientY < box.top + 28) rail.scrollTop -= 12;
    if (event.clientY > box.bottom - 28) rail.scrollTop += 12;
  };
  const endSlideDrag = event => {
    const active = dragSlide.current;
    const scrolled = Boolean(active?.scroll && active.moved);
    dragSlide.current = null;
    setSlideDropId(null);
    if (scrolled) {
      suppressSlideClick.current = true;
      queueMicrotask(() => { suppressSlideClick.current = false; });
      return;
    }
    if (active?.moved && active.targetId && active.pointerId === event.pointerId) commit(commands.reorderSlides(docRef.current, active.id, commands.slidesOf(docRef.current).findIndex(row => row.id === active.targetId)), 'Reorder slide');
  };
  const allElements = []; walkElements(slide?.elements, element => allElements.push(element));
  const overflowingCards = allElements.filter(element => cardOverflow(element) > 1);
  const status = saveState === 'saved' ? (dirty ? 'Unsaved' : 'Saved') : { unsaved: dirty ? 'Unsaved' : 'Saved', saving: 'Saving…', offline: 'Offline', conflict: 'Conflict', failed: 'Save failed' }[saveState];
  const exportState = exportAvailability({ dirty, saveState, confirmedRevision: revisionRef.current });
  const comparison = compareOpen && conflict?.serverIssue?.document ? compareDocuments(snapshotOf(doc).document, conflict.serverIssue.document) : null;
  const assets = [...new Map([...accountAssets, ...commands.assetsInDocument(doc)].map(asset => [asset.id || asset.key || asset.src, asset])).values()];
  const paint = primary?.kind === 'text' ? textStyle(primary) : null;
  const showHandles = center && !locked && selected.length === 1 && mode === 'select';

  return <div className="jg-editor pivot-ops" ref={rootRef} tabIndex={0} onKeyDown={keyDown} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancelGesture} onLostPointerCapture={() => { if (drag.current) cancelGesture(); }}>
    <header className="jg-editor__bar">
      <div className="jg-editor__identity">{onBack && <Button icon="lucide:arrow-left" aria-label="Back to issues" onClick={() => { if (!dirty || window.confirm('Leave this issue and discard unsaved changes?')) onBack(); }} />}<div><h1>{issue.name || issue.title || 'Untitled issue'}</h1><span>{issue.format === 'sorry-you-missed-it' ? 'Sorry you missed it' : 'City picks'} · {slides.length} slides</span></div></div>
      <div className="jg-editor__actions"><span data-testid="save-state"><PivotOpsStatus tone={saveState === 'failed' || saveState === 'conflict' || saveState === 'offline' ? 'danger' : dirty ? 'warn' : 'success'}>{status}</PivotOpsStatus></span><Button icon="lucide:list-filter" onClick={editSelection} disabled={!account && !onEditSelection}>Edit selection</Button><Button icon="lucide:history" onClick={openCheckpoints}>Checkpoints</Button><div className="jg-editor__commit"><Button className="is-primary" onClick={save} disabled={!dirty || saveState === 'saving' || saveState === 'conflict' || uploading}>Save</Button><Button data-testid="export-issue" disabled={!exportState.enabled} title={exportState.reason} onClick={() => setExportOpen(true)}>Export</Button></div></div>
    </header>

    <div className="jg-editor__toolbar">
      <div><Button icon="lucide:undo-2" aria-label="Undo" onClick={() => setHistory(undo)} disabled={!history.past.length} /><Button icon="lucide:redo-2" aria-label="Redo" onClick={() => setHistory(redo)} disabled={!history.future.length} /><span className="jg-editor__separator" /><Button icon="lucide:type" disabled={!slide} onClick={() => { const next = commands.insertText(doc, slide.id); commit(next, 'Add text'); setSelected([next.slides[index].elements.at(-1).id]); setPanel('design'); setSheetOpen(true); }}>Text</Button><Button icon="lucide:image" disabled={!slide} onClick={() => setImageTarget({ slideId: slide.id })}>Image</Button><Button icon="lucide:layout-template" onClick={() => openPanel('templates')}>Templates</Button></div>
      <div><Button icon="lucide:group" aria-label="Group" disabled={selected.length < 2} onClick={() => change(commands.groupElements, commands.topSelection(slide, selected))} /><Button icon="lucide:ungroup" aria-label="Ungroup" disabled={primary?.role !== 'group'} onClick={() => change(commands.ungroupElements, selected)} /><Button icon={locked ? 'lucide:lock' : 'lucide:lock-open'} aria-label={locked ? 'Unlock' : 'Lock'} disabled={!primary} onClick={() => change(commands.setLocked, selected, !primary?.locked)} /><Button icon="lucide:copy" aria-label="Duplicate" disabled={!primary || locked} onClick={() => change(commands.duplicateElements, commands.topSelection(slide, selected))} /><Button icon="lucide:trash-2" aria-label="Delete" disabled={!primary || locked} onClick={() => { change(commands.deleteElements, selected); setSelected([]); }} /><span className="jg-editor__separator" /><Button onClick={() => { manualZoom.current = false; fit(); }}>Fit</Button><input aria-label="Zoom" type="range" min="0.1" max="1.5" step="0.01" value={zoom} onChange={event => { manualZoom.current = true; setZoom(Number(event.target.value)); }} /><span className="jg-editor__zoom">{Math.round(zoom * 100)}%</span></div>
    </div>
    <div className="jg-editor__body">
      <aside className="jg-editor__rail" aria-label="Slides"><div className="jg-editor__rail-title">Slides <Button icon="lucide:plus" aria-label="Add slide" disabled={slides.length >= 20} onClick={() => addSlide('event')} /></div>
        <div className="jg-editor__thumbnails">{slides.map((item, i) => <button key={item.id} type="button" data-slide-id={item.id} className={`jg-editor__thumbnail${item.id === slide?.id ? ' is-active' : ''}${slideDropId === item.id ? ' is-drop-target' : ''}`} aria-label={`Slide ${i + 1}`} aria-current={item.id === slide?.id ? 'true' : undefined} onClick={() => { if (suppressSlideClick.current) return; selectSlide(item.id); }} onPointerDown={event => beginSlideDrag(event, item.id)} onPointerMove={moveSlideDrag} onPointerUp={endSlideDrag} onPointerCancel={() => { const active = dragSlide.current; if (active?.scroll && active.moved) { suppressSlideClick.current = true; queueMicrotask(() => { suppressSlideClick.current = false; }); } dragSlide.current = null; setSlideDropId(null); }} onLostPointerCapture={() => { dragSlide.current = null; setSlideDropId(null); }} onDragStart={event => event.preventDefault()}><StudioSlide doc={doc} slideIndex={i} width={narrow ? 56 : 120} /><span className="jg-editor__thumbnail-label"><b>{i + 1}</b>{item.role === 'cover' ? 'Cover' : item.role === 'back' ? 'Back' : TITLES[item.preset?.id] || 'Slide'}</span></button>)}</div>
        <div className="jg-editor__rail-actions"><Button icon="lucide:plus" disabled={slides.length >= 20} onClick={() => addSlide('event')}>Add slide</Button><div><Button icon={narrow ? 'lucide:chevron-left' : 'lucide:arrow-up'} aria-label="Move slide up" disabled={!slide || index === 0} onClick={() => commit(commands.reorderSlides(doc, slide.id, index - 1), 'Reorder slide')} /><Button icon={narrow ? 'lucide:chevron-right' : 'lucide:arrow-down'} aria-label="Move slide down" disabled={!slide || index === slides.length - 1} onClick={() => commit(commands.reorderSlides(doc, slide.id, index + 1), 'Reorder slide')} /><Button icon="lucide:copy" aria-label="Duplicate slide" disabled={!slide || slides.length >= 20} onClick={() => commit(commands.duplicateSlide(doc, slide.id), 'Duplicate slide')} /><Button icon="lucide:trash-2" aria-label="Delete slide" disabled={!slide} onClick={() => { commit(commands.deleteSlide(doc, slide.id), 'Delete slide'); setSelected([]); }} /></div></div>
      </aside>
      <main className="jg-editor__canvas" ref={canvasRef} data-testid="editor-canvas" onPointerDown={event => { if (event.target === event.currentTarget) setSelected([]); }}>
        {slide ? <div className="jg-editor__stage" ref={stageRef} data-testid="editor-stage" style={{ width: 1080 * zoom, height: 1350 * zoom }} onPointerDown={event => { if (!event.target.closest('[data-handle]')) begin(event); }} onDoubleClick={doubleClick} onDragStart={event => event.preventDefault()}>
          <StudioSlide doc={doc} width={1080 * zoom} slideIndex={index} editingId={editingId} onMeasure={onMeasure} onImageRequest={id => setImageTarget({ id, slideId: slide.id })} onEdit={(id, text, field = 'text') => { const pending = pendingText.current; pendingText.current = null; const next = pending && pending.id === id && pending.field === field ? pending.text : text; setEditingId(null); setMode('select'); if (next.length > LIMITS.maxTextLength) { setNotice('Text cannot exceed 8,000 characters. Your previous text was kept.'); return; } if (findElement(slide, id)?.[field] !== next) change(field === 'label' ? commands.setFieldLabel : commands.setSlideText, id, next); }} />
          {guides.map(guide => <span key={`${guide.axis}-${guide.at}`} className={`jg-editor__guide jg-editor__guide--${guide.axis}`} style={guide.axis === 'x' ? { left: guide.at * zoom } : { top: guide.at * zoom }} />)}
          {center && primary && <div data-testid="editor-chrome" className={`jg-editor__chrome${locked ? ' is-locked' : ''}`} style={bounds ? { left: bounds.x * zoom, top: bounds.y * zoom, width: bounds.width * zoom, height: bounds.height * zoom } : { left: (center.x - primary.frame.width / 2) * zoom, top: (center.y - primary.frame.height / 2) * zoom, width: primary.frame.width * zoom, height: primary.frame.height * zoom, transform: `rotate(${center.rotation}deg)` }}>
            {showHandles && HANDLES.map(handle => <button type="button" key={handle} data-handle={handle} aria-label={`Resize ${handle}`} className={`jg-editor__handle jg-editor__handle--${handle}`} onPointerDown={event => begin(event, 'resize', handle)} />)}
            {showHandles && <button type="button" data-handle="rotate" aria-label="Rotate" className="jg-editor__rotate" onPointerDown={event => begin(event, 'rotate', 'rotate')} />}
          </div>}
        </div> : <div className="jg-editor__empty" data-testid="empty-document"><Icon icon="lucide:panels-top-left" /><h2>No slides yet</h2><p>Add a slide and choose a template to begin.</p><Button className="is-primary" onClick={() => addSlide('cover')}>Add cover</Button></div>}
      </main>
      <aside className={`jg-editor__inspector${sheetOpen ? ' is-open' : ''}`} aria-label="Inspector"><nav className="jg-editor__tabs">{['design', 'templates', 'assets', 'layers'].map(tab => <Button key={tab} aria-pressed={panel === tab} aria-expanded={narrow ? sheetOpen && panel === tab : undefined} onClick={() => openPanel(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</Button>)}{sheetOpen ? <Button className="jg-editor__sheet-close" icon="lucide:chevron-down" aria-label="Close panel" onClick={() => setSheetOpen(false)} /> : null}</nav><div className="jg-editor__panel">
        {panel === 'design' && <>
          {overflowingCards.map(card => <section key={card.id} className="jg-editor__warning"><h2>Copy needs more room</h2><p>Text overlaps the details in this card. Resize the card or reduce its text size.</p><Button onClick={() => change(commands.growTextFrame, card.id, cardOverflow(card) + 24)}>Make card taller</Button><Button onClick={() => change(commands.fitCardText, card.id)}>Fit card text</Button></section>)}
          <section><h2>{primary ? commands.elementLabel(primary).replaceAll('-', ' ') : 'Slide design'}</h2>{!primary && <p>Select an object to move, resize, or style it. Double-click text to edit.</p>}
            {primary && <><div className="jg-editor__numbers">{['x', 'y', 'width', 'height'].map(field => <label key={field}>{field[0].toUpperCase() + field.slice(1)}<input aria-label={field} type="number" disabled={locked} value={Math.round(primary.frame[field])} onChange={event => change(commands.setNumericFrame, primaryId, { [field]: Number(event.target.value) })} /></label>)}<label>Rotation<input aria-label="rotation" type="number" disabled={locked} value={Math.round(primary.rotation || 0)} onChange={event => change(commands.setNumericFrame, primaryId, { rotation: Number(event.target.value) })} /></label><label className="jg-editor__check"><input type="checkbox" disabled={locked} checked={Boolean(primary.lockAspect)} onChange={event => change(commands.setNumericFrame, primaryId, { lockAspect: event.target.checked })} />Lock aspect</label></div>
              <div className="jg-editor__button-row">{commands.FRAME_RATIOS.map(ratio => <Button key={ratio.id} disabled={locked} onClick={() => change(commands.applyRatio, primaryId, ratio)}>{ratio.id}</Button>)}</div>
              <div className="jg-editor__button-row"><Button icon="lucide:bring-to-front" disabled={locked} onClick={() => change(commands.bringForward, selected)}>Forward</Button><Button icon="lucide:send-to-back" disabled={locked} onClick={() => change(commands.sendBackward, selected)}>Backward</Button></div>
              {primary.layout === 'flow' && <p className="jg-editor__hint">Dragging this field takes it out of the card’s flow. Undo restores its position.</p>}{locked && <p>Unlock this object or its parent in Layers to edit it.</p>}
            </>}
          </section>
          {paint && <section><h2>Text</h2>{primary.label != null && <label>Field label<input key={`${primary.id}-${primary.label}`} aria-label="Field label" defaultValue={primary.label} disabled={locked} onBlur={event => { if (primary.label !== event.target.value) change(commands.setFieldLabel, primaryId, event.target.value); }} /></label>}<label>Font<select aria-label="Font" disabled={locked} value={paint.fontFamily} onChange={event => change(commands.setTextStyle, primaryId, { fontFamily: event.target.value })}>{commands.EDITOR_FONTS.map(font => <option key={font}>{font}</option>)}</select></label><div className="jg-editor__numbers"><label>Size<input aria-label="Font size" type="number" min="8" max="600" value={paint.fontSize} disabled={locked} onChange={event => change(commands.setTextStyle, primaryId, { fontSizePx: Math.max(8, Math.min(600, Number(event.target.value))) })} /></label><label>Color<input aria-label="Text color" type="color" {...controlGesture} value={paint.color} disabled={locked} onChange={event => change(commands.setTextStyle, primaryId, { color: event.target.value })} /></label></div><div className="jg-editor__button-row">{['left', 'center', 'right'].map(align => <Button key={align} icon={`lucide:align-${align}`} aria-label={`Align ${align}`} aria-pressed={paint.textAlign === align} disabled={locked} onClick={() => change(commands.setTextStyle, primaryId, { textAlign: align })} />)}</div><Button disabled={locked} onClick={() => change(commands.removeTextField, primaryId)}>Remove field</Button>{primary.voice?.resolved != null && <Button disabled={locked} onClick={() => change(commands.resetField, primaryId)}>Reset to default</Button>}{overflow[primaryId] > 1 && <div className="jg-editor__warning"><p>Text extends beyond this frame. All copy is retained.</p><Button onClick={() => change(commands.growTextFrame, primaryId, overflow[primaryId] + 8)}>Make taller</Button><Button onClick={() => change(commands.setTextStyle, primaryId, { fontSizePx: Math.max(8, paint.fontSize * primary.frame.height / (primary.frame.height + overflow[primaryId])) })}>Fit text</Button></div>}</section>}
          {primary?.kind === 'image' && <section><h2>Photograph</h2><Button icon="lucide:crop" disabled={locked} aria-pressed={mode === 'crop'} onClick={() => setMode(mode === 'crop' ? 'select' : 'crop')}>{mode === 'crop' ? 'Done cropping' : 'Crop photograph'}</Button>{mode === 'crop' && <><p>Drag the photograph to change its focal point.</p><label>Crop zoom<input aria-label="Crop zoom" type="range" {...controlGesture} min="1" max="8" step=".05" value={primary.crop?.scale || 1} onChange={event => change(commands.setCropOn, primaryId, { scale: Number(event.target.value) })} /></label></>}<Button disabled={uploading || locked} onClick={() => setImageTarget({ id: primaryId, slideId: slide.id })}>Replace image</Button><PhotoCredit asset={primary.asset || {}} /><label>Credit<input key={`${primaryId}-${primary.asset?.credit || ''}`} aria-label="Credit" defaultValue={primary.asset?.credit || ''} disabled={locked} onBlur={event => { if ((primary.asset?.credit || '') !== event.target.value) change(commands.replaceImageAsset, primaryId, { credit: event.target.value }); }} /></label><p>Credits are saved with the image and stay off the artwork.</p></section>}
          <section><h2>Background</h2><label>Color<input aria-label="Background color" type="color" {...controlGesture} value={slide?.background?.color || '#faf6ef'} disabled={!slide} onChange={event => change(commands.setBackgroundFill, event.target.value)} /></label><Button disabled={!slide || uploading} onClick={() => setImageTarget({ background: true, slideId: slide.id })}>Background image</Button>{slide?.background?.kind === 'image' && <><Button onClick={() => setMode(mode === 'background-crop' ? 'select' : 'background-crop')}>{mode === 'background-crop' ? 'Done cropping' : 'Crop background'}</Button>{mode === 'background-crop' && <label>Crop zoom<input type="range" {...controlGesture} aria-label="Background crop zoom" min="1" max="8" step=".05" value={slide.background.crop?.scale || 1} onChange={event => change(commands.setBackgroundCrop, { ...slide.background.crop, scale: Number(event.target.value) })} /></label>}<Button onClick={() => change(commands.detachBackground)}>Detach background</Button><PhotoCredit asset={slide.background.asset || {}} /></>}</section>
          {allElements.some(element => element.presence === 'removed') && <section><h2>Removed fields</h2>{allElements.filter(element => element.presence === 'removed').map(element => <Button key={element.id} onClick={() => change(commands.restoreField, element.id)}>Restore {element.role?.replace('event-', '').replaceAll('-', ' ') || 'field'}</Button>)}</section>}
        </>}
        {panel === 'templates' && <><section><h2>Templates</h2><p>Choose a starting composition. Your copy, photos, and added objects are kept.</p>{slide?.preset && <div className="jg-editor__button-row"><Button onClick={() => applyTemplate(slide.preset.id, slide.preset.variation)}>Reset layout</Button>{slide.role === 'cover' && <Button icon="lucide:shuffle" onClick={() => applyTemplate(slide.preset.id, (slide.preset.variation || 1) % 3 + 1)}>Shuffle</Button>}</div>}</section>
          <div className="jg-editor__template-grid">{(slide?.role === 'cover' ? COVER_FAMILIES.flatMap(id => [1, 2, 3].map(variation => ({ id, variation }))) : slide?.role === 'back' ? BACK_PRESETS.map((id, index) => ({ id, variation: index + 1 })) : EVENT_PRESETS.map(id => ({ id, variation: 1 }))).map(({ id, variation }) => {
            const preview = commands.slidesOf(doc).length ? applyPreset(slide, id, variation) : null;
            return <button type="button" aria-label={`${TITLES[id]}${slide?.role === 'cover' ? ` variation ${variation}` : ''}`} key={`${id}-${variation}`} disabled={!slide} className={slide?.preset?.id === id && slide?.preset?.variation === variation ? 'is-active' : ''} onClick={() => applyTemplate(id, variation)}><StudioSlide doc={preview} width={110} /><span>{TITLES[id]}{slide?.role === 'cover' ? ` · ${variation}` : ''}</span></button>;
          })}</div><Button disabled={slides.length >= 20} onClick={() => addSlide('cover')}>Add cover</Button><Button disabled={slides.length >= 20} onClick={() => addSlide('back')}>Add back</Button></>}
        {panel === 'assets' && <><section><h2>Images & stickers</h2><Button disabled={!slide} onClick={() => setImageTarget({ slideId: slide.id })}>Browse photographs</Button><FileButton label="Upload image" disabled={!slide || uploading} onFile={file => { const sid = slide.id; upload(file, asset => commit(commands.insertUploadedImage(docRef.current, sid, asset), 'Insert image')); }} /><p>PNG, JPEG, WebP or GIF, up to 8 MB.</p><div className="jg-editor__button-row"><Button disabled={!slide} onClick={() => change(commands.insertSticker, 'light')}>Light sticker</Button><Button disabled={!slide} onClick={() => change(commands.insertSticker, 'dark')}>Dark sticker</Button></div></section><h2>Account images</h2><div className="jg-editor__asset-grid">{assets.filter(asset => asset.src).map(asset => <button type="button" key={asset.id || asset.key || asset.src} disabled={!slide} onClick={() => change(commands.insertUploadedImage, asset)}><img src={asset.src} alt="" /><span>{asset.alt || 'Saved photograph'}</span></button>)}</div>{!assets.length && <p>Your uploaded images will appear here.</p>}</>}
        {panel === 'layers' && <section><h2>Layers</h2><p>Select a card or group to move it as a whole.</p>{[...allElements].reverse().map(element => <div key={element.id} className="jg-editor__layer"><Button aria-pressed={selected.includes(element.id)} onClick={event => { setSelected(event.shiftKey ? [...new Set([...selected, element.id])] : [element.id]); setMode('select'); }}>{element.kind === 'card' ? '▧ ' : ''}{element.name || element.role?.replaceAll('-', ' ') || element.kind}</Button><Button icon={element.locked ? 'lucide:lock' : 'lucide:lock-open'} aria-label={`${element.locked ? 'Unlock' : 'Lock'} ${element.role || element.kind}`} onClick={() => change(commands.setLocked, [element.id], !element.locked)} /></div>)}</section>}
      </div></aside>
    </div>
    <footer className={`jg-editor__footer${narrow ? ' is-compact' : ''}`}><span>{notice || (mode === 'crop' || mode === 'background-crop' ? 'Crop mode · Drag to pan · Escape to finish' : 'Drag to move · Shift-click to select more · Alt to bypass snapping')}</span><div className="jg-editor__photo-credits">{assets.filter(asset => asset.provider === 'unsplash').map(asset => <PhotoCredit key={asset.id || asset.src} asset={asset} />)}</div><span>1080 × 1350 · 4:5</span></footer>
    {imageTarget && <StudioImagePicker accountId={issue.accountId} events={eventImages(doc)} assets={accountAssets} onChoose={chooseImage} onUpload={file => upload(file, chooseImage)} onClose={() => setImageTarget(null)} />}
    {curationId && account && <div className="jg-editor__curation" role="dialog" aria-modal="true" aria-label="Edit selection"><PivotCarouselCurationWorkspace account={account} draftId={curationId} issue={{ id: issue._id || issue.id, revision: revisionRef.current, ...doc.editorial, document: doc }} onDraftId={setCurationId} staged onApplied={data => { commit({ ...data.document, editorial: { curation: data.curation, sources: data.sources } }, 'Edit selection'); setCurationId(null); setNotice('Selection updated locally. Save to keep it.'); }} onCancel={() => setCurationId(null)} /></div>}
    {recovery && <div className="jg-editor__banner" role="status"><p>This browser has newer unsaved edits than the saved issue. Restoring them does not save to the server.</p><Button onClick={acceptRecovery}>Restore local edits</Button><Button onClick={dismissRecovery}>Keep saved issue</Button></div>}
    {conflict && <div className="jg-editor__banner" role="alert"><p>{conflict.message} Both copies are kept. Autosave is paused.</p><Button onClick={reloadServer}>Reload saved issue</Button><Button onClick={() => setCompareOpen(true)} disabled={!conflict.serverIssue?.document}>Compare</Button><Button onClick={saveCopy} disabled={!onSaveCopy}>Save as a new issue</Button></div>}
    {compareOpen && comparison && <div className="jg-editor__curation" role="dialog" aria-modal="true" aria-label="Compare versions"><h2>This browser and the saved issue</h2><p>{comparison.localSlides} slides here, {comparison.serverSlides} slides saved. Revision {conflict.storedRevision} is on the server.</p>{comparison.changes.map(change => <p key={change.id}>{change.role}: {change.local ?? 'removed'} → {change.server ?? 'not on server'}</p>)}{comparison.hiddenChanges > 0 && <p>{comparison.hiddenChanges} more differences are not listed.</p>}<Button onClick={() => setCompareOpen(false)}>Close</Button></div>}
    {exportOpen && <div className="jg-editor__curation" role="dialog" aria-modal="true" aria-label="Export"><CarouselExportChoice tenantKey={issue.tenantKey || issue.ownerTenantKey} deckId={issue._id || issue.id} onRelay={() => { setExportOpen(false); onExport?.(); }} onClose={() => setExportOpen(false)} /></div>}
    {checkpointsOpen && <div className="jg-editor__curation" role="dialog" aria-modal="true" aria-label="Checkpoints"><h2>Checkpoints</h2><p>A checkpoint is a named copy. Restoring it saves a new revision and leaves the checkpoint unchanged.</p><label>Name<input aria-label="Checkpoint name" value={checkpointName} onChange={event => setCheckpointName(event.target.value)} /></label><Button onClick={saveCheckpoint} disabled={!checkpointName.trim() || saveState === 'conflict'}>Save checkpoint</Button><ul>{checkpoints.map(checkpoint => <li key={checkpoint.id}>{checkpoint.name} · revision {checkpoint.headRevision} <Button onClick={() => restoreCheckpoint(checkpoint)}>Restore as new revision</Button></li>)}</ul><Button onClick={() => setCheckpointsOpen(false)}>Close</Button></div>}
  </div>;
}
