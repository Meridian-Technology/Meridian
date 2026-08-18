import { useEffect, useState } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { smearFromVelocity } from './justGoLandingUtils';

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function applySmear(node, velocity) {
  if (!node) return;
  const { x, skew } = smearFromVelocity(velocity);
  node.style.transform = `translate3d(${x}px, 0, 0) skewX(${skew}deg) scale(1.14)`;
}

function bindNativeSmear(photoRef) {
  let lastY = window.scrollY;
  let lastT = performance.now();
  let velocity = 0;
  let decaying = false;
  let decayId = 0;

  const paint = () => applySmear(photoRef.current, velocity);

  const decay = () => {
    velocity *= 0.86;
    paint();
    if (Math.abs(velocity) < 0.2) {
      velocity = 0;
      decaying = false;
      paint();
      return;
    }
    decayId = requestAnimationFrame(decay);
  };

  const onScroll = () => {
    const y = window.scrollY;
    const t = performance.now();
    const dt = Math.max(8, t - lastT);
    velocity = ((y - lastY) / dt) * 16.67;
    lastY = y;
    lastT = t;
    paint();
    if (!decaying) {
      decaying = true;
      decayId = requestAnimationFrame(decay);
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    window.removeEventListener('scroll', onScroll);
    cancelAnimationFrame(decayId);
    if (photoRef.current) photoRef.current.style.transform = '';
  };
}

export function useJustGoLandingMotion({ desktop, photoRef, flyersRef }) {
  const [slap, setSlap] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setSlap(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;

    if (desktop) {
      const LenisCtor = typeof Lenis === 'function' ? Lenis : Lenis?.default;
      if (typeof LenisCtor !== 'function') return bindNativeSmear(photoRef);

      const lenis = new LenisCtor({
        lerp: 0.1,
        autoRaf: true,
        anchors: true,
        syncTouch: false,
      });
      if (typeof lenis?.on !== 'function') {
        lenis?.destroy?.();
        return bindNativeSmear(photoRef);
      }

      const onScroll = (instance) => applySmear(photoRef.current, instance.velocity);
      lenis.on('scroll', onScroll);
      return () => {
        lenis.off('scroll', onScroll);
        lenis.destroy();
        if (photoRef.current) photoRef.current.style.transform = '';
      };
    }

    return bindNativeSmear(photoRef);
  }, [desktop, photoRef]);

  useEffect(() => {
    const node = flyersRef.current;
    if (!node) return undefined;

    if (!desktop || prefersReducedMotion() || typeof IntersectionObserver !== 'function') {
      node.classList.add('justgo-landing__flyers--dealt');
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        node.classList.add('justgo-landing__flyers--dealt');
        observer.disconnect();
      },
      { threshold: 0.16 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [desktop, flyersRef]);

  return { slap };
}
