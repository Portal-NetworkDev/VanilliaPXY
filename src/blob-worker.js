export function createBlobWorkerBootstrap(endpoint, target) {
  if (!target) return "";
  const base = new URL(target).origin;
  return `;(() => {
    const endpoint = ${JSON.stringify(endpoint)};
    const base = ${JSON.stringify(base)};
    const nativeImportScripts = globalThis.importScripts;
    if (!nativeImportScripts) return;
    globalThis.importScripts = (...urls) => nativeImportScripts(...urls.map(value => {
      const input = String(value);
      try {
        const target = new URL(input, base);
        if (!/^https?:$/.test(target.protocol)) return input;
        const proxyEndpoint = new URL(endpoint, globalThis.location.origin);
        if (target.origin === proxyEndpoint.origin && target.pathname === proxyEndpoint.pathname && target.searchParams.has("url")) return input;
        const fragment = target.hash;
        target.hash = "";
        return proxyEndpoint.href + encodeURIComponent(target.href) + fragment;
      } catch { return input; }
    }));
  })();`;
}
