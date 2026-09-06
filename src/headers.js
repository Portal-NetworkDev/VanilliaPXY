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

const restricted = new Set(["content-length", "content-encoding"]);
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
    if (restricted.has(lower)) continue;
    if (rewritten && (lower === "content-security-policy" || lower === "content-security-policy-report-only")) continue;
    if (lower === "set-cookie") {
      result[name] = normalizeCookies(value);
      continue;
    }
    result[name] = value;
  }

  result["x-robots-tag"] = "noindex, nofollow, noarchive";
  result["cross-origin-resource-policy"] = "same-origin";

  if (rewritten) {
    result["cross-origin-opener-policy"] = "same-origin";
    result["cross-origin-embedder-policy"] = "require-corp";
  }

  return result;
}

function normalizeCookies(value) {
  const cookies = Array.isArray(value) ? value : [value];
  return cookies.map(cookie => cookie.replace(/;\s*Domain=[^;]*/gi, ""));
}
