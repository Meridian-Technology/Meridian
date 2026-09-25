/**
 * One slide, alone, at exactly 1080×1350.
 *
 * This is what the render script screenshots. It is the same components the
 * editor draws with, so the export cannot drift from what was approved on
 * screen — the templates are `cqw` throughout, so setting the frame to 1080px
 * wide is the whole of "render at export size".
 *
 * Reached with a signed token rather than a session: a headless Chrome started
 * from a terminal has no cookie, and a navigation cannot carry a header.
 *
 * `data-ready` on the root is the capture signal. Fonts and images both load
 * asynchronously and a screenshot taken before either is a silently wrong
 * export — the wrong face, or a slide with holes in it.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import StudioSlide from './studio/StudioSlide';
import { frameClass, resolveSlide } from './zineDeck';
import {
  ZineBack,
  ZineCard,
  ZineCover,
  ZineDispatch,
  ZineNotice,
  ZineReceipt,
  ZineSheet,
} from './zineFrames';
import './PivotCarouselPage.scss';
import './PivotCarouselFrame.scss';

const FRAME_COMPONENTS = {
  cover: ZineCover,
  wall: ZineSheet,
  card: ZineCard,
  notice: ZineNotice,
  dispatch: ZineDispatch,
  receipt: ZineReceipt,
  back: ZineBack,
};

/** Every image inside the node, settled one way or the other. */
function imagesSettled(node) {
  const images = [...node.querySelectorAll('img')];
  return Promise.all(
    images.map((img) => (img.complete
      ? Promise.resolve()
      : new Promise((done) => {
        img.addEventListener('load', done, { once: true });
        // A broken image must not hold the export open for ever.
        img.addEventListener('error', done, { once: true });
      }))),
  );
}

export default function PivotCarouselFrame() {
  const { deckId, index } = useParams();
  const [search] = useSearchParams();
  const token = search.get('token');

  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams({ token: token || '', deckId: deckId || '' });
      try {
        /*
         * A plain fetch, not the app's authenticated request helper. This route
         * carries a signed token and has no session; the helper would read the
         * 401 as an expired login and start a refresh dance that cannot
         * succeed, burying the actual reason in retries.
         */
        const response = await fetch(`/admin/pivot/carousel-export?${params}`, {
          headers: { accept: 'application/json' },
        });
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok || !body?.success) {
          setError(body?.message || `Could not load the deck (${response.status}).`);
          return;
        }
        setPayload(body.data);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message || 'Could not reach the server.');
      }
    })();
    return () => { cancelled = true; };
  }, [token, deckId]);

  const studio = payload?.deck?.schemaVersion === 2;
  const slide = useMemo(() => {
    if (!payload || studio) return null;
    const slides = payload.deck.slides || [];
    const at = Math.max(0, Math.min(Number(index) - 1, slides.length - 1));
    const row = slides[at];
    if (!row) return null;
    return resolveSlide(payload.deck, row, at, payload.manifest, payload.cityVoice);
  }, [payload, index, studio]);
  const studioSlide = studio ? payload.deck.document?.slides?.[Math.max(0, Number(index) - 1)] : null;

  /*
   * Wait for the face and the photographs before signalling. Les Flos is loaded
   * by @font-face, so a capture that beats it silently ships a cover set in the
   * fallback — the kind of error nobody notices until it is posted.
   */
  useEffect(() => {
    if (!slide && !studioSlide) return;
    let cancelled = false;
    const root = document.querySelector('.jgz-export');
    (async () => {
      await Promise.all([
        document.fonts ? document.fonts.ready : Promise.resolve(),
        root ? imagesSettled(root) : Promise.resolve(),
      ]);
      if (studioSlide) {
        const broken = root ? [...root.querySelectorAll('img')].filter((img) => img.complete && img.naturalWidth === 0) : [];
        if (broken.length) {
          if (!cancelled) setError('A photograph in this revision could not be loaded.');
          return;
        }
      }
      // One frame past load, so the last paint has certainly happened.
      requestAnimationFrame(() => {
        if (!cancelled) setReady(true);
      });
    })();
    return () => { cancelled = true; };
  }, [slide, studioSlide]);

  if (error) {
    return <div className="jgz-export jgz-export--error" data-ready="1">{error}</div>;
  }
  if (studio) {
    if (!studioSlide) {
      return <div className="jgz-export jgz-export--error" data-ready="1">This revision has no slide {index}.</div>;
    }
    return (
      <div className="jgz-export" data-ready={ready ? '1' : undefined} data-slide="studio" data-schema-version="2">
        <StudioSlide doc={payload.deck.document} width={1080} slideIndex={Math.max(0, Number(index) - 1)} />
      </div>
    );
  }
  if (!slide) return <div className="jgz-export" />;

  const Frame = FRAME_COMPONENTS[slide.type];
  if (!Frame) {
    return (
      <div className="jgz-export jgz-export--error" data-ready="1">
        No template for “{slide.type}”.
      </div>
    );
  }

  return (
    <div className="jgz-export" data-ready={ready ? '1' : undefined} data-slide={slide.type}>
      <div className={frameClass(payload.deck)}>
        <Frame {...slide.props} />
      </div>
    </div>
  );
}
