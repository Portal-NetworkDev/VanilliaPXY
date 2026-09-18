import { validateTarget, validateRedirect } from "./policy-worker.js";
import { requestHeaders, responseHeaders } from "./headers.js";
import { rewriteCss, rewriteHtml } from "./rewriter.js";
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
function canRewrite(headers) {
  const type = String(headers.get("content-type") || "").toLowerCase();
  return type.includes("text/html") || type.includes("text/css");
}
function proxyEndpoint(request) {
  return new URL(endpoint, new URL(request.url).origin).href;
}
function proxiedRedirect(location, base, request) {
  const absolute = new URL(location, base);
  return new URL(endpoint + encodeURIComponent(absolute.href), new URL(request.url).origin).href;
}
async function readBody(response) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxRewriteSize) return null;
  const buffer = await response.arrayBuffer();
  return buffer.byteLength > maxRewriteSize ? null : new Uint8Array(buffer);
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
    const replayable = request.method === "GET" || request.method === "HEAD";
    if (location && upstream.status >= 300 && upstream.status < 400 && replayable) {
      if (redirects >= maxRedirects) return errorResponse(508, "Too many redirects");
      const next = await validateRedirect(location, target);
      if (!next) return errorResponse(403, "Redirect target is not allowed");
      return proxyRequest(request, next, redirects + 1);
    }
    const rewrittenResponse = canRewrite(upstream.headers);
    const headersOut = responseHeaders(headersObject(upstream.headers), { rewritten: rewrittenResponse });
    if (location) {
      const redirect = await validateRedirect(location, target);
      if (!redirect) return errorResponse(403, "Redirect target is not allowed");
      headersOut.location = proxiedRedirect(location, target, request);
    }
    if (!rewrittenResponse || [204, 304].includes(upstream.status)) {
      return new Response(upstream.body, { status: upstream.status, headers: headersOut });
    }
    const body = await readBody(upstream);
    if (body === null) return errorResponse(413, "Response exceeds rewrite limit");
    const type = String(upstream.headers.get("content-type") || "").toLowerCase();
    const source = new TextDecoder().decode(body);
    const absoluteEndpoint = proxyEndpoint(request);
    const iconHref = type.includes("text/html") ? `/favicon?url=${encodeURIComponent(target.href)}` : "";
    const rewritten = type.includes("text/css")
      ? rewriteCss(source, target.href, absoluteEndpoint)
      : rewriteHtml(source, target.href, absoluteEndpoint, runtimeScript(absoluteEndpoint, "/service-worker.js", target.href) + adblockerScript(), iconHref);
    delete headersOut["content-length"];
    delete headersOut["content-encoding"];
    return new Response(rewritten, { status: upstream.status, headers: headersOut });
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
    const target = await validateTarget(url.searchParams.get("url"));
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
  const target = await validateTarget(url.searchParams.get("url"));
  if (!target) return errorResponse(403, "Target is not allowed");
  return proxyRequest(request, target);
}
