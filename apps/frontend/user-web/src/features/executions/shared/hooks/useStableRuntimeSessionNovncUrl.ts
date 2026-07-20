import React from 'react';
import {
  getRuntimeSessionNovncUrl,
  resolveStableRuntimeSessionNovncUrl,
  type RuntimeSessionLike,
} from '@/features/executions/shared/lib/runtimeSession';

export function useStableRuntimeSessionNovncUrl(runtimeSession?: RuntimeSessionLike) {
  const runtimeSessionNovncUrl = getRuntimeSessionNovncUrl(runtimeSession);
  const lastKnownRuntimeSessionNovncUrlRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    if (runtimeSessionNovncUrl) {
      lastKnownRuntimeSessionNovncUrlRef.current = runtimeSessionNovncUrl;
    }
  }, [runtimeSessionNovncUrl]);

  return resolveStableRuntimeSessionNovncUrl(
    runtimeSessionNovncUrl,
    lastKnownRuntimeSessionNovncUrlRef.current
  );
}
