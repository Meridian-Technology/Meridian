import React from 'react';
import wordmark from '../../../../assets/pivot/just-go-wordmark-dark.svg';

function Publisher() {
  return <img className="jge-publisher" src={wordmark} alt="Just Go" />;
}
function IssueLine({ story }) {
  return <div className="jge-issue-line"><span>{story.location}</span><span>{story.theme}</span></div>;
}
function DoubleTake({ story }) {
  return <>
    <img className="jge-hero" src={story.photo} alt={story.alt} />
    <div className="jge-shade" />
    <div className="jge-heading"><span>{story.kind === 'city' ? 'the city edit' : 'a global dispatch'}</span><span>no. {story.number}</span></div>
    {story.id === 'moon' && <div className="jge-d-title"><b>at a</b><em>Chinese</em><b>time in</b><em>your life?</em></div>}
    {story.id === 'dance' && <div className="jge-d-title"><b>sorry</b><em>you</em><b>missed</b><em>it.</em></div>}
    {story.id === 'jazz' && <div className="jge-d-title"><em>sax</em><b>and the</b><em>city.</em></div>}
    {story.id === 'encore' && <><div className="jge-d-series">sorry you<br /><em>missed it.</em></div><div className="jge-d-title"><b>one more</b><em>encore.</em></div></>}
    <div className="jge-bottom"><p>{story.detail}</p><Publisher /></div>
    <IssueLine story={story} />
  </>;
}
function FullVolume({ story }) {
  return <>
    <div className="jge-heading"><span>{story.kind === 'city' ? 'THE CITY EDIT' : 'A GLOBAL DISPATCH'}</span><Publisher /></div>
    <img className="jge-hero" src={story.photo} alt={story.alt} />
    {story.id === 'moon' && <><span className="jge-e-prefix">IN YOUR</span><div className="jge-e-title"><span>MOON</span><span>PHASE.</span></div><span className="jge-e-note">the mid-autumn edit</span></>}
    {story.id === 'dance' && <><div className="jge-e-series">SORRY<br />YOU</div><div className="jge-e-title"><span>MISSED</span><span>IT.</span></div><p className="jge-e-note">the barbershop<br />had other plans.</p></>}
    {story.id === 'jazz' && <><div className="jge-e-title"><span>SAX</span><span>APPEAL.</span></div><span className="jge-e-note">new york, after hours.</span></>}
    {story.id === 'encore' && <><div className="jge-e-title"><span>SORRY</span><span>YOU</span><span>MISSED IT.</span></div><p className="jge-e-note">one more?<br />one more.</p></>}
    <IssueLine story={story} />
  </>;
}
function SecondPressing({ story }) {
  return <>
    <div className="jge-spine"><Publisher /><span>{story.series}</span><span>JG—0{story.number}</span></div>
    <div className="jge-f-heading"><span>{story.location}</span><span>issue {story.number}</span></div>
    <div className="jge-f-photo"><img src={story.photo} alt={story.alt} /></div>
    {story.id === 'moon' && <div className="jge-f-title">moon<br /><em>behavior.</em></div>}
    {story.id === 'dance' && <div className="jge-f-title">sorry you<br /><em>missed it.</em></div>}
    {story.id === 'jazz' && <div className="jge-f-title">sax.<br /><em>no strings.</em></div>}
    {story.id === 'encore' && <><div className="jge-f-mini">sorry you<br />missed it.</div><div className="jge-f-title">play it<br /><em>again.</em></div></>}
    <div className="jge-f-caption"><b>{story.theme}</b><p>{story.detail}</p></div>
  </>;
}

export default function EditorialCoverStudy({ cover }) {
  const Component = { d: DoubleTake, e: FullVolume, f: SecondPressing }[cover.direction];
  return <div className={`jge-cover jge-cover--${cover.direction} jge-cover--${cover.story.id}`}><Component story={cover.story} /></div>;
}
