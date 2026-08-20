import { useEffect, useRef, useState } from 'react';

/**
 * Soften (blur) metrics as soon as the week changes; keep blurred through the
 * fetch, then unblur after a short minimum so the motion always reads.
 */
function useOverviewMetricsSoften(metricsShouldSoften) {
  const [metricsSoftened, setMetricsSoftened] = useState(false);
  const softenStartedAtRef = useRef(0);

  useEffect(() => {
    if (metricsShouldSoften) {
      if (!metricsSoftened) softenStartedAtRef.current = Date.now();
      setMetricsSoftened(true);
      return undefined;
    }
    if (!metricsSoftened) return undefined;
    const elapsed = Date.now() - softenStartedAtRef.current;
    const remaining = Math.max(0, 320 - elapsed);
    const id = window.setTimeout(() => setMetricsSoftened(false), remaining);
    return () => window.clearTimeout(id);
  }, [metricsShouldSoften, metricsSoftened]);

  return metricsSoftened;
}

export default useOverviewMetricsSoften;
