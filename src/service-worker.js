const workerScript = `
const upstream = self.location.origin;
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== upstream) return;
  event.respondWith(fetch(event.request));
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
