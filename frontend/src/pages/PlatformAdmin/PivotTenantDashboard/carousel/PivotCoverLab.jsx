import React, { useEffect, useRef, useState } from 'react';
import court from '../../../../assets/pivot/pivot-hero-court.jpg';
import coast from '../../../../assets/pivot/pivot-hero-coast.jpg';
import canopy from '../../../../assets/pivot/pivot-hero-canopy.webp';
import wordmark from '../../../../assets/pivot/just-go-wordmark-dark.svg';
import './PivotCoverLab.scss';
import PivotEditorialCoverLab from './PivotEditorialCoverLab';
import PivotEventSlideLab from './PivotEventSlideLab';

const DIRECTIONS = [
  { id: 'a', name: 'Big talk', descriptor: 'The type is the personality.', description: 'Les Flos comes off the label and takes over the page. Short, conversational headlines; unapologetic orange; a photograph used as punctuation. The most ownable direction for Just Go.', rule: 'Rotate between a loud color field, a paper cover, and a blue interruption. Keep the words short.', variants: ['The invitation', 'The interruption', 'The reply'] },
  { id: 'b', name: 'Out there', descriptor: 'A feeling before an itinerary.', description: 'Real photographs get room to breathe. Oversized, off-center lettering responds to the image instead of sitting in a fixed title box. Warm, immediate, a little restless.', rule: 'Alternate people, open landscapes, and close crops. Move the headline with the photograph; keep its voice familiar.', variants: ['In motion', 'The detour', 'No agenda'] },
  { id: 'c', name: 'Local paper', descriptor: 'A small publication with a point of view.', description: 'An oversized masthead, useful little captions, and decisive crops. More city journal than event flyer. Cream, ink, and orange hold together changing page structures.', rule: 'Follow a packed front page with an image-led feature, then a quieter after-hours edition.', variants: ['The front page', 'The field note', 'After hours'] },
];
const COVERS = DIRECTIONS.flatMap((direction) => direction.variants.map((name, variant) => ({ id: `${direction.id}${variant + 1}`, direction: direction.id, variant, name })));
const MIXED_ORDER = ['a1', 'b1', 'c1', 'b2', 'c2', 'a2', 'c3', 'a3', 'b3'];

function Mark({ light = false }) {
  return <img className={`jgc-mark${light ? ' jgc-mark--light' : ''}`} src={wordmark} alt="just go" />;
}
function Photo({ src, className = '' }) {
  return <img className={`jgc-photo ${className}`} src={src} alt="" draggable={false} />;
}
function Footer({ left = 'san francisco', right = 'see you out there.' }) {
  return <div className="jgc-folio"><span>{left}</span><span>{right}</span></div>;
}

/** Self-contained 4:5 studies; deliberately separate from the production deck renderer. */
export function CoverStudy({ cover }) {
  return (
    <div className={`jgc-cover jgc-cover--${cover.id}`}>
      {cover.id === 'a1' && <>
        <div className="jgc-top"><Mark /><span>your week, with better plans.</span></div>
        <div className="jgc-a1-title">good<br /><span>out</span><br />there.</div>
        <Photo src={court} className="jgc-a1-photo" />
        <p className="jgc-a1-note">turns out,<br />it’s pretty</p>
        <Footer left="sf / september 23–27" right="the weekly shortlist ↗" />
      </>}
      {cover.id === 'a2' && <>
        <div className="jgc-top"><Mark /><span>a very good reason to leave.</span></div>
        <p className="jgc-a2-small">this weekend’s forecast:</p>
        <div className="jgc-a2-title">a little<br /><span>less</span><br />indoors.</div>
        <Photo src={coast} className="jgc-a2-photo" />
        <span className="jgc-a2-aside">bring a layer.</span>
        <Footer left="sf / the weekend edit" right="five places to start ↗" />
      </>}
      {cover.id === 'a3' && <>
        <div className="jgc-top"><Mark /><span>for the group chat.</span></div>
        <div className="jgc-a3-title">“so,<br />what’s<br /><span>the</span><br />plan?”</div>
        <p className="jgc-a3-note">glad you asked.</p>
        <Footer left="sf / september 23–27" right="we found a few ↗" />
      </>}
      {cover.id === 'b1' && <>
        <Photo src={court} />
        <div className="jgc-top"><Mark light /><span>san francisco / this week</span></div>
        <div className="jgc-b1-title">see you<br /><span>out</span><br /><em>there.</em></div>
        <div className="jgc-photo-caption">a court. a friend.<br />the rest of the afternoon.</div>
        <Footer left="the after-work edit" right="just go ↗" />
      </>}
      {cover.id === 'b2' && <>
        <Photo src={coast} />
        <div className="jgc-top"><Mark /><span>no rush today.</span></div>
        <div className="jgc-b2-title">take the<br /><em>long</em><br />way.</div>
        <span className="jgc-b2-side">a few good detours in sf</span>
        <Footer left="your sunday, sorted." right="swipe for the spots ↗" />
      </>}
      {cover.id === 'b3' && <>
        <Photo src={canopy} />
        <div className="jgc-top"><Mark light /><span>the unplanned afternoon.</span></div>
        <div className="jgc-b3-title">nothing<br />planned?<br /><span>perfect.</span></div>
        <div className="jgc-photo-caption">leave a little room<br />for something good.</div>
        <Footer left="sf / this weekend" right="start here ↗" />
      </>}
      {cover.id === 'c1' && <>
        <div className="jgc-paper-meta"><span>san francisco</span><span>vol. 01 / this week</span></div>
        <div className="jgc-paper-mast">going<br /><span>places.</span><Mark /></div>
        <div className="jgc-paper-rule">a field guide to getting out of the house</div>
        <Photo src={court} className="jgc-c1-photo" />
        <div className="jgc-c1-bottom"><strong>your usual<br />can wait.</strong><p>new faces.<br />a different corner.<br />five plans for the week.</p></div>
        <Footer left="the neighborhood edition" right="open it up ↗" />
      </>}
      {cover.id === 'c2' && <>
        <div className="jgc-top"><Mark /><span>field notes / 02</span></div>
        <div className="jgc-c2-kicker">somewhere<br />along the way.</div>
        <Photo src={canopy} className="jgc-c2-photo" />
        <div className="jgc-c2-side">look<br />up.</div>
        <p className="jgc-c2-caption">01 / take the scenic route.<br />02 / stay a little longer.</p>
        <div className="jgc-c2-title">a day<br />well spent.</div>
        <Footer left="sf / the slow sunday edit" right="come along ↗" />
      </>}
      {cover.id === 'c3' && <>
        <div className="jgc-top"><Mark light /><span>going places / after hours</span></div>
        <div className="jgc-c3-title">one more<br /><span>detour.</span></div>
        <div className="jgc-c3-pair"><Photo src={coast} /><Photo src={court} /></div>
        <div className="jgc-c3-bottom"><span>the city doesn’t<br />end at your stop.</span><strong>stay<br />curious.</strong></div>
        <Footer left="san francisco / late edition" right="see what’s on ↗" />
      </>}
    </div>
  );
}

function OriginalCoverLab({ tenantKey = 'preview' }) {
  const [direction, setDirection] = useState('all');
  const [view, setView] = useState('gallery');
  const [selected, setSelected] = useState(null);
  const [shortlist, setShortlist] = useState([]);
  const [storageNotice, setStorageNotice] = useState('');
  const dialogRef = useRef(null);
  const storageKey = `justgo-cover-lab-v1:${tenantKey}`;

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
      setShortlist(Array.isArray(saved) ? saved.filter((id) => COVERS.some((cover) => cover.id === id)) : []);
    } catch { setShortlist([]); }
  }, [storageKey]);

  useEffect(() => {
    if (selected && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [selected]);

  const toggleShortlist = (id) => {
    const next = shortlist.includes(id) ? shortlist.filter((value) => value !== id) : [...shortlist, id];
    setShortlist(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { setStorageNotice('Browser storage is unavailable. Your shortlist will last until this page closes.'); }
  };
  const active = DIRECTIONS.find((item) => item.id === direction);
  const covers = (view === 'grid' ? MIXED_ORDER.map((id) => COVERS.find((cover) => cover.id === id)) : COVERS)
    .filter((cover) => direction === 'all' || (direction === 'saved' ? shortlist.includes(cover.id) : cover.direction === direction));
  const closePreview = () => { dialogRef.current?.close(); setSelected(null); };

  return (
    <section className="jg-cover-lab" aria-label="Just Go cover design lab">
      <div className="jg-cover-lab__inner">
        <header className="jg-cover-lab__header">
          <div className="jg-cover-lab__eyebrow"><span>JUST GO / ART DIRECTION</span><span>STUDY 01 · TEMPORARY</span></div>
          <div className="jg-cover-lab__intro"><h1>A little more<br /><em>out there.</em></h1><div><p>Nine covers. Three points of view.<br />One very good reason to stop scrolling.</p><span>Cover studies · 4:5 · September 2026</span></div></div>
        </header>
        <div className="jg-cover-lab__toolbar">
          <div className="jg-cover-lab__filters" role="group" aria-label="Design direction">
            <button type="button" aria-pressed={direction === 'all'} onClick={() => setDirection('all')}>All studies <sup>09</sup></button>
            {DIRECTIONS.map((item) => <button type="button" key={item.id} aria-pressed={direction === item.id} onClick={() => setDirection(item.id)}>{item.id.toUpperCase()} / {item.name}</button>)}
            <button type="button" aria-pressed={direction === 'saved'} onClick={() => setDirection('saved')}>Shortlist <sup>{shortlist.length.toString().padStart(2, '0')}</sup></button>
          </div>
          <div className="jg-cover-lab__views" role="group" aria-label="Preview layout">
            <button type="button" aria-pressed={view === 'gallery'} onClick={() => setView('gallery')}>Studies</button>
            <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Social grid</button>
          </div>
        </div>
        <div className="jg-cover-lab__context">
          <div><h2>{active ? active.descriptor : direction === 'saved' ? 'The ones worth another look.' : view === 'grid' ? 'A shared language. A changing rhythm.' : 'Same DNA. More room to play.'}</h2><p>{active ? active.description : direction === 'saved' ? 'Your picks are saved in this browser. Open a cover to add or remove it.' : 'The Just Go lettering, paper, ink, and punchy color stay. The compositions open up. Click any cover for a closer look.'}</p></div>
          <span>{active ? active.rule : 'Sample editorial copy + existing Just Go photography. These are design studies, not scheduled posts.'}</span>
        </div>
        {view === 'grid' && <div className="jg-cover-lab__grid-heading"><Mark /><span>@just.go.sf · grid study</span><span>4:5 artwork · 3:4 thumbnail crop</span></div>}
        <div className={`jg-cover-lab__gallery${view === 'grid' ? ' jg-cover-lab__gallery--grid' : ''}`}>
          {covers.map((cover) => <article key={cover.id} className="jg-cover-lab__study">
            <button type="button" className="jg-cover-lab__open" aria-label={`Preview ${cover.id.toUpperCase()}: ${cover.name}`} onClick={() => setSelected(cover)}><CoverStudy cover={cover} />{shortlist.includes(cover.id) && <span className="jg-cover-lab__saved-mark" aria-label="Shortlisted">♥</span>}</button>
            {view !== 'grid' && <div className="jg-cover-lab__caption"><div><b>{cover.id.toUpperCase()}</b><span>{DIRECTIONS.find((item) => item.id === cover.direction).name} / {cover.name}</span></div><button type="button" aria-label={`${shortlist.includes(cover.id) ? 'Remove' : 'Shortlist'} ${cover.id.toUpperCase()}`} aria-pressed={shortlist.includes(cover.id)} onClick={() => toggleShortlist(cover.id)}>{shortlist.includes(cover.id) ? '♥' : '♡'}</button></div>}
          </article>)}
        </div>
        {!covers.length && <p className="jg-cover-lab__empty">Nothing here yet. Tap the heart on a study to save it to your shortlist.</p>}
        <footer className="jg-cover-lab__footer"><span>Built around a voice, not a template.</span><span>Production carousel templates are unchanged.</span></footer>
        {storageNotice && <p role="status">{storageNotice}</p>}
      </div>
      <dialog ref={dialogRef} className="jg-cover-lab__dialog" aria-label={selected ? `Cover ${selected.id.toUpperCase()} preview` : 'Cover preview'} onCancel={closePreview} onClick={(event) => { if (event.target === dialogRef.current) closePreview(); }}>
        {selected && <div className="jg-cover-lab__preview"><div className="jg-cover-lab__preview-art"><CoverStudy cover={selected} /></div><div className="jg-cover-lab__preview-info"><button type="button" className="jg-cover-lab__close" onClick={closePreview}>Close ×</button><span>STUDY {selected.id.toUpperCase()} / 4:5</span><h2>{DIRECTIONS.find((item) => item.id === selected.direction).name}</h2><h3>{selected.name}</h3><p>{DIRECTIONS.find((item) => item.id === selected.direction).description}</p><button type="button" className="jg-cover-lab__save" aria-pressed={shortlist.includes(selected.id)} onClick={() => toggleShortlist(selected.id)}>{shortlist.includes(selected.id) ? '♥ Shortlisted — remove' : '♡ Add to shortlist'}</button><div className="jg-cover-lab__preview-nav"><button type="button" onClick={() => setSelected(COVERS[(COVERS.indexOf(selected) + COVERS.length - 1) % COVERS.length])}>← Previous</button><button type="button" onClick={() => setSelected(COVERS[(COVERS.indexOf(selected) + 1) % COVERS.length])}>Next →</button></div><small>Sample copy. Existing brand photography.<br />Choose a direction before expanding the deck.</small></div></div>}
      </dialog>
    </section>
  );
}

export default function PivotCoverLab(props) {
  const [round, setRound] = useState('events');
  return <div className="jg-cover-lab-workspace">
    <nav className="jg-cover-lab-rounds" aria-label="Design round">
      <div><button type="button" aria-pressed={round === 'events'} onClick={() => setRound('events')}>06 / Event slides</button><button type="button" aria-pressed={round === 'centered'} onClick={() => setRound('centered')}>05 / Gathered inward</button><button type="button" aria-pressed={round === 'cutouts'} onClick={() => setRound('cutouts')}>04 / From the moodboard</button><button type="button" aria-pressed={round === 'justgo'} onClick={() => setRound('justgo')}>03 / More Just Go</button><button type="button" aria-pressed={round === 'editorial'} onClick={() => setRound('editorial')}>02 / Editorial experiments</button><button type="button" aria-pressed={round === 'original'} onClick={() => setRound('original')}>01 / Original studies</button></div>
      <span>JUST GO · COVER LAB</span>
    </nav>
    {round === 'events' ? <PivotEventSlideLab /> : round === 'original' ? <OriginalCoverLab {...props} /> : <PivotEditorialCoverLab key={round} round={round} {...props} />}
  </div>;
}
