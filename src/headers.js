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

export function responseHeaders(headers) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (value == null || hopByHop.has(lower)) continue;
    if (restricted.has(lower)) continue;
    if (lower === "set-cookie") {
      result[name] = normalizeCookies(value);
      continue;
    }
    result[name] = value;
  }
  return result;
}

function normalizeCookies(value) {
  const cookies = Array.isArray(value) ? value : [value];
  return cookies.map(cookie => cookie.replace(/;\s*Domain=[^;]*/gi, ""));
}
