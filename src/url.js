const protocols = new Set(["http:", "https:"]);
const skip = /^(?:#|data:|mailto:|javascript:|blob:|about:)/i;
const defaultEndpoint = "/vanillia?url=";
const bareHost = /^(?:(?:www|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.){2,}[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i;

function normalizeAddress(value) {
  const input = String(value ?? "").trim();
  return bareHost.test(input) ? `https://${input}` : input;
}

export function isCaptchaResource(value, base) {
  try {
    const url = new URL(normalizeAddress(value), base);
    const host = url.hostname.toLowerCase();
    const isGoogleHost = host === "google.com" || host.endsWith(".google.com");
    const isRecaptchaHost = host === "recaptcha.net" || host.endsWith(".recaptcha.net");
    const isGstaticHost = host === "gstatic.com" || host.endsWith(".gstatic.com");
    const hasCaptchaPath = /(?:recaptcha|captcha|challenge)/i.test(url.pathname + url.search);
    const hasGoogleVerifyKey = isGoogleHost && /(?:^|[?&])(?:k|sitekey|render)=/i.test(url.search);
    return url.protocol === "https:" && (hasCaptchaPath || hasGoogleVerifyKey) &&
      (isGoogleHost || isRecaptchaHost || isGstaticHost);
  } catch {
    return false;
  }
}

export function rewriteUrl(value, base, endpoint = "/vanillia?url=") {
  const input = String(value ?? "").trim();
  if (!input || skip.test(input)) return value;
  const normalized = normalizeAddress(input);
  if (isCaptchaResource(normalized, base)) return value;
  try {
    const resolved = new URL(normalized, base);
    if (!protocols.has(resolved.protocol)) return value;
    if (isCaptchaResource(resolved.href, base)) return value;
    if (input.startsWith(defaultEndpoint) || input.startsWith(endpoint)) return value;
    const proxyEndpoint = new URL(endpoint, base);
    if (resolved.origin === proxyEndpoint.origin && resolved.pathname === proxyEndpoint.pathname && resolved.searchParams.has("url")) return value;
    return `${endpoint}${encodeURIComponent(resolved.href)}`;
  } catch {
    return value;
  }
}

export function rewriteSrcset(value, base, endpoint = "/vanillia?url=") {
  const input = String(value ?? "");
  const candidates = [];
  let index = 0;

  while (index < input.length) {
    while (index < input.length && /[\s,]/.test(input[index])) index++;
    if (index >= input.length) break;

    const start = index;
    while (index < input.length && !/\s/.test(input[index])) index++;
    let candidateUrl = input.slice(start, index);
    const dataUrl = /^data:/i.test(candidateUrl);
    let endsCandidate = false;
    while (candidateUrl.endsWith(",")) {
      candidateUrl = candidateUrl.slice(0, -1);
      endsCandidate = true;
    }
    if (!candidateUrl) continue;

    let descriptor = "";
    if (dataUrl && !endsCandidate) {
      const comma = candidateUrl.indexOf(",");
      const dataHeader = candidateUrl.slice(0, comma + 1);
      const dataPayload = candidateUrl.slice(comma + 1);
      if (dataPayload) candidateUrl = dataHeader + dataPayload;
    }
    if (!endsCandidate && index < input.length) {
      while (index < input.length && /\s/.test(input[index])) index++;
      const descriptorStart = index;
      while (index < input.length && input[index] !== ",") index++;
      descriptor = input.slice(descriptorStart, index).trim();
      if (input[index] === ",") index++;
    }

    const rewritten = rewriteUrl(candidateUrl, base, endpoint);
    candidates.push(`${rewritten}${descriptor ? ` ${descriptor}` : ""}`);
  }

  return candidates.join(", ");
}
