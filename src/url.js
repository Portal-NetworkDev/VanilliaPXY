const protocols = new Set(["http:", "https:"]);
const skip = /^(?:[a-z][a-z0-9+.-]*:|#|data:|mailto:|javascript:|blob:|about:)/i;

export function rewriteUrl(value, base, endpoint = "/vanillia?url=") {
  const input = String(value ?? "").trim();
  if (!input || skip.test(input)) return value;
  try {
    const resolved = new URL(input, base);
    if (!protocols.has(resolved.protocol)) return value;
    return `${endpoint}${encodeURIComponent(resolved.href)}`;
  } catch {
    return value;
  }
}

export function rewriteSrcset(value, base, endpoint = "/vanillia?url=") {
  return String(value ?? "").split(",").map(candidate => {
    const match = candidate.trim().match(/^(\S+)(\s+.+)?$/);
    if (!match) return candidate;
    return `${rewriteUrl(match[1], base, endpoint)}${match[2] || ""}`;
  }).join(", ");
}
