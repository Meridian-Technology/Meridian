import React from 'react';
import wordmark from '../../../../assets/pivot/just-go-wordmark-dark.svg';
import './JustGoCoverStudy.scss';

function Brand({ light = false }) {
  return <img className={`jgx-brand${light ? ' jgx-brand--light' : ''}`} src={wordmark} alt="Just Go" />;
}
function Burst({ className = '' }) {
  // The existing Just Go burst silhouette, with a print-weight ink edge.
  return <svg className={`jgx-burst ${className}`} viewBox="-3 -3 70 54" aria-hidden="true"><path d="M32 0 44 16 64 12 50 28 60 48 32 38 4 48 14 28 0 12 20 16Z" fill="currentColor" stroke="#1a1714" strokeWidth="1.6" strokeLinejoin="miter" /></svg>;
}
function Meta({ story }) {
  return <div className="jgx-meta"><span>{story.kind === 'city' ? story.location : 'everywhere / after the fact'}</span><span>just go →</span></div>;
}
function IssueTab({ story }) {
  return <div className="jgx-issue-tab"><b>{story.kind === 'city' ? story.location : 'global'}</b><span>{story.id === 'moon' ? 'mid-autumn things' : story.id === 'jazz' ? 'jazz, after dark' : 'the night shift'}</span></div>;
}
function Loud({ story }) {
  return <>
    <img className="jgx-hero" src={story.photo} alt={story.alt} />
    <div className="jgx-photo-ink" />
    <div className="jgx-mast"><Brand light /><span>{story.kind === 'city' ? 'good things, picked by us.' : 'sorry you missed it / 002'}</span></div>
    {story.id === 'moon' && <div className="jgx-loud-title"><span>at a</span><strong>chinese</strong><span>time in</span><strong>your life?</strong></div>}
    {story.id === 'dance' && <div className="jgx-loud-title"><strong>sorry</strong><span>you</span><strong>missed</strong><span>it.</span></div>}
    {story.id === 'jazz' && <div className="jgx-loud-title"><strong>sax</strong><span>and the</span><strong>city.</strong></div>}
    <IssueTab story={story} />
    <p className="jgx-caption">{story.id === 'moon' ? 'mooncakes. lanterns. you in?' : story.id === 'dance' ? 'and you thought it was just a haircut.' : 'small rooms. big feelings. late trains.'}</p>
    <Meta story={story} />
  </>;
}
function Club({ story }) {
  return <>
    <div className="jgx-mast"><Brand /><span>{story.kind === 'city' ? 'the city is calling.' : 'from somewhere you weren’t.'}</span></div>
    <div className="jgx-aperture"><img src={story.photo} alt={story.alt} /><div className="jgx-dots" /></div>
    {story.id === 'moon' && <div className="jgx-club-title"><span>in your</span><strong>moon</strong><strong>phase?</strong></div>}
    {story.id === 'dance' && <div className="jgx-club-title"><span>sorry you</span><strong>missed</strong><strong>it.</strong></div>}
    {story.id === 'jazz' && <div className="jgx-club-title"><strong>sax</strong><strong>appeal.</strong></div>}
    <div className="jgx-club-note">{story.id === 'moon' ? <>full moon.<br />full calendar.</> : story.id === 'dance' ? <>yes, that’s<br />a barbershop.</> : <>good music.<br />bad bedtime.</>}</div>
    <IssueTab story={story} />
    <Meta story={story} />
  </>;
}
function CutPaper({ children, tone = '', className = '' }) {
  return <span className={`jgx-cut ${tone ? `jgx-cut--${tone}` : ''} ${className}`}>{children}</span>;
}
function CutRun({ story }) {
  return <>
    <div className="jgx-mast"><Brand /><span>{story.kind === 'city' ? 'a few very good plans.' : 'sorry you missed it / 002'}</span></div>
    <div className="jgx-photo-stack"><img src={story.photo} alt={story.alt} /></div>
    <Burst />
    {story.id === 'moon' && <div className="jgx-cut-title"><CutPaper>at a chinese</CutPaper><CutPaper tone="blue">time in</CutPaper><CutPaper>your life?</CutPaper></div>}
    {story.id === 'dance' && <div className="jgx-cut-title"><CutPaper tone="yellow">sorry you</CutPaper><CutPaper>missed it.</CutPaper></div>}
    {story.id === 'jazz' && <div className="jgx-cut-title"><CutPaper tone="orange">sax.</CutPaper><CutPaper>no strings</CutPaper><CutPaper tone="blue">attached.</CutPaper></div>}
    <IssueTab story={story} />
    <p className="jgx-caption">{story.id === 'moon' ? 'the mid-autumn edit. bring an appetite.' : story.id === 'dance' ? 'a very different kind of night shift.' : 'the good kind of going off-script.'}</p>
    <Meta story={story} />
  </>;
}
export default function JustGoCoverStudy({ cover }) {
  const Component = { g: Loud, h: Club, i: CutRun }[cover.direction];
  return <div className={`jgx-cover jgx-cover--${cover.direction} jgx-cover--${cover.story.id}`}><Component story={cover.story} /><div className="jgx-grain" aria-hidden="true" /></div>;
}
