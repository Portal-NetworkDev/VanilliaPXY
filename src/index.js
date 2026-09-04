import http from "node:http";
import dns from "node:dns/promises";
import net from "node:net";
import { request } from "undici";
import { WebSocketServer, WebSocket } from "ws";

const port = Number(process.env.PORT) || 8080;
const timeout = Number(process.env.UPSTREAM_TIMEOUT) || 30000;
const maxRedirects = Number(process.env.MAX_REDIRECTS) || 8;
const maxHeaderSize = Number(process.env.MAX_HEADER_SIZE) || 32768;
const maxWebSocketPayload = Number(process.env.MAX_WS_PAYLOAD) || 16 * 1024 * 1024;
const allowPrivate = process.env.ALLOW_PRIVATE_TARGETS === "true";

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

const websocketHeaders = new Set([
  "sec-websocket-key",
  "sec-websocket-version",
  "sec-websocket-extensions",
  "sec-websocket-protocol"
]);

const server = http.createServer({ maxHeaderSize }, handleRequest);
const wss = new WebSocketServer({ noServer: true, maxPayload: maxWebSocketPayload });

function getTarget(req) {
  const requestUrl = new URL(req.url, "http://localhost");
  const value = requestUrl.searchParams.get("url");
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

async function targetAllowed(target) {
  if (allowPrivate) return true;
  const hostname = target.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "0.0.0.0") return false;
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
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }

  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || normalized.startsWith("fe80:") || normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
}

function copyRequestHeaders(req, target, { websocket = false } = {}) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    const lower = name.toLowerCase();
    if (value == null || hopByHop.has(lower) || lower === "host") continue;
    if (websocket && websocketHeaders.has(lower)) continue;
    headers[name] = value;
  }

  headers.host = target.host;
  return headers;
}

function rewriteSetCookie(value) {
  if (typeof value !== "string") return value;
  return value.replace(/;\s*Domain=[^;]*/gi, "");
}

function copyResponseHeaders(headers) {
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (value == null || hopByHop.has(lower)) continue;
    if (lower === "set-cookie") {
      result[name] = Array.isArray(value) ? value.map(rewriteSetCookie) : rewriteSetCookie(value);
    } else {
      result[name] = value;
    }
  }
  result["access-control-allow-origin"] = "*";
  result["access-control-expose-headers"] = "*";
  return result;
}

function sendError(res, status, message) {
  if (res.headersSent) return res.destroy();
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*"
  });
  res.end(message);
}

async function proxyRequest(req, res, target, redirects = 0) {
  if (redirects > maxRedirects) {
    sendError(res, 508, "Too many redirects");
    return;
  }

  if (!(await targetAllowed(target))) {
    sendError(res, 403, "Target is not allowed");
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
    const canReplay = req.method === "GET" || req.method === "HEAD";
    if (location && upstream.statusCode >= 300 && upstream.statusCode < 400 && canReplay) {
      upstream.body.resume();
      const next = new URL(location, target);
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        sendError(res, 502, "Unsupported redirect protocol");
        return;
      }
      await proxyRequest(req, res, next, redirects + 1);
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

function handleWebSocket(req, socket, head) {
  const target = getTarget(req);
  if (!target) {
    socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  target.protocol = target.protocol === "https:" ? "wss:" : "ws:";

  wss.handleUpgrade(req, socket, head, async (client) => {
    if (!(await targetAllowed(target))) {
      client.close(1008, "Target is not allowed");
      return;
    }

    const upstream = new WebSocket(target, {
      headers: copyRequestHeaders(req, target, { websocket: true }),
      handshakeTimeout: timeout,
      maxPayload: maxWebSocketPayload
    });

    let closed = false;
    const closeBoth = (code = 1000, reason = "") => {
      if (closed) return;
      closed = true;
      if (client.readyState === WebSocket.OPEN) client.close(code, reason);
      else client.terminate();
      if (upstream.readyState === WebSocket.OPEN) upstream.close(code, reason);
      else upstream.terminate();
    };

    upstream.on("open", () => {
      if (client.readyState !== WebSocket.OPEN) upstream.close();
    });

    upstream.on("message", (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });

    client.on("message", (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
    });

    client.on("close", (code, reason) => closeBoth(code, reason.toString()));
    upstream.on("close", (code, reason) => {
      closed = true;
      if (client.readyState === WebSocket.OPEN) client.close(code, reason);
    });
    client.on("error", () => closeBoth(1011, "client error"));
    upstream.on("error", () => closeBoth(1011, "upstream error"));
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/health") {
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    });
    res.end(JSON.stringify({ status: "ok", version: "0.3.0" }));
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers": "*",
      "access-control-max-age": "86400"
    });
    res.end();
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

  await proxyRequest(req, res, target);
}

server.on("upgrade", (req, socket, head) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname !== "/ws") {
    socket.destroy();
    return;
  }
  handleWebSocket(req, socket, head);
});

server.headersTimeout = timeout + 5000;
server.requestTimeout = 0;
server.keepAliveTimeout = 65000;

server.listen(port, () => {
  console.log(`VanilliaPXY listening on ${port}`);
});
