const hopByHop = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

const browserRouting = new Set(["origin", "referer", "sec-fetch-site"]);

export function requestHeaders(headers, target) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (value == null || hopByHop.has(lower) || lower === "host" || browserRouting.has(lower)) continue;
    result[name] = value;
  }

  const referer = originalReferer(headers.referer);
  if (referer) result.referer = referer;

  if (headers.origin) result.origin = target.origin;

  result.host = target.host;
  return result;
}

function originalReferer(value) {
  if (!value) return null;
  try {
    const referer = new URL(String(value));
    const encoded = referer.searchParams.get("url");
    if (encoded) {
      const original = new URL(encoded);
      return original.href;
    }
    return value;
  } catch {
    return value;
  }
}

export function responseHeaders(headers, { rewritten = false } = {}) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (value == null || hopByHop.has(lower)) continue;
    if (rewritten && (lower === "content-security-policy" || lower === "content-security-policy-report-only")) continue;
    if (lower === "set-cookie") {
      result[name] = normalizeCookies(value);
      continue;
    }
    result[name] = value;
  }

  result["x-robots-tag"] = "noindex, nofollow, noarchive";
  result["cross-origin-resource-policy"] = "cross-origin";

  // Do not impose COEP on ordinary proxied websites. COEP=require-corp
  // makes the browser reject third-party resources that the page creates
  // before our runtime can rewrite them. That is exactly what breaks pages
  // such as Minecraft with ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep.
  // Cross-origin isolation should be enabled by a dedicated deployment/path
  // when a site such as Eaglercraft actually requires SharedArrayBuffer.
  delete result["cross-origin-opener-policy"];
  delete result["cross-origin-embedder-policy"];

  return result;
}

function normalizeCookies(value) {
  const cookies = Array.isArray(value) ? value : [value];
  return cookies.map(cookie => cookie.replace(/;\s*Domain=[^;]*/gi, ""));
}
