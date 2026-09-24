import React, { useEffect, useRef, useState } from 'react';
import CenteredCutoutCoverStudy from './CenteredCutoutCoverStudy';
import { CUTOUT_DIRECTIONS } from './coverLabCutoutData';
import EventSlideStudy from './EventSlideStudy';
import { EVENT_SAMPLES, EVENT_TREATMENTS } from './eventLabData';
import './PivotEventSlideLab.scss';

export default function PivotEventSlideLab() {
  const [view, setView] = useState('compare');
  const [sample, setSample] = useState('all');
  const [coverStyle, setCoverStyle] = useState('j');
  const [treatment, setTreatment] = useState('note');
  const [selected, setSelected] = useState(null);
  const dialog = useRef(null);
  useEffect(() => { if (selected && !dialog.current?.open) dialog.current?.showModal(); }, [selected]);
  const close = () => { dialog.current?.close(); setSelected(null); };
  const event = EVENT_SAMPLES.find((item) => item.id === sample) || EVENT_SAMPLES[0];
  const cover = { direction: coverStyle, story: event.story };
  const examples = EVENT_SAMPLES.filter((item) => sample === 'all' || item.id === sample);
  const pairTreatment = (slide) => { setSample(slide.event.id); setTreatment(slide.treatment); setView('pair'); close(); };
  const changeView = (next) => { if (next === 'pair' && sample === 'all') setSample('moon'); setView(next); };
  const shufflePairing = () => {
    setCoverStyle((value) => CUTOUT_DIRECTIONS[(CUTOUT_DIRECTIONS.findIndex((item) => item.id === value) + 1 + Math.floor(Math.random() * 2)) % 3].id);
    setTreatment((value) => EVENT_TREATMENTS[(EVENT_TREATMENTS.findIndex((item) => item.id === value) + 1 + Math.floor(Math.random() * 2)) % 3].id);
  };
  const renderArt = (slide) => slide.cover ? <CenteredCutoutCoverStudy cover={slide.cover} /> : <EventSlideStudy event={slide.event} treatment={slide.treatment} />;
  const preview = (slide, label, caption) => <article className="jg-cover-lab__study" key={label}><button className="jg-cover-lab__open" type="button" aria-label={`Preview ${label}`} onClick={() => setSelected(slide)}>{renderArt(slide)}</button><div className="jg-cover-lab__caption"><div><b>{label}</b><span>{caption}</span></div></div></article>;

  return <section className="jg-cover-lab jg-event-lab" aria-label="Event slide studies"><div className="jg-cover-lab__inner">
    <header><div className="jg-cover-lab__eyebrow"><span>JUST GO / EVENT SLIDE STUDIES</span><span>3 TREATMENTS · 9 EXAMPLES</span></div><div className="jg-cover-lab__intro"><h1>And then,<br /><em>the good stuff.</em></h1><div><p>Three ways to tell the event story.<br />Any cover can open any treatment.</p><span>City picks + global recaps</span></div></div></header>
    <div className="jg-cover-lab__toolbar"><div className="jg-cover-lab__filters" role="group" aria-label="Event examples">{(view === 'compare' ? [{ id: 'all', name: 'All examples' }, ...EVENT_SAMPLES.map((item) => ({ id: item.id, name: item.label }))] : EVENT_SAMPLES.map((item) => ({ id: item.id, name: item.label }))).map((item) => <button type="button" key={item.id} aria-pressed={sample === item.id} onClick={() => setSample(item.id)}>{item.name}</button>)}</div><div className="jg-cover-lab__views" role="group" aria-label="Study view"><button type="button" aria-pressed={view === 'compare'} onClick={() => changeView('compare')}>Compare treatments</button><button type="button" aria-pressed={view === 'pair'} onClick={() => changeView('pair')}>Pair with a cover</button></div></div>
    {view === 'compare' ? <>
      <div className="jgv-directions">{EVENT_TREATMENTS.map((item, index) => <div key={item.id}><h2><span>E{index + 1}</span> {item.name}</h2><p>{item.description}</p></div>)}</div>
      {examples.map((item) => <section className="jgv-example-row" key={item.id} aria-label={item.title}><h2>{item.title} <span>{item.recap ? 'Past event / recap copy' : 'Upcoming event / date, place, admission'}</span></h2><div className="jg-cover-lab__gallery">{EVENT_TREATMENTS.map((style, index) => preview({ event: item, treatment: style.id }, `E${index + 1} / ${item.title}`, style.name))}</div></section>)}
    </> : <>
      <div className="jgv-pair-controls"><label>Cover composition<select value={coverStyle} onChange={(e) => setCoverStyle(e.target.value)}>{CUTOUT_DIRECTIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Event treatment<select value={treatment} onChange={(e) => setTreatment(e.target.value)}>{EVENT_TREATMENTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="button" onClick={shufflePairing}>Shuffle pairing</button><p>Try any of the nine combinations. The cover sets the theme; the event slide makes the details readable.</p></div>
      <div className="jgv-pair-grid">{preview({ cover }, 'Cover', CUTOUT_DIRECTIONS.find((item) => item.id === coverStyle).name)}{preview({ event, treatment }, 'Event slide', EVENT_TREATMENTS.find((item) => item.id === treatment).name)}</div>
    </>}
    <footer className="jge-credits"><p>Design samples only: event names, venues, dates, prices, and recap copy are fictional. Photography is illustrative. The same event is shown in each treatment for comparison.</p><p>{EVENT_SAMPLES.map((item, index) => <React.Fragment key={item.id}>{index > 0 && ' · '}<a href={item.story.source} target="_blank" rel="noreferrer">{item.story.credit} / Unsplash</a></React.Fragment>)}</p></footer>
  </div><dialog ref={dialog} className="jg-cover-lab__dialog" aria-label="Event study preview" onCancel={close} onClick={(e) => { if (e.target === dialog.current) close(); }}>{selected && <div className="jg-cover-lab__preview"><div className="jg-cover-lab__preview-art">{renderArt(selected)}</div><div className="jg-cover-lab__preview-info"><button className="jg-cover-lab__close" type="button" onClick={close}>Close ×</button><span>{selected.cover ? 'COVER / ROUND 05' : 'EVENT SLIDE / 4:5'}</span><h2>{selected.cover ? CUTOUT_DIRECTIONS.find((item) => item.id === selected.cover.direction).name : EVENT_TREATMENTS.find((item) => item.id === selected.treatment).name}</h2><p>{selected.cover ? 'The approved cover language, with full-colour photography and the supplied die-cut sticker.' : EVENT_TREATMENTS.find((item) => item.id === selected.treatment).description}</p>{!selected.cover && <button className="jg-cover-lab__save" type="button" onClick={() => pairTreatment(selected)}>Pair this treatment with a cover</button>}<small>Fictional event details. Illustrative photography.</small></div></div>}</dialog></section>;
}
