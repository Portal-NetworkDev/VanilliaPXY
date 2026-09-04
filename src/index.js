import http from "node:http";
import { request } from "undici";

const port = Number(process.env.PORT) || 8080;
const timeout = Number(process.env.UPSTREAM_TIMEOUT) || 30000;
const maxRedirects = Number(process.env.MAX_REDIRECTS) || 10;
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

function getTarget(req) {
  const url = new URL(req.url, "http://localhost");
  const value = url.searchParams.get("url");
  if (!value) return null;

  try {
    const target = new URL(value);
    if (target.protocol !== "http:" && target.protocol !== "https:") return null;
    return target;
  } catch {
    return null;
  }
}

function copyRequestHeaders(req, target) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value == null || hopByHop.has(name.toLowerCase())) continue;
    if (name.toLowerCase() === "host") continue;
    headers[name] = value;
  }
  headers.host = target.host;
  headers["x-forwarded-host"] = req.headers.host || "";
  return headers;
}

function copyResponseHeaders(headers) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value == null || hopByHop.has(name.toLowerCase())) continue;
    result[name] = value;
  }
  return result;
}

function sendError(res, status, message) {
  if (res.headersSent) return res.destroy();
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(message);
}

async function proxy(req, res, target, redirects = 0) {
  if (redirects > maxRedirects) {
    sendError(res, 508, "Too many redirects");
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const upstream = await request(target, {
      method: req.method,
      headers: copyRequestHeaders(req, target),
      body: req.method === "GET" || req.method === "HEAD" ? null : req,
      signal: controller.signal,
      maxRedirections: 0,
      headersTimeout: timeout,
      bodyTimeout: 0
    });

    const location = upstream.headers.location;
    if (location && upstream.statusCode >= 300 && upstream.statusCode < 400) {
      upstream.body.resume();
      const next = new URL(location, target);
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        sendError(res, 502, "Unsupported redirect protocol");
        return;
      }
      await proxy(req, res, next, redirects + 1);
      return;
    }

    res.writeHead(upstream.statusCode, copyResponseHeaders(upstream.headers));
    upstream.body.on("error", () => res.destroy());
    upstream.body.pipe(res);
  } catch (error) {
    if (error.name === "AbortError") {
      sendError(res, 504, "Upstream request timed out");
    } else {
      sendError(res, 502, "Unable to reach upstream");
    }
  } finally {
    clearTimeout(timer);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (url.pathname !== "/proxy") {
    sendError(res, 404, "Not found");
    return;
  }

  const target = getTarget(req);
  if (!target) {
    sendError(res, 400, "A valid http(s) url is required");
    return;
  }

  await proxy(req, res, target);
});

server.headersTimeout = timeout + 5000;
server.requestTimeout = 0;
server.keepAliveTimeout = 65000;

server.listen(port, () => {
  console.log(`VanilliaPXY listening on ${port}`);
});
