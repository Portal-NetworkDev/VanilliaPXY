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

const browserOnly = new Set([
  "host",
  "content-length",
  "origin",
  "referer",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-user"
]);

export function requestHeaders(headers, target) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (value == null || hopByHop.has(lower) || browserOnly.has(lower)) continue;
    result[name] = value;
  }

  const referer = originalReferer(headers.referer);
  if (referer) result.referer = referer;

  if (headers.origin) result.origin = target.origin;
  result.host = target.host;

  if (headers["sec-fetch-dest"]) result["sec-fetch-dest"] = headers["sec-fetch-dest"];
  if (headers["sec-fetch-mode"]) result["sec-fetch-mode"] = headers["sec-fetch-mode"];
  if (headers["sec-fetch-user"]) result["sec-fetch-user"] = headers["sec-fetch-user"];
  result["sec-fetch-site"] = "same-origin";

  return result;
}

function originalReferer(value) {
  if (!value) return null;
  try {
    const referer = new URL(String(value));
    const encoded = referer.searchParams.get("url");
    if (encoded) return new URL(encoded).href;
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
  delete result["cross-origin-opener-policy"];
  delete result["cross-origin-embedder-policy"];

  return result;
}

function normalizeCookies(value) {
  const cookies = Array.isArray(value) ? value : [value];
  return cookies.map(cookie => cookie.replace(/;\s*Domain=[^;]*/gi, ""));
}
