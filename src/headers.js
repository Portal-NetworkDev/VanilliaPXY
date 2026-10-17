const publicSuffixes = new Set(["com", "org", "net", "edu", "gov", "mil", "int", "biz", "info", "name", "pro", "aero", "coop", "museum", "uk", "co.uk", "org.uk", "gov.uk", "ac.uk", "com.au", "net.au", "org.au", "co.nz", "com.br", "co.jp", "co.in", "com.mx", "com.cn", "com.hk", "com.sg", "co.kr", "com.tw", "com.tr"]);

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
    if (lower === "cookie") {
      const scoped = filterCookies(value, target.hostname);
      if (scoped) result[name] = scoped;
      continue;
    }
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
  if (isDuckDuckGoScript(target)) {
    result["sec-fetch-dest"] = "script";
    result["sec-fetch-mode"] = "no-cors";
    result["sec-fetch-site"] = "same-site";
    result.referer = "https://duckduckgo.com/";
  }
  return result;
}

function isDuckDuckGoScript(target) {
  try {
    const url = new URL(target);
    return url.hostname === "links.duckduckgo.com" && url.pathname === "/d.js";
  } catch {
    return false;
  }
}

function originalOrigin(value, referer, target) {
  try {
    if (referer) return new URL(referer).origin;
    if (value && /^https?:\/\//i.test(value)) return new URL(value).origin;
  } catch {}
  return target.origin;
}

function safeOrigin(value) {
  try { return new URL(value).origin; } catch { return null; }
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

export function responseHeaders(headers, { rewritten = false, targetHost = "" } = {}) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (value == null || hopByHop.has(lower)) continue;
    if (rewritten && ["content-security-policy", "content-security-policy-report-only", "content-security-policy-report-to"].includes(lower)) continue;
    if (lower === "x-frame-options") continue;
    if (rewritten && ["permissions-policy", "origin-agent-cluster", "cross-origin-opener-policy", "cross-origin-embedder-policy", "cross-origin-resource-policy"].includes(lower)) continue;
    if (lower === "set-cookie") {
      const cookies = Array.isArray(value) ? value : splitSetCookieHeaders(String(value));
      result[name] = normalizeCookies(cookies, targetHost);
      continue;
    }
    if (["access-control-allow-origin", "access-control-allow-credentials"].includes(lower)) continue;
    result[name] = value;
  }
  result["x-robots-tag"] = "noindex, nofollow, noarchive";
  result["cross-origin-resource-policy"] = "cross-origin";
  delete result["cross-origin-opener-policy"];
  delete result["cross-origin-embedder-policy"];
  return result;
}

function splitSetCookieHeaders(value) {
  return value.split(/,(?=\s*[^;,\s]+=)/g).map(cookie => cookie.trim()).filter(Boolean);
}

function normalizeCookies(value, targetHost) {
  return value.map(cookie => {
    const source = String(cookie);
    const domainAttribute = source.match(/;\s*Domain=([^;]+)/i)?.[1];
    const domain = cookieScopeDomain(targetHost, domainAttribute);
    if (domain === null) return null;
    const firstAttributeEnd = source.indexOf(";");
    const pair = firstAttributeEnd < 0 ? source : source.slice(0, firstAttributeEnd);
    const separator = pair.indexOf("=");
    let normalized = source.replace(/;\s*Domain=[^;]*/gi, "");
    if (separator > 0 && domain) {
      const name = pair.slice(0, separator).trim();
      if (!name.includes("__vanilliapxy_")) {
        normalized = `${name}__vanilliapxy_${domain}=${pair.slice(separator + 1)}` + normalized.slice(pair.length);
      }
    }
    if (/;\s*Path=/i.test(normalized)) normalized = normalized.replace(/;\s*Path=[^;]*/gi, "; Path=/");
    else normalized += "; Path=/";
    return normalized;
  }).filter(Boolean);
}

function cookieScopeDomain(targetHost, domainAttribute) {
  const host = String(targetHost ?? "").toLowerCase().replace(/\.$/, "");
  if (!host) return "";
  const requested = String(domainAttribute ?? host).toLowerCase().replace(/^\./, "").replace(/\.$/, "");
  if (!requested || !/^[a-z0-9.-]+$/i.test(requested)) return null;
  if (publicSuffixes.has(requested) || (requested.split(".").length === 2 && requested.endsWith(".uk"))) return null;
  return host === requested || host.endsWith(`.${requested}`) ? requested : null;
}

function filterCookies(value, hostname) {
  const host = String(hostname ?? "").toLowerCase().replace(/\.$/, "");
  const visible = [];
  for (const cookie of String(value).split(/;\s*/).filter(Boolean)) {
    const separator = cookie.indexOf("=");
    if (separator <= 0) continue;
    const name = cookie.slice(0, separator).trim();
    const marker = name.lastIndexOf("__vanilliapxy_");
    if (marker < 0) continue;
    const domain = name.slice(marker + "__vanilliapxy_".length).toLowerCase();
    if (host !== domain && !host.endsWith(`.${domain}`)) continue;
    visible.push(`${name.slice(0, marker)}=${cookie.slice(separator + 1)}`);
  }
  return visible.join("; ");
}
