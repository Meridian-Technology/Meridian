import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export function mergeIngestOverrides(events, overrides) {
  if (!overrides?.size || !Array.isArray(events)) return events;
  return events.map((event) => {
    const status = overrides.get(String(event._id));
    if (!status || status === event.ingestStatus) return event;
    return { ...event, ingestStatus: status };
  });
}

export function pruneMatchingOverrides(events, overrides) {
  if (!overrides?.size) return overrides || new Map();
  if (!events?.length) return overrides;
  const byId = new Map(events.map((event) => [String(event._id), event]));
  const next = new Map();
  let changed = false;
  overrides.forEach((status, id) => {
    const event = byId.get(String(id));
    if (!event || event.ingestStatus === status) {
      changed = true;
      return;
    }
    next.set(id, status);
  });
  return changed ? next : overrides;
}

export default function useOptimisticIngestStatus(catalogEvents) {
  const [overrides, setOverrides] = useState(() => new Map());
  const overridesRef = useRef(overrides);
  const catalogRef = useRef(catalogEvents);
  catalogRef.current = catalogEvents;

  useEffect(() => {
    setOverrides((current) => {
      const next = pruneMatchingOverrides(catalogEvents, current);
      if (next === current) return current;
      overridesRef.current = next;
      return next;
    });
  }, [catalogEvents]);

  const events = useMemo(
    () => mergeIngestOverrides(catalogEvents, overrides),
    [catalogEvents, overrides],
  );

  const apply = useCallback((ids, status) => {
    const previous = new Map();
    const catalog = catalogRef.current || [];
    const current = overridesRef.current;
    const next = new Map(current);
    (ids || []).forEach((id) => {
      const key = String(id);
      const row = catalog.find((event) => String(event._id) === key);
      previous.set(key, current.get(key) ?? row?.ingestStatus ?? null);
      next.set(key, status);
    });
    overridesRef.current = next;
    setOverrides(next);
    return previous;
  }, []);

  const revert = useCallback((previous) => {
    if (!previous?.size) return;
    const next = new Map(overridesRef.current);
    previous.forEach((status, id) => {
      if (status == null) next.delete(String(id));
      else next.set(String(id), status);
    });
    overridesRef.current = next;
    setOverrides(next);
  }, []);

  return { events, apply, revert };
}
