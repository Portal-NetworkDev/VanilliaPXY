const runtimeSource = String.raw`(() => {
  const marker = Symbol.for("VanilliaPXY.runtime");
  if (globalThis[marker]) return;
  globalThis[marker] = true;
  const nativeFetch = globalThis.fetch?.bind(globalThis);
  const nativeOpen = XMLHttpRequest.prototype.open;
  const base = document.baseURI;
  const endpoint = globalThis.__VANILLIAPXY_ENDPOINT__ || "/vanillia?url=";
  const workerEndpoint = globalThis.__VANILLIAPXY_SW__ || "/service-worker.js";
  const proxy = value => {
    if (typeof value !== "string" || !value) return value;
    const trimmed = value.trim();
    if (/^(?:[a-z][a-z0-9+.-]*:|\\/\\/|#|data:|mailto:|javascript:|blob:|about:)/i.test(trimmed)) return value;
    try {
      const resolved = new URL(trimmed, base);
      if (!/^https?:$/.test(resolved.protocol)) return value;
      return endpoint + encodeURIComponent(resolved.href);
    } catch { return value; }
  };
  if (nativeFetch) {
    globalThis.fetch = (input, init) => {
      if (typeof input === "string" || input instanceof URL) return nativeFetch(proxy(String(input)), init);
      if (input instanceof Request) {
        const url = proxy(input.url);
        return nativeFetch(url === input.url ? input : new Request(url, input), init);
      }
      return nativeFetch(input, init);
    };
  }
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    return nativeOpen.call(this, method, proxy(String(url)), ...rest);
  };
  if (navigator.serviceWorker) {
    const nativeRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = (scriptURL, options = {}) => {
      const original = new URL(String(scriptURL), base).href;
      const isolated = new URL(workerEndpoint, location.origin);
      isolated.searchParams.set("target", original);
      const next = { ...options };
      if (next.scope) {
        const scope = new URL(next.scope, base);
        if (scope.origin !== location.origin) next.scope = "/";
      }
      return nativeRegister(isolated.href, next);
    };
  }
})();`;

export function runtimeScript(endpoint = "/vanillia?url=", workerEndpoint = "/service-worker.js") {
  return `<script data-vanillia-runtime>globalThis.__VANILLIAPXY_ENDPOINT__=${JSON.stringify(endpoint)};globalThis.__VANILLIAPXY_SW__=${JSON.stringify(workerEndpoint)};${runtimeSource}</script>`;
}
