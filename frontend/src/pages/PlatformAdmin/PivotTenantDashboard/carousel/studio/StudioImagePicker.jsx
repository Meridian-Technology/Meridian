import React, { useEffect, useRef, useState } from 'react';
import { authenticatedRequest } from '../../../../../hooks/useFetch';
import './StudioImagePicker.scss';

export function eventImages(document) {
  const photos = (document.editorial?.sources || []).map(source => {
    const snapshot = source.snapshot || {};
    return { src: snapshot.image, alt: snapshot.name, credit: snapshot.credit || snapshot.imageCredit || '' };
  });
  const walk = elements => elements?.forEach(element => {
    if (element.kind === 'image' && element.asset?.src && element.role !== 'sticker') photos.push(element.asset);
    walk(element.children);
  });
  document.slides?.forEach(slide => { walk(slide.elements); if (slide.background?.asset?.src) photos.push(slide.background.asset); });
  const unique = new Map();
  photos.filter(photo => photo.src).forEach(photo => unique.set(photo.src, { ...unique.get(photo.src), ...photo }));
  return [...unique.values()];
}
export function PhotoCredit({ asset }) {
  if (asset.provider !== 'unsplash') return asset.credit ? <small>{asset.credit}</small> : null;
  return <small>Photo by <a href={asset.photographerUrl} target="_blank" rel="noreferrer">{asset.photographer}</a> on <a href={asset.sourceUrl} target="_blank" rel="noreferrer">Unsplash</a></small>;
}
export default function StudioImagePicker({ accountId, events, assets, onChoose, onUpload, onClose }) {
  const dialogRef = useRef(null);
  const requestId = useRef(0);
  const [tab, setTab] = useState('events');
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [photos, setPhotos] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement;
    if (dialogRef.current?.showModal) dialogRef.current.showModal();
    else dialogRef.current?.setAttribute('open', '');
    return () => { requestId.current += 1; previous?.focus?.(); };
  }, []);
  const load = async (term, nextPage = 1) => {
    const id = ++requestId.current;
    setLoading(true); setError('');
    if (nextPage === 1) { setPhotos([]); setHasMore(false); }
    try {
      if (!accountId) throw new Error('Unsplash search is available inside an account’s carousel editor.');
      const result = await authenticatedRequest(`/admin/pivot/carousel-accounts/${accountId}/unsplash?query=${encodeURIComponent(term)}&page=${nextPage}`);
      if (!result.data?.success) throw new Error(result.data?.message || 'Could not load Unsplash photographs.');
      if (id !== requestId.current) return;
      const data = result.data.data;
      setPhotos(current => nextPage === 1 ? data.photos : [...current, ...data.photos]); setPage(data.page); setHasMore(data.hasMore); setSearchTerm(term);
    } catch (failure) { if (id === requestId.current) setError(failure.response?.data?.message || failure.message); }
    finally { if (id === requestId.current) setLoading(false); }
  };
  const choose = async asset => {
    setChoosing(true); setError('');
    try {
      if (asset.provider === 'unsplash') {
        if (!accountId) throw new Error('Choose an account to use Unsplash.');
        const result = await authenticatedRequest(`/admin/pivot/carousel-accounts/${accountId}/unsplash/select`, { method: 'POST', data: { photoId: asset.photoId } });
        if (!result.data?.success) throw new Error(result.data?.message || 'Could not select this photograph.');
        asset = result.data.data.asset;
      }
      onChoose(asset); onClose();
    } catch (failure) { setError(failure.response?.data?.message || failure.message); setChoosing(false); }
  };
  const visible = tab === 'events' ? events : tab === 'assets' ? assets : photos;
  return <dialog ref={dialogRef} className="jg-image-picker" aria-label="Choose a photograph" onCancel={event => { event.preventDefault(); if (!choosing) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !choosing) onClose(); }} onKeyDown={event => event.stopPropagation()}>
    <header><div><span>IMAGE LIBRARY</span><h2>Choose a photograph</h2><p>Use an event photo, a saved image, or find something new.</p></div><button type="button" aria-label="Close image picker" disabled={choosing} onClick={onClose}>×</button></header>
    <nav aria-label="Image sources">{[['events', 'Event photos'], ['assets', 'Saved assets'], ['unsplash', 'Unsplash']].map(([value, title]) => <button key={value} type="button" aria-pressed={tab === value} disabled={choosing} onClick={() => { requestId.current += 1; setLoading(false); setTab(value); setError(''); if (value === 'unsplash' && !photos.length) load(query); }}>{title}</button>)}<label className="jg-image-picker__upload">{choosing ? 'Working…' : 'Upload image'}<input aria-label="Upload photograph" type="file" disabled={choosing} accept="image/png,image/jpeg,image/webp,image/gif" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; setChoosing(true); setError(''); const success = await onUpload(file); if (success === true) onClose(); else { setError(typeof success === 'string' ? success : 'The upload failed. Your photograph was not changed. Please try again.'); setChoosing(false); } }} /></label></nav>
    {tab === 'unsplash' && <form onSubmit={event => { event.preventDefault(); load(query); }}><input aria-label="Search Unsplash" placeholder="Try city nights, dinner, live music…" value={query} onChange={event => setQuery(event.target.value)} maxLength={200} /><button type="submit" disabled={choosing}>Search</button></form>}
    <div className="jg-image-picker__content" aria-busy={loading || choosing}>
      {error && <p role="alert">{error}</p>}
      {!visible.length && !loading && !error && <p>{tab === 'events' ? 'No event photos yet. Upload a photograph or browse Unsplash.' : tab === 'assets' ? 'Uploaded account images will appear here.' : 'No photographs found. Try another search.'}</p>}
      <div className="jg-image-picker__grid">{visible.filter(asset => asset.src).map(asset => <article key={asset.id || asset.src}><button type="button" disabled={choosing} onClick={() => choose(asset)} aria-label={`Use ${asset.alt || 'photograph'}`}><img loading="lazy" draggable="false" src={asset.thumbnail || asset.src} alt="" /><span>{asset.alt || 'Photograph'}</span></button><PhotoCredit asset={asset} /></article>)}</div>
      {loading && <p role="status">Loading photographs…</p>}{tab === 'unsplash' && hasMore && !loading && <button type="button" disabled={choosing} onClick={() => load(searchTerm, page + 1)}>Load more</button>}
    </div><footer>PNG, JPEG, WebP or GIF · Uploads up to 8 MB · Choosing a photo is undoable.</footer>
  </dialog>;
}
