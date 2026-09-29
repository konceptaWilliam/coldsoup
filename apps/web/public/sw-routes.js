// Pure routing rules for the service worker. Loaded by sw.js via
// importScripts (exposes self.swRoutes) and by the Node tests via require.
(function (root) {
  var SHELL_RE = /^\/g\/[^/]+(?:\/t\/[^/]+)?\/?$/;

  // "media" | "static" | "shell" | "root" | "other"
  function classify(url, mode, origin) {
    if (url.pathname.indexOf("/storage/v1/object/public/") !== -1) return "media";
    if (url.origin !== origin) return "other";
    if (
      url.pathname.indexOf("/_next/static/") === 0 ||
      url.pathname.indexOf("/icons/") === 0 ||
      url.pathname === "/apple-touch-icon.png"
    ) {
      return "static";
    }
    if (mode !== "navigate") return "other";
    if (url.search) return "other";
    if (url.pathname === "/") return "root";
    if (SHELL_RE.test(url.pathname)) return "shell";
    return "other";
  }

  // Cache key for a shell page: origin + pathname, no trailing slash.
  function shellKey(url) {
    var p = url.pathname;
    if (p.length > 1 && p.charAt(p.length - 1) === "/") p = p.slice(0, -1);
    return url.origin + p;
  }

  // Only store real HTML pages from our own origin.
  function isCacheableShell(res) {
    return !!res.ok && res.type === "basic" && String(res.contentType || "").indexOf("text/html") !== -1;
  }

  var api = { classify: classify, shellKey: shellKey, isCacheableShell: isCacheableShell };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.swRoutes = api;
})(typeof self !== "undefined" ? self : globalThis);
