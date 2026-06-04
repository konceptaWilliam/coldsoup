import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { createAdminClient } from "@/lib/supabase/admin";

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for successful previews
const FAIL_TTL_MS = 60 * 60 * 1000; // 1 hour for failures (retry sooner)
const MAX_HTML = 500_000; // cap parsed HTML size

// SSRF guard — reject loopback/private/reserved hosts. Literal-IP checks plus
// obvious internal hostnames. (Does not resolve DNS; a hostname pointing at a
// private IP could still slip through — acceptable for a low-risk preview fetch.)
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan")) return true;
  // IPv6 loopback / unique-local (fc00::/7) / link-local (fe80::/10).
  // Only apply to actual IPv6 literals — a hostname like "fcbarcelona.com" is not one.
  if (h.includes(":")) {
    if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

function decodeEntities(s: string | null): string | null {
  if (!s) return s;
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .trim();
}

function metaContent(html: string, prop: string): string | null {
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i");
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i");
  return decodeEntities(html.match(a)?.[1] ?? html.match(b)?.[1] ?? null);
}

export const linksRouter = router({
  unfurl: protectedProcedure
    .input(z.object({ url: z.string().url().max(2000) }))
    .query(async ({ input }) => {
      let parsed: URL;
      try { parsed = new URL(input.url); } catch { return null; }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      if (isPrivateHost(parsed.hostname)) return null;

      const admin = createAdminClient();
      const { data: cached } = await admin.from("link_previews").select("*").eq("url", input.url).maybeSingle();
      if (cached) {
        const age = Date.now() - new Date(cached.fetched_at).getTime();
        if (cached.ok && age < TTL_MS) return cached;
        if (!cached.ok && age < FAIL_TTL_MS) return null;
        // otherwise fall through and refetch
      }

      let result: { url: string; title: string | null; description: string | null; image_url: string | null; ok: boolean } = {
        url: input.url, title: null, description: null, image_url: null, ok: false,
      };

      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        try {
          // Follow redirects manually so every hop's host is SSRF-checked — a
          // public URL must not be able to 30x-redirect into private/internal
          // addresses (cloud metadata, etc.).
          let currentUrl = input.url;
          let res: Response | null = null;
          for (let hop = 0; hop < 4; hop++) {
            const u = new URL(currentUrl);
            if ((u.protocol !== "http:" && u.protocol !== "https:") || isPrivateHost(u.hostname)) {
              res = null;
              break;
            }
            res = await fetch(currentUrl, {
              signal: ctrl.signal,
              redirect: "manual",
              // Many sites only emit OpenGraph to a recognized crawler UA.
              headers: {
                "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
                Accept: "text/html",
              },
            });
            if (res.status >= 300 && res.status < 400) {
              const loc = res.headers.get("location");
              if (!loc) break;
              currentUrl = new URL(loc, currentUrl).toString();
              continue;
            }
            break;
          }

          if (res) {
            const ct = res.headers.get("content-type") ?? "";
            if (res.ok && ct.includes("text/html")) {
              const html = (await res.text()).slice(0, MAX_HTML);
              const base = new URL(currentUrl);
              const title = metaContent(html, "og:title") ?? decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? null);
              const description = metaContent(html, "og:description") ?? metaContent(html, "description");
              let image_url = metaContent(html, "og:image");
              if (image_url) { try { image_url = new URL(image_url, base).toString(); } catch { image_url = null; } }
              result = { url: input.url, title, description, image_url, ok: !!title };
            }
          }
        } finally {
          clearTimeout(timer);
        }
      } catch {
        // network error / timeout / abort → cache as not-ok so we don't refetch immediately
      }

      await admin.from("link_previews").upsert({ ...result, fetched_at: new Date().toISOString() }, { onConflict: "url" });
      return result.ok ? result : null;
    }),
});
