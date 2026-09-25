// Development-only fixtures, never used by production issue creation.
import React, { useMemo, useState } from 'react';
import StudioEditor from './StudioEditor';
import StudioSlide from './StudioSlide';
import CenteredCutoutCoverStudy from '../CenteredCutoutCoverStudy';
import EventSlideStudy from '../EventSlideStudy';
import { EVENT_SAMPLES } from '../eventLabData';
import { COVER_FAMILIES, EVENT_PRESETS, generateCoverSlide, generateEventSlide, walkElements } from '../../../../../shared/carouselStudio/presets';
const TITLES = [
  [[['at a',8,'Les Flos Sage'],['CHINESE',18],['time in',8,'Les Flos Sage'],['YOUR LIFE?',13.5]], [['SORRY',23],['you',9,'Les Flos Sage'],['MISSED IT.',17]], [['SAX',27],['and the',8,'Les Flos Sage'],['CITY.',25]]],
  [[['in your',9,'Les Flos Sage'],['moon',24],['phase?',20]], [['sorry',23],['you',9,'Les Flos Sage'],['missed it.',17]], [['sax',32],['appeal.',23]]],
  [[['moon',22],['people.',17,'Les Flos Sans']], [['sorry you',11,'Les Flos Sans'],['missed it.',18]], [['sax &',12,'Les Flos Sans'],['the city.',19]]],
];
const CAPTIONS = [['mooncakes. lanterns. a very good night.','this barbershop had an afterparty.','a few places to lose track of time.'],['the mid-autumn edit. bring an appetite.','walk-ins welcome. apparently.','good music. questionable bedtime.'],['the mid-autumn edit / san francisco','file under: you had to be there.','small rooms. late sets. new york.']];
function fixtures() {
  const covers = COVER_FAMILIES.flatMap((family, f) => EVENT_SAMPLES.map((sample, i) => ({ slide: generateCoverSlide({ coverPreset: family, variation: i + 1, coverImage: sample.story.photo, copy: { titleRuns: TITLES[f][i].map(([text,size,font]) => ({ text,size,font })), caption: CAPTIONS[f][i], printCaption: ['same moon, good company.', 'a very different night shift.', 'one more song. then we go.'][i], location: sample.story.location } }), reference: <CenteredCutoutCoverStudy cover={{ direction: ['j','k','l'][f], story: sample.story }} />, label: `${family} ${i + 1}` })));
  return [...covers, ...EVENT_PRESETS.map((preset, i) => {
    const sample = EVENT_SAMPLES[0];
    return { slide: generateEventSlide({ snapshot: { name: sample.lines.join('\n'), image: sample.story.photo, crop: { focalX: parseFloat(sample.photoPosition) / 100, focalY: .5 }, location: sample.where, city: { name: sample.city }, whenLabel: sample.when, access: sample.access }, recapNote: sample.note }, preset), reference: <EventSlideStudy event={sample} treatment={['note','bill','scene'][i]} />, label: preset };
  })];
}
export default function StudioVerification() {
  const [rows] = useState(fixtures); const [scenario, setScenario] = useState('standard'); const [mode, setMode] = useState('editor'); const [saved, setSaved] = useState(null);
  const issue = useMemo(() => ({ _id: 'verification', name: 'City nights — studio verification', format: 'city-picks', revision: 1, document: { schemaVersion: 2, width: 1080, height: 1350, slides: scenario === 'standard' ? [rows[0].slide, ...rows.slice(9).map(row => row.slide)] : Array.from({ length: scenario === 'stress' ? 20 : 1 }, (_, i) => generateEventSlide({ snapshot: { name: i ? `Evening ${i + 1} ✨` : 'A night to remember', startTime: '2026-09-25T01:00:00.000Z', city: { name: 'San Francisco', timezone: 'America/Los_Angeles' }, description: 'This source description must never enter the artwork. '.repeat(20), image: scenario === 'stress' ? EVENT_SAMPLES[i % 3].story.photo : null } }, EVENT_PRESETS[i % 3])) } }), [rows, scenario]);
  return <div style={{ padding: 20, fontFamily: 'OpenSauce, sans-serif', background: '#f5f4f2' }}><div style={{ display: 'flex', gap: 12, marginBottom: 12 }}><button onClick={() => setMode('editor')}>Editor</button><button onClick={() => setMode('matrix')}>Approved design comparison</button><button onClick={() => setMode('full')}>Full resolution</button><button onClick={() => { setScenario('empty'); setMode('editor'); }}>New event fixture</button><button onClick={() => { setScenario('stress'); setMode('editor'); }}>20-slide fixture</button><span>Local verification fixtures · no account data</span></div>
    {mode === 'editor' ? <StudioEditor key={scenario} issue={issue} onSave={async document => { setSaved(document); return { document, revision: 2 }; }} /> : mode === 'full' ? <StudioSlide doc={saved || issue.document} width={1080} /> : <div>{rows.map(row => <section key={row.label} style={{ marginBottom: 30 }}><h2>{row.label}</h2><div style={{ display: 'flex', gap: 20 }}><div><p>Approved lab</p><div style={{ width: 300 }}>{row.reference}</div></div><div><p>Editable document</p><StudioSlide doc={row.slide} width={300} /></div></div></section>)}</div>}
    {saved && <details><summary>Saved geometry</summary><pre>{JSON.stringify(saved.slides.map(slide => { const nodes = []; walkElements(slide.elements, node => nodes.push({ role: node.role, frame: node.frame, text: node.text, rotation: node.rotation })); return nodes; }), null, 2)}</pre></details>}
  </div>;
}
