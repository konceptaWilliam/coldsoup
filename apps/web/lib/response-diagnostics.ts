// Diagnostics for tRPC responses the client can't parse as JSON.
//
// WebKit reports a failed `Response.json()` as the opaque DOMException
// "The string did not match the expected pattern." — which tells us nothing
// about what the server (or Vercel, or the network) actually sent. This wraps
// fetch so that, when parsing fails, we beacon the response's shape to
// /api/client-log (visible in Vercel logs) and throw a readable error instead.

const SNIPPET_MAX = 200;

export type BodySummary = {
  length: number;
  looksLikeJson: boolean;
  /** Only filled for non-JSON bodies: truncated JSON may hold private messages. */
  snippet: string;
};

export function summarizeBody(text: string): BodySummary {
  const looksLikeJson = /^\s*[[{]/.test(text);
  return {
    length: text.length,
    looksLikeJson,
    snippet: looksLikeJson ? "" : text.slice(0, SNIPPET_MAX),
  };
}

type Phase = "read-body" | "parse";

function report(details: Record<string, unknown>): void {
  try {
    const payload = JSON.stringify({
      ...details,
      online: navigator.onLine,
      standalone: window.matchMedia("(display-mode: standalone)").matches,
      userAgent: navigator.userAgent,
    });
    if (!navigator.sendBeacon?.("/api/client-log", payload)) {
      void fetch("/api/client-log", { method: "POST", body: payload, keepalive: true }).catch(
        () => {},
      );
    }
  } catch {
    // Diagnostics must never break the request path.
  }
}

function procedurePath(input: RequestInfo | URL | string): string {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    // Pathname only: GET query strings carry procedure inputs.
    return new URL(raw, window.location.href).pathname;
  } catch {
    return "?";
  }
}

export async function diagnosticFetch(
  input: RequestInfo | URL | string,
  init?: RequestInit,
): Promise<Response> {
  const startedAt = Date.now();
  const visibilityAtStart = document.visibilityState;
  const res = await fetch(input, init);

  const fail = (phase: Phase, extra: Record<string, unknown>) =>
    report({
      phase,
      path: procedurePath(input),
      method: init?.method ?? "GET",
      status: res.status,
      contentType: res.headers.get("content-type"),
      vercelId: res.headers.get("x-vercel-id"),
      durationMs: Date.now() - startedAt,
      visibilityAtStart,
      visibilityAtFail: document.visibilityState,
      ...extra,
    });

  // tRPC only calls res.json() (and keeps `res` for status/meta), so override
  // that one method: a single read + parse, no cost on the happy path.
  res.json = async () => {
    let text: string;
    try {
      text = await res.text();
    } catch (err) {
      fail("read-body", { error: String(err) });
      throw err;
    }
    try {
      return JSON.parse(text);
    } catch {
      fail("parse", summarizeBody(text));
      throw new Error(
        `Unexpected server response (HTTP ${res.status}). Please try again.`,
      );
    }
  };
  return res;
}
