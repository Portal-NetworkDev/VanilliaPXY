import http from "node:http";
import { request } from "undici";
import { WebSocketServer, WebSocket } from "ws";

const port = Number(process.env.PORT) || 8080;
const timeout = Number(process.env.UPSTREAM_TIMEOUT) || 30000;
const maxRedirects = Number(process.env.MAX_REDIRECTS) || 10;
const maxHeaderSize = Number(process.env.MAX_HEADER_SIZE) || 32768;

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

const server = http.createServer({ maxHeaderSize }, handleRequest);
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });

function getTarget(req, parameter = "url") {
  const requestUrl = new URL(req.url, "http://localhost");
  const value = requestUrl.searchParams.get(parameter);
  if (!value) return null;

  try {
    const target = new URL(value);
    if (target.protocol !== "http:" && target.protocol !== "https:") return null;
    return target;
  } catch {
    return null;
  }
}

function getWebSocketTarget(req) {
  const target = getTarget(req);
  if (!target) return null;
  if (target.protocol === "http:") target.protocol = "ws:";
  if (target.protocol === "https:") target.protocol = "wss:";
  return target;
}

function copyRequestHeaders(req, target, { websocket = false } = {}) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    const lower = name.toLowerCase();
    if (value == null || hopByHop.has(lower) || lower === "host") continue;
    headers[name] = value;
  }

  headers.host = target.host;
  if (!websocket) headers["x-forwarded-host"] = req.headers.host || "";
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
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(message);
}

function withTimeout(signal, ms) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error("timeout")), ms);
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  };
}

async function proxyRequest(req, res, target, redirects = 0) {
  if (redirects > maxRedirects) {
    sendError(res, 508, "Too many redirects");
    return;
  }

  const timeoutState = withTimeout(req.signal, timeout);
  try {
    const upstream = await request(target, {
      method: req.method,
      headers: copyRequestHeaders(req, target),
      body: req.method === "GET" || req.method === "HEAD" ? null : req,
      signal: timeoutState.signal,
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
      await proxyRequest(req, res, next, redirects + 1);
      return;
    }

    res.writeHead(upstream.statusCode, copyResponseHeaders(upstream.headers));
    upstream.body.on("error", () => res.destroy());
    upstream.body.pipe(res);
  } catch (error) {
    if (error.name === "AbortError" || timeoutState.signal.aborted) {
      sendError(res, 504, "Upstream request timed out");
    } else {
      sendError(res, 502, "Unable to reach upstream");
    }
  } finally {
    timeoutState.clear();
  }
}

function handleWebSocket(req, socket, head) {
  const target = getWebSocketTarget(req);
  if (!target) {
    socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (client) => {
    const upstream = new WebSocket(target, {
      headers: copyRequestHeaders(req, target, { websocket: true }),
      handshakeTimeout: timeout,
      maxPayload: 16 * 1024 * 1024
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
      if (client.readyState === WebSocket.OPEN) client.emit("open");
    });

    upstream.on("message", (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });

    client.on("message", (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
    });

    client.on("close", (code, reason) => closeBoth(code, reason.toString()));
    upstream.on("close", (code, reason) => {
      if (client.readyState === WebSocket.OPEN) client.close(code, reason);
      closed = true;
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
      "cache-control": "no-store"
    });
    res.end(JSON.stringify({ status: "ok", version: "0.2.0" }));
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
