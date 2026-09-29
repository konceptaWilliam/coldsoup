import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const routes = require("../public/sw-routes.js") as {
  classify(url: URL, mode: string, origin: string): string;
  shellKey(url: URL): string;
  isCacheableShell(res: { ok: boolean; type: string; contentType: string }): boolean;
};

const O = "https://app.example";
const u = (p: string) => new URL(p, O);

test("classify: shell pages", () => {
  for (const p of ["/g/a", "/g/a/", "/g/a/t/b", "/g/a/t/b/"]) {
    assert.equal(routes.classify(u(p), "navigate", O), "shell", p);
  }
});

test("classify: query strings go to the network", () => {
  assert.equal(routes.classify(u("/g/a/t/b?highlight=x"), "navigate", O), "other");
});

test("classify: root", () => {
  assert.equal(routes.classify(u("/"), "navigate", O), "root");
});

test("classify: other pages", () => {
  for (const p of ["/login", "/settings", "/g", "/g/a/t", "/invite/x"]) {
    assert.equal(routes.classify(u(p), "navigate", O), "other", p);
  }
});

test("classify: static assets (any mode)", () => {
  assert.equal(routes.classify(u("/_next/static/chunks/x.js"), "no-cors", O), "static");
  assert.equal(routes.classify(u("/icons/icon-192.png"), "no-cors", O), "static");
  assert.equal(routes.classify(u("/apple-touch-icon.png"), "no-cors", O), "static");
});

test("classify: supabase media on another origin", () => {
  const m = new URL("https://abc.supabase.co/storage/v1/object/public/attachments/u/x.png");
  assert.equal(routes.classify(m, "no-cors", O), "media");
});

test("classify: foreign origin and non-navigate pages", () => {
  assert.equal(routes.classify(new URL("https://cdn.example/x.js"), "no-cors", O), "other");
  assert.equal(routes.classify(u("/g/a"), "cors", O), "other");
});

test("shellKey strips trailing slash, query and hash", () => {
  assert.equal(routes.shellKey(u("/g/a/t/b/")), `${O}/g/a/t/b`);
  assert.equal(routes.shellKey(u("/g/a?x=1#y")), `${O}/g/a`);
});

test("isCacheableShell", () => {
  assert.equal(routes.isCacheableShell({ ok: true, type: "basic", contentType: "text/html; charset=utf-8" }), true);
  assert.equal(routes.isCacheableShell({ ok: false, type: "basic", contentType: "text/html" }), false);
  assert.equal(routes.isCacheableShell({ ok: true, type: "opaqueredirect", contentType: "" }), false);
  assert.equal(routes.isCacheableShell({ ok: true, type: "basic", contentType: "text/x-component" }), false);
});
