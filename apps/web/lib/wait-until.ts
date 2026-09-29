// Run background work after the response flushes without Vercel freezing the
// function mid-flight. Mirrors @vercel/functions' waitUntil by reading Vercel's
// request-context symbol; off-Vercel (dev / self-host) the Node process is
// long-lived, so a plain fire-and-forget is safe.
export function waitUntil(promise: Promise<unknown>): void {
  const ctx = (globalThis as Record<symbol, unknown>)[
    Symbol.for("@vercel/request-context")
  ] as { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined;
  const fn = ctx?.get?.()?.waitUntil;
  if (fn) fn(promise);
  else void promise.catch(() => {});
}
