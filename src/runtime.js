const runtimeSource = String.raw`(() => {
  const marker = Symbol.for("VanilliaPXY.runtime");
  if (globalThis[marker]) return;
  globalThis[marker] = true;
  const nativeFetch = globalThis.fetch?.bind(globalThis);
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeEventSource = globalThis.EventSource;
  const nativeWebSocket = globalThis.WebSocket;
  const nativeWindowPostMessage = globalThis.postMessage?.bind(globalThis);
  const nativeWindowPrototypePostMessage = globalThis.Window?.prototype?.postMessage;
  const base = globalThis.__VANILLIAPXY_TARGET__ || document.baseURI;
  const endpoint = globalThis.__VANILLIAPXY_ENDPOINT__ || "/vanillia?url=";
  const workerEndpoint = globalThis.__VANILLIAPXY_SW__ || "/service-worker.js";
  const proxy = value => {
    if (typeof value !== "string" || !value) return value;
    const trimmed = value.trim();
    if (/^(?:data:|mailto:|javascript:|blob:|about:|#)/i.test(trimmed)) return value;
    try {
      const resolved = new URL(trimmed, base);
      if (!/^https?:$/.test(resolved.protocol)) return value;
      if (resolved.origin === location.origin && resolved.pathname === "/vanillia") return resolved.href;
      return endpoint + encodeURIComponent(resolved.href);
    } catch { return value; }
  };
  const messageTarget = value => {
    if (typeof value !== "string" || value === "*") return value;
    try {
      const origin = new URL(value, base).origin;
      return origin === location.origin ? value : "*";
    } catch {
      return value;
    }
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
  if (nativeEventSource) {
    globalThis.EventSource = class extends nativeEventSource {
      constructor(url, options) { super(proxy(String(url)), options); }
    };
  }
  if (nativeWebSocket) {
    globalThis.WebSocket = class extends nativeWebSocket {
      constructor(url, protocols) {
        const value = String(url);
        let next = value;
        try {
          const resolved = new URL(value, base);
          if (/^wss?:$/.test(resolved.protocol)) {
            const target = resolved.protocol === "wss:" ? "https:" : "http:";
            const httpTarget = target + "//" + resolved.host + resolved.pathname + resolved.search;
            next = new URL("/ws?url=" + encodeURIComponent(httpTarget), location.origin).href;
          }
        } catch {}
        super(next, protocols);
      }
    };
  }
  if (nativeWindowPostMessage && globalThis.Window?.prototype) {
    const postMessage = function(message, targetOrigin, transfer) {
      const nextOrigin = messageTarget(targetOrigin);
      if (arguments.length >= 3) return nativeWindowPrototypePostMessage.call(this, message, nextOrigin, transfer);
      return nativeWindowPrototypePostMessage.call(this, message, nextOrigin);
    };
    try { globalThis.Window.prototype.postMessage = postMessage; } catch {}
    try { globalThis.postMessage = postMessage.bind(globalThis); } catch {}
  }
  if (globalThis.MessagePort?.prototype?.postMessage) {
    const nativePortPostMessage = globalThis.MessagePort.prototype.postMessage;
    try {
      globalThis.MessagePort.prototype.postMessage = function(message, transfer) {
        return arguments.length > 1
          ? nativePortPostMessage.call(this, message, transfer)
          : nativePortPostMessage.call(this, message);
      };
    } catch {}
  }
  if (globalThis.BroadcastChannel?.prototype?.postMessage) {
    const nativeBroadcastPostMessage = globalThis.BroadcastChannel.prototype.postMessage;
    try {
      globalThis.BroadcastChannel.prototype.postMessage = function(message) {
        return nativeBroadcastPostMessage.call(this, message);
      };
    } catch {}
  }
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

export function runtimeScript(endpoint = "/vanillia?url=", workerEndpoint = "/service-worker.js", target = "") {
  return `<script data-vanillia-runtime>globalThis.__VANILLIAPXY_ENDPOINT__=${JSON.stringify(endpoint)};globalThis.__VANILLIAPXY_SW__=${JSON.stringify(workerEndpoint)};globalThis.__VANILLIAPXY_TARGET__=${JSON.stringify(target)};${runtimeSource}</script>`;
}
