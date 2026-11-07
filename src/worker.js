import { validateTarget, validateRedirect } from "./policy-worker.js";
import { resolveProxyTarget } from "./proxy-target.js";
import { requestHeaders, responseHeaders } from "./headers.js";
import { rewriteCss, rewriteHtml, rewriteWorkerScript } from "./rewriter.js";
import { runtimeScript } from "./runtime.js";
import { serviceWorkerResponse } from "./service-worker.js";
import { adblockerScript } from "./adblocker.js";

const timeout = 30000;
const maxRedirects = 8;
const maxRewriteSize = 256 * 1024 * 1024;
const endpoint = "/vanillia?url=";

function errorResponse(status, message) {
  return new Response(message, { status, headers: {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow, noarchive",
    "access-control-allow-origin": "*"
  }});
}
function headersObject(headers) {
  const result = {};
  for (const [name, value] of headers) result[name] = value;
  return result;
}
function responseHeadersInit(values) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(values)) {
    if (name.toLowerCase() === "set-cookie") {
      for (const cookie of Array.isArray(value) ? value : [value]) headers.append(name, cookie);
    } else {
      headers.set(name, value);
    }
  }
  return headers;
}
function canRewrite(headers) {
  const type = String(headers.get("content-type") || "").toLowerCase();
  return type.includes("text/html") || type.includes("text/css") || type.includes("javascript");
}
function proxyEndpoint(request) {
  return new URL(endpoint, new URL(request.url).origin).href;
}
function proxiedRedirect(location, base, request) {
  const absolute = new URL(location, base);
  const destination = new URL(endpoint, new URL(request.url).origin);
  destination.searchParams.set("url", absolute.href);
  const requestUrl = new URL(request.url);
  const redirects = Number(requestUrl.searchParams.get("__vanillia_redirects")) || 0;
  if (redirects < maxRedirects) destination.searchParams.set("__vanillia_redirects", String(redirects + 1));
  return destination.href;
}
async function readBody(response) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxRewriteSize) return null;
  const buffer = await response.arrayBuffer();
  return buffer.byteLength > maxRewriteSize ? null : new Uint8Array(buffer);
}

export function decodeResponseText(body, contentType = "") {
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }

  let charset = String(contentType).match(/\bcharset\s*=\s*["']?([^;"'\s]+)/i)?.[1];
  if (!charset && /(?:text\/html|application\/xhtml\+xml)/i.test(contentType)) {
    const prefix = new TextDecoder("windows-1252").decode(bytes.subarray(0, 4096));
    const metaTags = prefix.match(/<meta\b[^>]*>/gi) || [];
    for (const tag of metaTags) {
      charset = tag.match(/\bcharset\s*=\s*["']?([^\s"'/>;]+)/i)?.[1];
      if (!charset && /\bhttp-equiv\s*=\s*["']?content-type/i.test(tag)) {
        const content = tag.match(/\bcontent\s*=\s*(["'])(.*?)\1/i)?.[2] || "";
        charset = content.match(/\bcharset\s*=\s*([^;\s]+)/i)?.[1];
      }
      if (charset) break;
    }
    if (!charset) charset = "windows-1252";
  }

  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
async function proxyRequest(request, target, redirects = 0) {
  if (redirects > maxRedirects) return errorResponse(508, "Too many redirects");
  const allowed = await validateTarget(target.href);
  if (!allowed) return errorResponse(403, "Target is not allowed");
  const headers = requestHeaders(headersObject(request.headers), target);
  headers["accept-encoding"] = "identity";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const upstream = await fetch(target.href, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
      signal: controller.signal
    });
    const location = upstream.headers.get("location");
    const rewrittenResponse = canRewrite(upstream.headers);
    const headersOut = responseHeaders(headersObject(upstream.headers), { rewritten: rewrittenResponse, targetHost: target.hostname });
    if (location) {
      const redirect = await validateRedirect(location, target);
      if (!redirect) return errorResponse(403, "Redirect target is not allowed");
      headersOut.location = proxiedRedirect(location, target, request);
    }
    if (!rewrittenResponse || [204, 304].includes(upstream.status)) {
      return new Response(upstream.body, { status: upstream.status, headers: responseHeadersInit(headersOut) });
    }
    const body = await readBody(upstream);
    if (body === null) return errorResponse(413, "Response exceeds rewrite limit");
    const type = String(upstream.headers.get("content-type") || "").toLowerCase();
    const source = decodeResponseText(body, upstream.headers.get("content-type") || "");
    const absoluteEndpoint = proxyEndpoint(request);
    const iconUrl = new URL("/favicon", new URL(request.url).origin);
    iconUrl.searchParams.set("url", target.href);
    const iconHref = type.includes("text/html") ? iconUrl.href : "";
    const rewritten = type.includes("text/css")
      ? rewriteCss(source, target.href, absoluteEndpoint)
      : type.includes("javascript")
        ? rewriteWorkerScript(source, target.href, absoluteEndpoint)
        : rewriteHtml(source, target.href, absoluteEndpoint, runtimeScript(absoluteEndpoint, "/service-worker.js", target.href) + adblockerScript(), iconHref);
    delete headersOut["content-length"];
    delete headersOut["content-encoding"];
    const outputType = String(headersOut["content-type"] || "text/html")
      .replace(/;\s*charset\s*=\s*(?:"[^"]*"|'[^']*'|[^;\s]+)/i, "")
      .replace(/;\\s*$/, "");
    headersOut["content-type"] = outputType + "; charset=utf-8";
    return new Response(rewritten, { status: upstream.status, headers: responseHeadersInit(headersOut) });
  } catch (error) {
    return error?.name === "AbortError" ? errorResponse(504, "Upstream request timed out") : errorResponse(502, "Unable to reach upstream");
  } finally {
    clearTimeout(timer);
  }
}
export async function handleWorkerRequest(request) {
  const url = new URL(request.url);
  if (url.pathname === "/health") return new Response(JSON.stringify({ status: "ok", version: "0.3.8", runtime: "cloudflare" }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }});
  if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" }});
  if (url.pathname === "/service-worker.js") return serviceWorkerResponse();
  if (url.pathname === "/favicon") {
    const rawTarget = url.searchParams.get("url") || (url.searchParams.has("q") ? `https://www.google.com/search?q=${encodeURIComponent(url.searchParams.get("q") || "")}` : null);
  const target = await validateTarget(rawTarget);
    if (!target) return errorResponse(403, "Target is not allowed");
    try {
      const response = await fetch(new URL("/favicon.ico", target.origin), { redirect: "follow", signal: AbortSignal.timeout(timeout) });
      if (!response.ok) return errorResponse(404, "Website icon not found");
      const headers = new Headers({ "cache-control": "public, max-age=3600", "x-robots-tag": "noindex, nofollow, noarchive", "access-control-allow-origin": "*" });
      const type = response.headers.get("content-type");
      if (type) headers.set("content-type", type);
      return new Response(response.body, { headers });
    } catch { return errorResponse(404, "Website icon not found"); }
  }
  if (url.pathname === "/api/icon") {
    const target = await validateTarget(url.searchParams.get("url"));
    if (!target) return errorResponse(403, "Target is not allowed");
    return new Response(JSON.stringify({ url: target.href, icon: `/favicon?url=${encodeURIComponent(target.href)}` }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600" }});
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS", "access-control-allow-headers": "*", "access-control-max-age": "86400" }});
  if (url.pathname !== "/vanillia") return errorResponse(404, "Not found");
  const redirectCount = Number(url.searchParams.get("__vanillia_redirects")) || 0;
  if (redirectCount > maxRedirects) return errorResponse(508, "Too many redirects");
  const target = await validateTarget(resolveProxyTarget(url.searchParams));
  if (!target) return errorResponse(403, "Target is not allowed");
  return proxyRequest(request, target, redirectCount);
}
