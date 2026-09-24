import React from 'react';
import wordmark from '../../../../assets/pivot/just-go-wordmark-dark.svg';
import './CutoutCoverStudy.scss';
import dieCutDark from '../../../../assets/pivot/JustGoDieCutDark.png';
import dieCutLight from '../../../../assets/pivot/JustGoDieCutLight.png';

function Mark() { return <img className="jgr-mark" src={wordmark} alt="Just Go" />; }
function Letters({ children, className = '' }) {
  return <span className={`jgr-letters ${className}`} aria-label={children}>{[...children].map((letter, i) => <span key={i} aria-hidden="true" style={{ '--turn': `${[-2, 1, -1, 2, -2, 1, 2][i % 7]}deg`, '--shift': `${[0, .2, -.15, .2, 0, -.15, .2][i % 7]}cqw` }}>{letter === ' ' ? '\u00a0' : letter}</span>)}</span>;
}
function Top({ story, centered }) { if (centered) return null; return <div className="jgr-top"><Mark /><span>{story.kind === 'city' ? 'the city edit' : 'a dispatch from everywhere'}</span></div>; }
function Foot({ story, centered }) { return <div className="jgr-foot"><span>{story.location}</span>{!centered && <span>{story.id === 'moon' ? 'mid-autumn / 01' : story.id === 'dance' ? 'after dark / 02' : 'jazz / 03'}</span>}</div>; }
function LooseLetters({ story, centered }) {
  return <>
    <img className="jgr-full-photo" src={story.photo} alt={story.alt} />
    <div className="jgr-photo-wash" />
    <Top story={story} centered={centered} />
    {story.id === 'moon' && <div className="jgr-letter-layout"><span className="jgr-small-phrase">at a</span><Letters className="jgr-word-one">CHINESE</Letters><span className="jgr-small-phrase jgr-small-phrase--second">time in</span><Letters className="jgr-word-two">YOUR LIFE?</Letters></div>}
    {story.id === 'dance' && <div className="jgr-letter-layout"><Letters className="jgr-word-one">SORRY</Letters><span className="jgr-small-phrase">you</span><Letters className="jgr-word-two">MISSED IT.</Letters></div>}
    {story.id === 'jazz' && <div className="jgr-letter-layout"><Letters className="jgr-word-one">SAX</Letters><span className="jgr-small-phrase">and the</span><Letters className="jgr-word-two">CITY.</Letters></div>}
    <p className="jgr-letter-caption">{story.id === 'moon' ? 'mooncakes. lanterns. a very good night.' : story.id === 'dance' ? 'this barbershop had an afterparty.' : 'a few places to lose track of time.'}</p>
    <Foot story={story} centered={centered} />
  </>;
}
function OpenInvitation({ story, centered }) {
  return <>
    <Top story={story} centered={centered} />
    <div className="jgr-window"><img src={story.photo} alt={story.alt} /></div>
    {story.id === 'moon' && <><div className="jgr-window-title"><span className="jgr-window-prefix">in your</span><Letters>moon</Letters><Letters>phase?</Letters></div><p className="jgr-window-note">the mid-autumn edit. bring an appetite.</p></>}
    {story.id === 'dance' && <><div className="jgr-window-title"><Letters>sorry</Letters><span className="jgr-window-prefix">you</span><Letters>missed it.</Letters></div><p className="jgr-window-note">walk-ins welcome. apparently.</p></>}
    {story.id === 'jazz' && <><div className="jgr-window-title"><Letters>sax</Letters><Letters>appeal.</Letters></div><p className="jgr-window-note">good music. questionable bedtime.</p></>}
    <Foot story={story} centered={centered} />
  </>;
}
function Print({ story, className = '', caption }) {
  return <div className={`jgr-print ${className}`}><div className="jgr-print-image"><img src={story.photo} alt={className.includes('detail') ? '' : story.alt} /></div>{caption && <span>{caption}</span>}</div>;
}
function KeptSomewhere({ story, centered }) {
  return <>
    <Top story={story} centered={centered} />
    {story.id === 'moon' && <><div className="jgr-archive-title"><Letters>moon</Letters><span>people.</span></div><Print story={story} className="jgr-print--main" caption="same moon, good company." /><Print story={story} className="jgr-print--detail" /><p className="jgr-archive-note">the mid-autumn edit / san francisco</p></>}
    {story.id === 'dance' && <><Print story={story} className="jgr-print--main" caption="a very different night shift." /><Print story={story} className="jgr-print--detail" /><div className="jgr-archive-title"><span>sorry you</span><Letters>missed it.</Letters></div><p className="jgr-archive-note">file under: you had to be there.</p></>}
    {story.id === 'jazz' && <><Print story={story} className="jgr-print--main" caption="one more song. then we go." /><div className="jgr-archive-title"><span>sax &</span><Letters>the city.</Letters></div><p className="jgr-archive-note">small rooms. late sets. new york.</p></>}
    <Foot story={story} centered={centered} />
  </>;
}
export default function CutoutCoverStudy({ cover, centered = false }) {
  const Component = { j: LooseLetters, k: OpenInvitation, l: KeptSomewhere }[cover.direction];
  const sticker = cover.direction === 'l' ? dieCutDark : dieCutLight;
  return <div className={`jgr-cover jgr-cover--${cover.direction} jgr-cover--${cover.story.id}${centered ? ' jgr-cover--centered' : ''}`}><Component story={cover.story} centered={centered} />{centered && <span className="jgr-die-cut" style={{ '--sticker-image': `url("${sticker}")` }}><img src={sticker} alt="Just Go" /></span>}<div className="jgr-grain" aria-hidden="true" /></div>;
}
