const runtimeSource = String.raw`(() => {
  const marker = Symbol.for("VanilliaPXY.runtime");
  if (globalThis[marker]) return;
  globalThis[marker] = true;

  const nativeFetch = globalThis.fetch?.bind(globalThis);
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;

  const base = document.baseURI;
  const endpoint = globalThis.__VANILLIAPXY_ENDPOINT__ || "/proxy?url=";

  const proxy = value => {
    if (typeof value !== "string" || !value) return value;
    const trimmed = value.trim();
    if (/^(?:[a-z][a-z0-9+.-]*:|\\/\\/|#|data:|mailto:|javascript:|blob:|about:)/i.test(trimmed)) return value;
    try {
      const resolved = new URL(trimmed, base);
      if (!/^https?:$/.test(resolved.protocol)) return value;
      return endpoint + encodeURIComponent(resolved.href);
    } catch {
      return value;
    }
  };

  if (nativeFetch) {
    globalThis.fetch = (input, init) => {
      if (typeof input === "string" || input instanceof URL) {
        return nativeFetch(proxy(String(input)), init);
      }
      if (input instanceof Request) {
        const url = proxy(input.url);
        if (url === input.url) return nativeFetch(input, init);
        return nativeFetch(new Request(url, input), init);
      }
      return nativeFetch(input, init);
    };
  }

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    return nativeOpen.call(this, method, proxy(String(url)), ...rest);
  };

  XMLHttpRequest.prototype.send = function(body) {
    return nativeSend.call(this, body);
  };
})();`;

export function runtimeScript(endpoint) {
  return `globalThis.__VANILLIAPXY_ENDPOINT__=${JSON.stringify(endpoint)};${runtimeSource}`;
}
