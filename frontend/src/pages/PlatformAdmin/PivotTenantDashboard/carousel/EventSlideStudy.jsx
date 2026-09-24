import React from 'react';
import stickerLight from '../../../../assets/pivot/JustGoDieCutLight.png';
import './EventSlideStudy.scss';

function Title({ event }) {
  return <h2 className="jgv-title">{event.lines.map((line) => <span key={line}>{line}</span>)}</h2>;
}
function Facts({ event }) {
  return <dl className="jgv-facts"><div><dt>{event.recap ? 'When it happened' : 'When'}</dt><dd>{event.when}</dd></div><div><dt>Where</dt><dd>{event.where}<span>{event.city}</span></dd></div></dl>;
}
export default function EventSlideStudy({ event, treatment }) {
  return <div className={`jgv-slide jgv-slide--${treatment}`}>
    <div className="jgv-photo"><img src={event.story.photo} alt={event.story.alt} style={{ objectPosition: event.photoPosition }} /></div>
    {treatment !== 'scene' && <img className="jgv-sticker" src={stickerLight} alt="Just Go" />}
    <div className="jgv-content">
      <Title event={event} />
      <p className="jgv-description">{event.note}</p>
      <div className="jgv-logistics"><Facts event={event} /><p className="jgv-access">{event.access}</p></div>
    </div>
    <div className="jgv-grain" aria-hidden="true" />
  </div>;
}
