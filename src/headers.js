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

export function requestHeaders(headers, target) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (value == null || hopByHop.has(lower) || lower === "host") continue;
    result[name] = value;
  }
  result.host = target.host;
  return result;
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
