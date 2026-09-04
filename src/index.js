import http from "node:http";
import { request } from "undici";
import { WebSocketServer, WebSocket } from "ws";
import { parseTarget, isTargetAllowed } from "./target.js";
import { requestHeaders, responseHeaders } from "./headers.js";
import { rewriteCss, rewriteHtml } from "./rewriter.js";
import { rewriteUrl } from "./url.js";

const port = Number(process.env.PORT) || 8080;
const timeout = Number(process.env.UPSTREAM_TIMEOUT) || 30000;
const maxRedirects = Number(process.env.MAX_REDIRECTS) || 8;
const maxRewriteSize = Number(process.env.MAX_REWRITE_SIZE) || 4 * 1024 * 1024;
const maxHeaderSize = Number(process.env.MAX_HEADER_SIZE) || 32768;
const maxWebSocketPayload = Number(process.env.MAX_WS_PAYLOAD) || 16 * 1024 * 1024;
const allowPrivate = process.env.ALLOW_PRIVATE_TARGETS === "true";
const rewriteEnabled = process.env.REWRITE === "true";
const endpoint = process.env.PROXY_ENDPOINT || "/vanillia?url=";

const server = http.createServer({ maxHeaderSize }, handleRequest);
const wss = new WebSocketServer({ noServer: true, maxPayload: maxWebSocketPayload });

function sendError(res, status, message) {
  if (res.headersSent) return res.destroy();
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" });
  res.end(message);
}

function canRewrite(headers) {
  if (!rewriteEnabled) return false;
  const type = String(headers["content-type"] || "").toLowerCase();
  return type.includes("text/html") || type.includes("text/css");
}

function bodyBuffer(stream, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let exceeded = false;
    stream.on("data", chunk => {
      if (exceeded) return;
      size += chunk.length;
      if (size > limit) {
        exceeded = true;
        stream.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => { if (!exceeded) resolve(Buffer.concat(chunks)); });
    stream.on("error", reject);
  });
}

async function proxyRequest(req, res, target, redirects = 0) {
  if (redirects > maxRedirects) return sendError(res, 508, "Too many redirects");
  if (!(await isTargetAllowed(target, allowPrivate))) return sendError(res, 403, "Target is not allowed");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const headers = requestHeaders(req.headers, target);
  if (rewriteEnabled) headers["accept-encoding"] = "identity";

  try {
    const upstream = await request(target, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? null : req,
      signal: controller.signal,
      maxRedirections: 0,
      headersTimeout: timeout,
      bodyTimeout: 0
    });

    const location = upstream.headers.location;
    const replayable = req.method === "GET" || req.method === "HEAD";
    if (location && upstream.statusCode >= 300 && upstream.statusCode < 400 && replayable) {
      upstream.body.resume();
      if (redirects >= maxRedirects) return sendError(res, 508, "Too many redirects");
      let next;
      try { next = new URL(location, target); } catch { return sendError(res, 502, "Invalid redirect"); }
      if (!(next.protocol === "http:" || next.protocol === "https:")) return sendError(res, 502, "Unsupported redirect");
      return proxyRequest(req, res, next, redirects + 1);
    }

    const headersOut = responseHeaders(upstream.headers);
    if (location && rewriteEnabled) headersOut.location = rewriteUrl(new URL(location, target).href, target, endpoint);
    const shouldRewrite = canRewrite(upstream.headers) && ![204, 304].includes(upstream.statusCode);
    if (!shouldRewrite) {
      res.writeHead(upstream.statusCode, headersOut);
      upstream.body.on("error", () => res.destroy());
      upstream.body.pipe(res);
      return;
    }

    const body = await bodyBuffer(upstream.body, maxRewriteSize);
    if (body === null) return sendError(res, 413, "Response exceeds rewrite limit");
    const type = String(upstream.headers["content-type"] || "").toLowerCase();
    const source = body.toString("utf8");
    const rewritten = type.includes("text/css") ? rewriteCss(source, target.href, endpoint) : rewriteHtml(source, target.href, endpoint);
    const output = Buffer.from(rewritten, "utf8");
    delete headersOut["content-length"];
    delete headersOut["content-encoding"];
    headersOut["content-length"] = String(output.length);
    res.writeHead(upstream.statusCode, headersOut);
    res.end(output);
  } catch (error) {
    sendError(res, error.name === "AbortError" ? 504 : 502, error.name === "AbortError" ? "Upstream request timed out" : "Unable to reach upstream");
  } finally {
    clearTimeout(timer);
  }
}

function handleWebSocket(req, socket, head) {
  const requestUrl = new URL(req.url, "http://localhost");
  const target = parseTarget(requestUrl.searchParams.get("url"));
  if (!target) {
    socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
  wss.handleUpgrade(req, socket, head, async client => {
    if (!(await isTargetAllowed(target, allowPrivate))) return client.close(1008, "Target is not allowed");
    const upstream = new WebSocket(target, { headers: requestHeaders(req.headers, target), handshakeTimeout: timeout, maxPayload: maxWebSocketPayload });
    let closed = false;
    const closeBoth = (code = 1000, reason = "") => {
      if (closed) return;
      closed = true;
      if (client.readyState === WebSocket.OPEN) client.close(code, reason); else client.terminate();
      if (upstream.readyState === WebSocket.OPEN) upstream.close(code, reason); else if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
    };
    upstream.on("open", () => { if (client.readyState !== WebSocket.OPEN) closeBoth(); });
    upstream.on("message", (data, binary) => { if (client.readyState === WebSocket.OPEN) client.send(data, { binary }); });
    client.on("message", (data, binary) => { if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary }); });
    client.on("close", (code, reason) => closeBoth(code, reason.toString()));
    upstream.on("close", (code, reason) => { closed = true; if (client.readyState === WebSocket.OPEN) client.close(code, reason); });
    client.on("error", () => closeBoth(1011, "client error"));
    upstream.on("error", () => closeBoth(1011, "upstream error"));
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" });
    res.end(JSON.stringify({ status: "ok", version: "0.6.0" }));
    return;
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS", "access-control-allow-headers": "*", "access-control-max-age": "86400" });
    res.end();
    return;
  }
  if (url.pathname !== "/vanillia") return sendError(res, 404, "Not found");
  const target = parseTarget(url.searchParams.get("url"));
  if (!target) return sendError(res, 400, "A valid http(s) url is required");
  await proxyRequest(req, res, target);
}

server.on("upgrade", (req, socket, head) => {
  if (new URL(req.url, "http://localhost").pathname !== "/ws") return socket.destroy();
  handleWebSocket(req, socket, head);
});

server.headersTimeout = timeout + 5000;
server.requestTimeout = 0;
server.keepAliveTimeout = 65000;
server.listen(port, () => console.log(`VanilliaPXY listening on ${port}`));
