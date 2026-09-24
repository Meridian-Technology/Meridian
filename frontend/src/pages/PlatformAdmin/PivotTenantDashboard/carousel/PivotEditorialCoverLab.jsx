import React, { useEffect, useRef, useState } from 'react';
import EditorialCoverStudy from './EditorialCoverStudy';
import { EDITORIAL_COVERS, EDITORIAL_DIRECTIONS, EDITORIAL_GRID_ORDER } from './coverLabEditorialData';
import './PivotEditorialCoverLab.scss';
import JustGoCoverStudy from './JustGoCoverStudy';
import { JUSTGO_COVERS, JUSTGO_DIRECTIONS, JUSTGO_GRID_ORDER } from './coverLabJustGoData';
import CutoutCoverStudy from './CutoutCoverStudy';
import CenteredCutoutCoverStudy from './CenteredCutoutCoverStudy';
import { CUTOUT_COVERS, CUTOUT_DIRECTIONS, CUTOUT_GRID_ORDER } from './coverLabCutoutData';

const ROUNDS = {
  centered: {
    covers: CUTOUT_COVERS, directions: CUTOUT_DIRECTIONS, order: CUTOUT_GRID_ORDER, Study: CenteredCutoutCoverStudy,
    number: '05', className: ' jg-cover-lab--justgo jg-cover-lab--cutouts', title: 'A little closer.', subtitle: 'Room at the edges.',
    intro: 'The same covers, gathered inward.', heading: 'The same family. Cleaner edges.',
    description: 'The artwork, colour, and central headlines carry over from round 04. The larger contour-cut logo sits lower in the artwork, off-centre; the city sits beneath the composition. Series labels and issue numbers are omitted. Full-bleed photography stays full bleed.',
  },
  editorial: {
    covers: EDITORIAL_COVERS, directions: EDITORIAL_DIRECTIONS, order: EDITORIAL_GRID_ORDER, Study: EditorialCoverStudy,
    number: '02', className: '', title: 'Worth going.', subtitle: 'Worth missing.',
    intro: 'A little further from the rulebook.', heading: 'A story on the cover. A signature across the grid.',
    description: 'The city edit ties upcoming local events to a theme. Sorry you missed it looks back at interesting events worldwide. Each direction speaks both languages; the imagery and typesetting change with the story.',
  },
  justgo: {
    covers: JUSTGO_COVERS, directions: JUSTGO_DIRECTIONS, order: JUSTGO_GRID_ORDER, Study: JustGoCoverStudy,
    number: '03', className: ' jg-cover-lab--justgo', title: 'A little less proper.', subtitle: 'A lot more just go.',
    intro: 'The scrappier side of the family.', heading: 'Same roots. Less restraint.',
    description: 'The actual Just Go type family, pushed into its wilder cuts. The house burst, enlarged. Cut paper, hot color, imperfect edges. Each direction carries both themed city edits and sorry you missed it.',
  },
  cutouts: {
    covers: CUTOUT_COVERS, directions: CUTOUT_DIRECTIONS, order: CUTOUT_GRID_ORDER, Study: CutoutCoverStudy,
    number: '04', className: ' jg-cover-lab--justgo jg-cover-lab--cutouts', title: 'Full colour.', subtitle: 'Good company.',
    intro: 'Close headlines. Strong colour. A little texture.', heading: 'Three compositions. One publication.',
    description: 'Shared lettering, orange-and-cream colours, photo treatment, and central headline placement tie the three compositions together. Mix full-photo covers, cutouts, and print collages in one feed.',
  },
};

export default function PivotEditorialCoverLab({ tenantKey = 'preview', round = 'editorial' }) {
  const config = ROUNDS[round] || ROUNDS.editorial;
  const { covers: COVERS, directions: DIRECTIONS, order: GRID_ORDER, Study, number: roundNumber } = config;
  const [direction, setDirection] = useState('all');
  const [magazine, setMagazine] = useState('all');
  const [view, setView] = useState(['cutouts', 'centered'].includes(round) ? 'grid' : 'gallery');
  const [selected, setSelected] = useState(null);
  const [gridOrder, setGridOrder] = useState(GRID_ORDER);
  const [shuffleCount, setShuffleCount] = useState(0);
  const [shortlist, setShortlist] = useState([]);
  const [notice, setNotice] = useState('');
  const dialog = useRef(null);
  const storageKey = `justgo-cover-lab-v${Number(roundNumber)}:${tenantKey}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
      setShortlist(Array.isArray(saved) ? saved.filter((id) => COVERS.some((cover) => cover.id === id)) : []);
    } catch { setShortlist([]); }
  }, [storageKey, COVERS]);
  useEffect(() => { if (selected && !dialog.current?.open) dialog.current?.showModal(); }, [selected]);
  const toggleShortlist = (id) => {
    const next = shortlist.includes(id) ? shortlist.filter((value) => value !== id) : [...shortlist, id];
    setShortlist(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { setNotice('Shortlist saved for this visit only; browser storage is unavailable.'); }
  };
  const close = () => { dialog.current?.close(); setSelected(null); };
  const active = DIRECTIONS.find((item) => item.id === direction);
  const selectedDirection = DIRECTIONS.find((item) => item.id === selected?.direction);
  const covers = (view === 'grid' ? gridOrder.map((id) => COVERS.find((cover) => cover.id === id)) : COVERS)
    .filter((cover) => (direction === 'all' || (direction === 'saved' ? shortlist.includes(cover.id) : cover.direction === direction)) && (magazine === 'all' || cover.story.kind === magazine));
  const shuffleGrid = () => {
    const visibleIds = covers.map((cover) => cover.id);
    if (visibleIds.length < 2) return;
    const shuffled = [...visibleIds];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // A click always produces a different visible arrangement, even for two covers.
    if (shuffled.every((id, i) => id === visibleIds[i])) shuffled.push(shuffled.shift());
    const visible = new Set(visibleIds);
    let index = 0;
    setGridOrder(gridOrder.map((id) => visible.has(id) ? shuffled[index++] : id));
    setShuffleCount((count) => count + 1);
  };
  const resetGrid = () => { setGridOrder(GRID_ORDER); setShuffleCount(0); };
  const navigatePreview = (offset) => setSelected(covers[(covers.findIndex((cover) => cover.id === selected.id) + covers.length + offset) % covers.length]);

  return <section className={`jg-cover-lab jg-cover-lab--editorial${config.className}`} aria-label={`Cover studies round ${roundNumber}`}><div className="jg-cover-lab__inner">
    <header>
      <div className="jg-cover-lab__eyebrow"><span>JUST GO / EDITORIAL EXPERIMENTS</span><span>ROUND {roundNumber} · {COVERS.length} COVERS</span></div>
      <div className="jg-cover-lab__intro"><h1>{config.title}<br /><em>{config.subtitle}</em></h1><div><p>Two magazines. One point of view.<br />{config.intro}</p><span>The city edit × sorry you missed it</span></div></div>
    </header>
    <div className="jg-cover-lab__toolbar"><div className="jg-cover-lab__filters" role="group" aria-label="Editorial direction">
      <button type="button" aria-pressed={direction === 'all'} onClick={() => setDirection('all')}>All directions</button>
      {DIRECTIONS.map((item) => <button key={item.id} type="button" aria-pressed={direction === item.id} onClick={() => setDirection(item.id)}>{item.id.toUpperCase()} / {item.name}</button>)}
      <button type="button" aria-pressed={direction === 'saved'} onClick={() => setDirection('saved')}>Shortlist <sup>{shortlist.length}</sup></button>
    </div><div className="jg-cover-lab__views" role="group" aria-label="Preview layout"><button type="button" aria-pressed={view === 'gallery'} onClick={() => setView('gallery')}>Compare</button><button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Social grid</button></div></div>
    <div className="jge-magazines" role="group" aria-label="Magazine type"><span>SHOW</span>{[{id:'all', name:'Both magazines'}, {id:'city', name:'The city edit'}, {id:'missed', name:'Sorry you missed it'}].map((item) => <button key={item.id} type="button" aria-pressed={magazine === item.id} onClick={() => setMagazine(item.id)}>{item.name}</button>)}</div>
    <div className="jg-cover-lab__context"><div><h2>{active?.descriptor || (direction === 'saved' ? 'Your second looks.' : config.heading)}</h2><p>{active?.description || config.description}</p></div><span>{active?.rule || (['cutouts', 'centered'].includes(round) && view === 'grid' ? 'Shuffle the covers to try a different feed arrangement. Filters let you mix only the covers you want to compare. “The city edit” is a working series name.' : 'Compare across: three takes on the same issue. Read down: each system across different issues. “The city edit” is a working series name.')}</span></div>
    {view === 'gallery' && direction === 'all' && <div className="jge-column-labels">{DIRECTIONS.map((item) => <div key={item.id}><b>{item.id.toUpperCase()}</b> {item.name}</div>)}</div>}
    {view === 'grid' && <div className="jge-grid-controls"><div className="jge-grid-note"><div>{active ? `${active.name} / an issue-by-issue grid` : 'A mixed art-direction grid'}<span>4:5 covers · 3:4 thumbnail crop</span></div><div className="jge-grid-actions"><button type="button" onClick={shuffleGrid} disabled={covers.length < 2}>Shuffle grid</button><button type="button" onClick={resetGrid} disabled={!shuffleCount}>Reset order</button></div></div><p className="jge-grid-status" role="status">{shuffleCount ? `Shuffle ${shuffleCount} · ${covers.length} covers` : `${covers.length} covers · curated order`}</p></div>}
    <div className={`jg-cover-lab__gallery${view === 'grid' ? ' jg-cover-lab__gallery--grid' : ''}`}>
      {covers.map((cover) => <article key={cover.id} className="jg-cover-lab__study"><button type="button" className="jg-cover-lab__open" aria-label={`Preview ${cover.id.toUpperCase()}: ${cover.name}`} onClick={() => setSelected(cover)}><Study cover={cover} />{shortlist.includes(cover.id) && <span className="jg-cover-lab__saved-mark">♥</span>}</button>{view === 'gallery' && <div className="jg-cover-lab__caption"><div><b>{cover.id.toUpperCase()}</b><span>{cover.name}</span></div><button type="button" aria-label={`${shortlist.includes(cover.id) ? 'Remove' : 'Shortlist'} ${cover.id.toUpperCase()}`} aria-pressed={shortlist.includes(cover.id)} onClick={() => toggleShortlist(cover.id)}>{shortlist.includes(cover.id) ? '♥' : '♡'}</button></div>}</article>)}
    </div>
    {!covers.length && <p className="jg-cover-lab__empty">No covers in this selection. Choose another magazine or shortlist a cover.</p>}
    <footer className="jge-credits"><p>Illustrative issue concepts, not verified event recaps or live listings. Stock photography sets the mood; actual “sorry you missed it” issues would use imagery from the featured events.</p><div>Photography: <a href={COVERS[0].story.source} target="_blank" rel="noreferrer">Paul Pastourmatzis</a>, <a href={COVERS[3].story.source} target="_blank" rel="noreferrer">foto DIAL</a>, <a href={COVERS[6].story.source} target="_blank" rel="noreferrer">benjamin lehman</a> / Unsplash.</div></footer>
    {notice && <p role="status">{notice}</p>}
  </div>
    <dialog ref={dialog} className="jg-cover-lab__dialog" aria-label={selected ? `Editorial cover ${selected.id.toUpperCase()}` : 'Editorial cover'} onCancel={close} onClick={(event) => { if (event.target === dialog.current) close(); }}>
      {selected && <div className="jg-cover-lab__preview"><div className="jg-cover-lab__preview-art"><Study cover={selected} /></div><div className="jg-cover-lab__preview-info"><button type="button" className="jg-cover-lab__close" onClick={close}>Close ×</button><span>ROUND {roundNumber} / {selected.id.toUpperCase()}</span><h2>{selectedDirection.name}</h2><h3>{selected.name}</h3><p>{selectedDirection.description}</p><button type="button" className="jg-cover-lab__save" aria-pressed={shortlist.includes(selected.id)} onClick={() => toggleShortlist(selected.id)}>{shortlist.includes(selected.id) ? '♥ Shortlisted — remove' : '♡ Add to shortlist'}</button><div className="jg-cover-lab__preview-nav"><button type="button" disabled={covers.length < 2} onClick={() => navigatePreview(-1)}>← Previous</button><button type="button" disabled={covers.length < 2} onClick={() => navigatePreview(1)}>Next →</button></div><small>Illustrative issue concept.<br />Photo: <a href={selected.story.source} target="_blank" rel="noreferrer">{selected.story.credit} / Unsplash</a></small></div></div>}
    </dialog>
  </section>;
}
