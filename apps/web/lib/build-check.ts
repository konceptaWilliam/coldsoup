// The service worker answers /g/** from its cache first, so the first launch
// after a deploy boots the previous build (its chunks are cached too, so
// nothing fails and chunk-reload.ts never fires). Ask the server which build
// is live and, if it isn't ours, drop the cached shell and reload once.

/** Must match SHELL_CACHE in public/sw.js. */
const SHELL_CACHE = "coldsoup-shell-v1";
/** sessionStorage: the build we already reloaded for, so a lagging CDN can't loop. */
const FLAG = "coldsoup:build-reload";
/** Don't re-ask on every app switch. */
const RECHECK_MS = 5 * 60_000;

export function isStaleBuild(
  current: string | undefined,
  latest: unknown,
  reloadedFor: string | null,
): latest is string {
  return !!current && typeof latest === "string" && latest !== "" && latest !== current && latest !== reloadedFor;
}

let installed = false;

export function installBuildCheck(): void {
  if (installed || typeof window === "undefined" || process.env.NODE_ENV !== "production") return;
  installed = true;
  const current = process.env.NEXT_PUBLIC_BUILD_ID;
  let lastCheck = 0;

  const check = async () => {
    lastCheck = Date.now();
    let latest: unknown;
    try {
      const res = await fetch("/api/build", { cache: "no-store" });
      if (!res.ok) return;
      latest = ((await res.json()) as { build?: unknown }).build;
    } catch {
      return; // Offline: the cached build is all there is.
    }
    try {
      if (!isStaleBuild(current, latest, sessionStorage.getItem(FLAG))) return;
      sessionStorage.setItem(FLAG, latest as string);
    } catch {
      return;
    }
    // Without this the reload is answered from the same stale cached page.
    try {
      await caches.delete(SHELL_CACHE);
    } catch {}
    window.location.reload();
  };

  void check();
  // Long-lived tabs / a backgrounded PWA pick up a deploy when they come back.
  // Drafts are already in localStorage, so the reload loses nothing typed.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastCheck > RECHECK_MS) void check();
  });
}
