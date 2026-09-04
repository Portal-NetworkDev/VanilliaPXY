export function rewriteSetCookie(value, target) {
  if (!value) return value;
  return String(value)
    .replace(/(^|;\s*)Domain=[^;]*/i, "$1")
    .replace(/(^|;\s*)Path=[^;]*/i, "$1Path=/");
}

export function rewriteCookieHeader(value) {
  return String(value || "");
}
