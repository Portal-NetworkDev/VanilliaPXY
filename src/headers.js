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

  const origin = headers.origin ? originalOrigin(headers.origin, referer, target) : null;
  if (origin) result.origin = origin;

  if (headers["sec-fetch-dest"]) result["sec-fetch-dest"] = headers["sec-fetch-dest"];
  if (headers["sec-fetch-mode"]) result["sec-fetch-mode"] = headers["sec-fetch-mode"];
  if (headers["sec-fetch-user"]) result["sec-fetch-user"] = headers["sec-fetch-user"];

  const pageOrigin = referer ? safeOrigin(referer) : origin;
  if (pageOrigin) result["sec-fetch-site"] = fetchSite(pageOrigin, target.origin);

  return result;
}

function originalOrigin(value, referer, target) {
  try {
    if (referer) return new URL(referer).origin;
    if (value && /^https?:\/\//i.test(value)) return new URL(value).origin;
  } catch {}
  return target.origin;
}

function safeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function fetchSite(origin, targetOrigin) {
  try {
    const source = new URL(origin);
    const target = new URL(targetOrigin);
    if (source.origin === target.origin) return "same-origin";
    if (sameSite(source.hostname, target.hostname)) return "same-site";
  } catch {}
  return "cross-site";
}

function sameSite(left, right) {
  const a = left.toLowerCase().split(".").filter(Boolean);
  const b = right.toLowerCase().split(".").filter(Boolean);
  if (a.length < 2 || b.length < 2) return left === right;
  return a.slice(-2).join(".") === b.slice(-2).join(".");
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
    if (lower === "access-control-allow-origin" || lower === "access-control-allow-credentials") continue;
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
  return cookies.map(cookie => {
    let normalized = String(cookie).replace(/;\s*Domain=[^;]*/gi, "");
    if (/;\s*Path=/i.test(normalized)) normalized = normalized.replace(/;\s*Path=[^;]*/gi, "; Path=/");
    else normalized += "; Path=/";
    return normalized;
  });
}
