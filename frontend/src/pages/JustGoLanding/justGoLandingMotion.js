import { useEffect, useState } from 'react';

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function useJustGoLandingMotion({ desktop, flyersRef }) {
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
