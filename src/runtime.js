const runtimeSource = String.raw`(() => {
  const marker = Symbol.for("VanilliaPXY.runtime");
  if (globalThis[marker]) return;
  globalThis[marker] = true;
  const nativeFetch = globalThis.fetch?.bind(globalThis);
  const nativeOpen = XMLHttpRequest.prototype.open;
  const base = document.baseURI;
  const endpoint = globalThis.__VANILLIAPXY_ENDPOINT__ || "/vanillia?url=";
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
})();`;

export function runtimeScript(endpoint = "/vanillia?url=") {
  return `<script data-vanillia-runtime>globalThis.__VANILLIAPXY_ENDPOINT__=${JSON.stringify(endpoint)};${runtimeSource}</script>`;
}
