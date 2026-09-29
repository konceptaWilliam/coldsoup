// Client-side routing inside the /g/** shell. Taps use history.pushState,
// which Next 14.2's app router picks up (usePathname/useSearchParams update)
// without fetching an RSC payload. Pure parsing lives here so it's testable;
// browser globals are only touched inside the navigation functions.

export type ShellRoute = { groupId: string | null; threadId: string | null };

const SHELL_RE = /^\/g\/([^/]+)(?:\/t\/([^/]+))?\/?$/;

export function parseShellRoute(pathname: string): ShellRoute {
  const m = SHELL_RE.exec(pathname);
  if (!m) return { groupId: null, threadId: null };
  return { groupId: m[1], threadId: m[2] ?? null };
}

export function isShellPath(path: string): boolean {
  return SHELL_RE.test(path.split(/[?#]/)[0]);
}

// pushState is only safe while the shell is mounted: from any other page the
// app router would keep rendering that page under the new URL.
let shellMounted = false;
export function setShellMounted(mounted: boolean): void {
  shellMounted = mounted;
}
export function isShellMounted(): boolean {
  return shellMounted;
}

type ShellHistoryState = { shellDepth?: number } | null;

function currentDepth(): number {
  return (window.history.state as ShellHistoryState)?.shellDepth ?? 0;
}

export function navigate(path: string): void {
  window.history.pushState({ shellDepth: currentDepth() + 1 }, "", path);
}

// Set by navigateBack so the stack knows a pop came from our own UI (back
// button / swipe) rather than the browser.
let internalBack = false;
export function consumeInternalBack(): boolean {
  const v = internalBack;
  internalBack = false;
  return v;
}

// Back within the shell when we pushed the current entry; otherwise (deep
// link, reload) replace the current entry with the fallback so the hardware
// back button still leaves the app instead of bouncing to the thread.
export function navigateBack(fallbackPath: string): void {
  internalBack = true;
  if (currentDepth() > 0) window.history.back();
  else window.history.replaceState({ shellDepth: 0 }, "", fallbackPath);
}
