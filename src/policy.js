import { isBlockedHost, isTargetAllowed, parseTarget } from "./target.js";

export async function validateTarget(value, allowPrivate = false) {
  const target = parseTarget(value);
  if (!target || isBlockedHost(target.hostname)) return null;
  if (!(await isTargetAllowed(target, allowPrivate))) return null;
  return target;
}

export async function validateRedirect(location, base, allowPrivate = false) {
  try {
    const target = new URL(location, base);
    if (target.username || target.password) return null;
    if (target.protocol !== "http:" && target.protocol !== "https:") return null;
    return validateTarget(target.href, allowPrivate);
  } catch {
    return null;
  }
}
