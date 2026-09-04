const workerScript = `
const endpoint = "/vanillia?url=";
const target = new URL(self.location.href).searchParams.get("target");

self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !target) return;
  let upstream;
  try {
    const base = new URL(target);
    upstream = new URL(url.pathname + url.search + url.hash, base).href;
  } catch {
    return;
  }
  event.respondWith(fetch(endpoint + encodeURIComponent(upstream), {
    method: request.method,
    headers: request.headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "follow",
    credentials: "include"
  }));
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
