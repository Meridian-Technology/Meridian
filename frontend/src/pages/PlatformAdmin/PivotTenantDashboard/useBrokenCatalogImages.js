import { useEffect, useMemo, useRef, useState } from 'react';
import { collectBrokenImageEventIds } from '../PivotLab/checkImageUrl';

export default function useBrokenCatalogImages(events) {
  const [brokenIds, setBrokenIds] = useState(() => new Set());
  const [scanning, setScanning] = useState(false);
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const scanKey = useMemo(
    () => (events || []).map((event) => `${event._id}\t${event.image || ''}`).join('\n'),
    [events],
  );

  useEffect(() => {
    const list = eventsRef.current || [];
    const currentIds = new Set(list.map((event) => String(event._id)));
    setBrokenIds((prev) => {
      const next = new Set();
      for (const id of prev) {
        if (currentIds.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });

    const candidates = list.filter((event) => String(event.image || '').trim());
    if (!candidates.length) {
      setScanning(false);
      setBrokenIds((prev) => (prev.size ? new Set() : prev));
      return undefined;
    }

    let cancelled = false;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    setScanning(true);
    collectBrokenImageEventIds(list, {
      isAborted: () => cancelled,
      signal: controller?.signal,
      onBroken: (id) => {
        if (cancelled) return;
        setBrokenIds((prev) => {
          if (prev.has(id)) return prev;
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      },
    }).then((ids) => {
      if (cancelled) return;
      setBrokenIds(ids);
      setScanning(false);
    });

    return () => {
      cancelled = true;
      controller?.abort();
    };
  }, [scanKey]);

  return { brokenIds, scanning };
}
