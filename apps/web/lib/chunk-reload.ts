// After a deploy, a cached (older) page can ask for a lazy chunk the server no
// longer has. Reload once to pick up the current build; a sessionStorage flag
// prevents a reload loop if the chunk is genuinely broken.

const FLAG = "coldsoup:chunk-reload";
const CHUNK_RE = /Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module/;

export function isChunkError(reason: unknown): boolean {
  if (!reason || typeof reason !== "object") return false;
  const e = reason as { name?: unknown; message?: unknown };
  return e.name === "ChunkLoadError" || CHUNK_RE.test(String(e.message ?? ""));
}

let installed = false;

export function installChunkReload(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const recover = (reason: unknown) => {
    if (!isChunkError(reason)) return;
    try {
      if (sessionStorage.getItem(FLAG)) return;
      sessionStorage.setItem(FLAG, "1");
    } catch {
      return;
    }
    window.location.reload();
  };

  window.addEventListener("error", (e) => recover(e.error ?? { message: e.message }));
  window.addEventListener("unhandledrejection", (e) => recover(e.reason));
  // A load that survives 10s is healthy; allow a future recovery again.
  setTimeout(() => {
    try {
      sessionStorage.removeItem(FLAG);
    } catch {}
  }, 10_000);
}
