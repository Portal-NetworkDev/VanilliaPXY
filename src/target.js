import dns from "node:dns/promises";
import net from "node:net";

const blockedHosts = new Set(["localhost", "localhost.localdomain", "pornhub.com", "www.pornhub.com", "xvideos.com", "www.xvideos.com", "xhamster.com", "www.xhamster.com", "xnxx.com", "www.xnxx.com", "youporn.com", "www.youporn.com", "redtube.com", "www.redtube.com", "spankbang.com", "www.spankbang.com", "tube8.com", "www.tube8.com", "youjizz.com", "www.youjizz.com"]);
const blockedSuffixes = [".pornhub.com", ".xvideos.com", ".xhamster.com", ".xnxx.com", ".youporn.com", ".redtube.com", ".spankbang.com", ".tube8.com", ".youjizz.com"];

export function parseTarget(value) {
  if (!value) return null;
  try {
    const target = new URL(value);
    if (target.username || target.password) return null;
    if (target.protocol !== "http:" && target.protocol !== "https:") return null;
    return target;
  } catch {
    return null;
  }
}

export function isBlockedHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return blockedHosts.has(host) || blockedSuffixes.some(suffix => host.endsWith(suffix));
}

export async function isTargetAllowed(target, allowPrivate = false) {
  if (isBlockedHost(target.hostname)) return false;
  if (allowPrivate) return true;
  const hostname = target.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname.endsWith(".localhost")) return false;
  if (net.isIP(hostname)) return !isPrivateAddress(hostname);
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    return records.length > 0 && records.every(({ address }) => !isPrivateAddress(address));
  } catch {
    return false;
  }
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
  }
  const value = address.toLowerCase();
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:") || value.startsWith("::ffff:10.") || value.startsWith("::ffff:127.") || value.startsWith("::ffff:169.254.") || value.startsWith("::ffff:172.") || value.startsWith("::ffff:192.168.");
}

export function resolveRedirect(location, base) {
  try {
    const next = new URL(location, base);
    if (next.protocol !== "http:" && next.protocol !== "https:") return null;
    if (next.username || next.password || isBlockedHost(next.hostname)) return null;
    return next;
  } catch {
    return null;
  }
}
