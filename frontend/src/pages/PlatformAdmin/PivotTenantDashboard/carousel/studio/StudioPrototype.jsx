import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import StudioSlide from './StudioSlide';
import { createPhotoNoteDocument } from './photoNoteFixture';
import {
  SLIDE_WIDTH,
  commitTransaction,
  createHistory,
  findElement,
  moveElement,
  readTextOverflow,
  redo,
  removeField,
  resizeFrame,
  rotateElement,
  setCrop,
  setText,
  undo,
} from './studioDocument';
import './StudioPrototype.scss';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function useHistory(initial) {
  const [history, setHistory] = useState(() => createHistory(initial));
  const gesture = useRef(null);
  return {
    doc: history.present,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    begin(label) {
      gesture.current = { label, start: history.present };
    },
    preview(next) {
      setHistory((current) => ({ ...current, present: next }));
    },
    commit(next, label) {
      const start = gesture.current?.start || history.present;
      const named = gesture.current?.label || label;
      gesture.current = null;
      setHistory(commitTransaction({ ...history, present: start }, next, named));
    },
    undo() { setHistory((current) => undo(current)); },
    redo() { setHistory((current) => redo(current)); },
  };
}

export default function StudioPrototype() {
  const editor = useHistory(createPhotoNoteDocument());
  const [zoom, setZoom] = useState(0.42);
  const [selectedId, setSelectedId] = useState('photo');
  const [mode, setMode] = useState('transform');
  const [editingId, setEditingId] = useState(null);
  const [overflow, setOverflow] = useState(null);
  const drag = useRef(null);
  const working = useRef(null);
  const stageRef = useRef(null);
  const zoomRef = useRef(zoom);
  const modeRef = useRef(mode);
  zoomRef.current = zoom;
  modeRef.current = mode;
  const [chrome, setChrome] = useState(null);
  const doc = editor.doc;
  const selected = findElement(doc, selectedId);
  const editorWidth = Math.round(SLIDE_WIDTH * zoom);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const node = stage?.querySelector(`[data-export-root] [data-element-id="${selectedId}"]`);
    if (!stage || !node) {
      setChrome(null);
      return;
    }
    const stageBox = stage.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    setChrome({
      left: box.left - stageBox.left,
      top: box.top - stageBox.top,
      width: box.width,
      height: box.height,
    });
  }, [doc, selectedId, zoom, mode]);

  const applyGesture = (active, dx, dy) => {
    const current = working.current;
    if (active.kind === 'move') return moveElement(current, active.id, dx, dy);
    if (active.kind === 'crop') {
      const crop = findElement(current, 'photo').crop;
      return setCrop(current, 'photo', {
        ...crop,
        focalX: crop.focalX - dx / 400,
        focalY: crop.focalY - dy / 400,
      });
    }
    if (active.kind === 'resize') {
      const frame = { ...findElement(current, active.id).frame };
      if (active.edge.includes('e')) frame.width += dx;
      if (active.edge.includes('s')) frame.height += dy;
      if (active.edge.includes('w')) { frame.x += dx; frame.width -= dx; }
      if (active.edge.includes('n')) { frame.y += dy; frame.height -= dy; }
      return resizeFrame(current, active.id, frame);
    }
    const element = findElement(current, active.id);
    return rotateElement(current, active.id, element.rotation + dx / 4);
  };

  const onPointerDown = (event, id, kind) => {
    if (event.target.closest('[data-handle]') || event.target.isContentEditable) return;
    event.stopPropagation();
    setSelectedId(id);
    if (mode === 'crop' && id !== 'photo') setMode('transform');
    working.current = doc;
    drag.current = {
      id,
      kind,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    editor.begin(kind === 'crop' ? 'Crop' : 'Move');
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    const active = drag.current;
    if (!active) return;
    const dx = (event.clientX - active.x) / zoomRef.current;
    const dy = (event.clientY - active.y) / zoomRef.current;
    if (!active.moved && active.kind === 'move' && Math.hypot(dx, dy) < 3) return;
    active.moved = true;
    active.x = event.clientX;
    active.y = event.clientY;
    working.current = applyGesture(active, dx, dy);
    editor.preview(working.current);
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    const moved = drag.current.moved;
    const next = working.current;
    drag.current = null;
    if (moved) editor.commit(next, 'Edit');
  };

  const startHandle = (event, kind, edge) => {
    event.stopPropagation();
    drag.current = {
      id: selectedId,
      kind,
      edge,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    working.current = doc;
    editor.begin(kind === 'resize' ? 'Resize frame' : 'Rotate');
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const editText = (id, text) => {
    const element = findElement(doc, id);
    if (!element || element.kind !== 'text' || text === element.text) {
      setEditingId(null);
      return;
    }
    editor.commit(setText(doc, id, text), 'Edit text');
    setEditingId(null);
    const node = stageRef.current?.querySelector(`[data-element-id="${id}"]`);
    setOverflow(readTextOverflow(node));
  };

  const note = useMemo(() => {
    if (!selected) return '';
    if (mode === 'crop' && selected.kind === 'image') {
      return 'Crop mode moves the picture inside the frame. The frame size stays put.';
    }
    if (selected.kind === 'card') {
      return 'Moving the card moves its outer frame. Flow children stay in the column and reflow.';
    }
    if (selected.layout === 'flow') {
      return 'Dragging this field detaches it from the card. The other fields reflow without it.';
    }
    if (selected.kind === 'image') {
      return 'Resize changes the frame. Double-click, or use Crop, to pan the photograph inside it.';
    }
    return 'Drag to move. The rotation handle and edges change the frame, not the crop.';
  }, [mode, selected]);

  return (
    <div className="jg-studio" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <header className="jg-studio__bar">
        <div>
          <p>Carousel studio spike · Round 06 Photo note</p>
          <h1>One approved slide, directly editable.</h1>
        </div>
        <div className="jg-studio__tools">
          <button type="button" onClick={editor.undo} disabled={!editor.canUndo}>Undo</button>
          <button type="button" onClick={editor.redo} disabled={!editor.canRedo}>Redo</button>
          <button type="button" onClick={() => setMode(mode === 'crop' ? 'transform' : 'crop')}>
            {mode === 'crop' ? 'Leave crop' : 'Crop photo'}
          </button>
          <button type="button" onClick={() => editor.commit(removeField(doc, 'description'), 'Remove description')}>
            Remove description
          </button>
          <label>Zoom <input type="range" min="0.28" max="1" step="0.02" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        </div>
      </header>
      <div className="jg-studio__workspace">
        <div className="jg-studio__stage" data-testid="editor-stage">
          <div
            ref={stageRef}
            className="jg-studio__scaled"
            style={{ width: editorWidth, height: editorWidth * (1350 / 1080) }}
            onPointerDown={(event) => {
              if (event.target.closest('[data-handle]')) return;
              const id = event.target.closest('[data-element-id]')?.getAttribute('data-element-id');
              if (!id) { setSelectedId(null); return; }
              if (event.detail === 2) {
                const element = findElement(doc, id);
                if (element?.kind === 'text') setEditingId(id);
                if (element?.kind === 'image') setMode('crop');
              }
              const kind = modeRef.current === 'crop' && id === 'photo' ? 'crop' : 'move';
              onPointerDown(event, id, kind);
            }}
          >
            <StudioSlide doc={doc} width={editorWidth} editingId={editingId} onEdit={editText} />
            {chrome && (
              <div className="jg-studio__chrome" data-testid="editor-chrome" style={chrome}>
                {mode === 'crop' && selected.kind === 'image' ? (
                  <span className="jg-studio__crop">Crop</span>
                ) : (
                  HANDLES.map((edge) => (
                    <button
                      key={edge}
                      type="button"
                      data-handle={edge}
                      className={`jg-studio__handle jg-studio__handle--${edge}`}
                      aria-label={`Resize ${edge}`}
                      onPointerDown={(event) => startHandle(event, 'resize', edge)}
                    />
                  ))
                )}
                {mode !== 'crop' && (
                  <button
                    type="button"
                    className="jg-studio__rotate"
                    aria-label="Rotate"
                    data-handle="rotate"
                    onPointerDown={(event) => startHandle(event, 'rotate')}
                  />
                )}
              </div>
            )}
          </div>
        </div>
        <aside className="jg-studio__side">
          <section>
            <h2>Export surface</h2>
            <p>Same renderer at 1080 × 1350, scaled to fit. Handles are not in this tree.</p>
            <div className="jg-studio__export" data-testid="export-surface">
              <StudioSlide doc={doc} width={280} />
            </div>
          </section>
          <section>
            <h2>{selected?.name || 'Nothing selected'}</h2>
            <p>{note}</p>
            {selected?.frame && (
              <dl>
                <div><dt>Frame</dt><dd>{Math.round(selected.frame.width)} × {Math.round(selected.frame.height)} at {Math.round(selected.frame.x)}, {Math.round(selected.frame.y)}</dd></div>
                <div><dt>Rotation</dt><dd>{Math.round(selected.rotation || 0)}°</dd></div>
                {selected.crop && <div><dt>Crop</dt><dd>{selected.crop.focalX.toFixed(2)}, {selected.crop.focalY.toFixed(2)} · {selected.crop.scale.toFixed(2)}×</dd></div>}
                {selected.layout && <div><dt>Placement</dt><dd>{selected.layout}{selected.presence ? ` · ${selected.presence}` : ''}</dd></div>}
              </dl>
            )}
            {overflow?.overflow && <p className="jg-studio__overflow">Text overflows by {Math.round(overflow.overflowPx)}px. Resize the card or edit the copy. Nothing is trimmed.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
