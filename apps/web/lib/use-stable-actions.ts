"use client";

import { useRef } from "react";

// Returns an object whose identity never changes; each method forwards to the
// latest function passed in. Lets memoized children receive handlers that
// close over fresh state without re-rendering when that state changes.
// The key set is fixed by the first render.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useStableActions<T extends Record<string, (...args: any[]) => any>>(fns: T): T {
  const latest = useRef(fns);
  latest.current = fns;
  const stable = useRef<T | null>(null);
  if (!stable.current) {
    const out = {} as Record<string, unknown>;
    for (const key of Object.keys(fns)) {
      out[key] = (...args: unknown[]) => latest.current[key](...args);
    }
    stable.current = out as T;
  }
  return stable.current;
}
