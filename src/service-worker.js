const workerScript = `
const endpoint = "/vanillia?url=";
const target = new URL(self.location.href).searchParams.get("target");

self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", event => {
  const request = event.request;
  if (!target || !/^(?:GET|HEAD)$/i.test(request.method)) return;

  const url = new URL(request.url);
  const internalPaths = new Set([
    "/service-worker.js",
    "/favicon",
    "/api/icon",
    "/health",
    "/robots.txt",
    "/vanillia"
  ]);

  if (url.origin === self.location.origin && internalPaths.has(url.pathname)) return;

  let upstream;
  try {
    const base = new URL(target);
    upstream = url.origin === self.location.origin
      ? new URL(url.pathname + url.search + url.hash, base).href
      : url.href;
  } catch {
    return;
  }

  const proxied = endpoint + encodeURIComponent(upstream);
  event.respondWith(fetch(new Request(proxied, request)));
});
`;

export function serviceWorkerResponse() {
  return new Response(workerScript, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
      "service-worker-allowed": "/"
    }
  });
}
