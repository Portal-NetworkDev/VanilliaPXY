import { createBlobWorkerBootstrap } from "./blob-worker.js";

const runtimeSource = String.raw`(() => {
  const marker = Symbol.for("VanilliaPXY.runtime");
  if (globalThis[marker]) return;
  globalThis[marker] = true;
  const nativeFetch = globalThis.fetch?.bind(globalThis);
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeEventSource = globalThis.EventSource;
  const nativeWorker = globalThis.Worker;
  const nativeSharedWorker = globalThis.SharedWorker;
  const nativeBlob = globalThis.Blob;
  const nativeWebSocket = globalThis.WebSocket;
  const nativeWindowOpen = globalThis.open?.bind(globalThis);
  const nativeWindowPrototypePostMessage = globalThis.Window?.prototype?.postMessage;
  const nativeIframeContentWindow = globalThis.HTMLIFrameElement?.prototype
    ? Object.getOwnPropertyDescriptor(globalThis.HTMLIFrameElement.prototype, "contentWindow")
    : null;
  const nativeSetAttribute = globalThis.Element?.prototype?.setAttribute;
  const nativeCssSetProperty = globalThis.CSSStyleDeclaration?.prototype?.setProperty;
  const nativeCssText = globalThis.CSSStyleDeclaration
    ? Object.getOwnPropertyDescriptor(globalThis.CSSStyleDeclaration.prototype, "cssText")
    : null;
  const nativeInnerHTML = globalThis.Element
    ? Object.getOwnPropertyDescriptor(globalThis.Element.prototype, "innerHTML")
    : null;
  const nativeOuterHTML = globalThis.Element
    ? Object.getOwnPropertyDescriptor(globalThis.Element.prototype, "outerHTML")
    : null;
  const nativeInsertAdjacentHTML = globalThis.Element?.prototype?.insertAdjacentHTML;
  const nativeDocumentWrite = globalThis.Document?.prototype?.write;
  const nativeDocumentCookie = globalThis.Document
    ? Object.getOwnPropertyDescriptor(globalThis.Document.prototype, "cookie")
    : null;
  const nativeLocationAssign = globalThis.Location?.prototype?.assign;
  const nativeLocationReplace = globalThis.Location?.prototype?.replace;
  const nativeLocationHref = globalThis.Location
    ? Object.getOwnPropertyDescriptor(globalThis.Location.prototype, "href")
    : null;
  const nativeLocationToString = globalThis.Location?.prototype?.toString;
  const nativeHistoryPushState = globalThis.History?.prototype?.pushState;
  const nativeHistoryReplaceState = globalThis.History?.prototype?.replaceState;
  const nativeDocumentWriteln = globalThis.Document?.prototype?.writeln;
  const nativeCreateContextualFragment = globalThis.Range?.prototype?.createContextualFragment;
  const nativeParseFromString = globalThis.DOMParser?.prototype?.parseFromString;
  const base = globalThis.__VANILLIAPXY_TARGET__ || document.baseURI;
  const endpoint = globalThis.__VANILLIAPXY_ENDPOINT__ || "/vanillia?url=";
  const workerEndpoint = globalThis.__VANILLIAPXY_SW__ || "/service-worker.js";
  const relayServer = new URL(location.href).searchParams.get("server") || "";
  const blobWorkerBootstrap = globalThis.__VANILLIAPXY_BLOB_BOOTSTRAP__ || "";
  const navigateDirectRedirect = value => {
    if (typeof value !== "string" || !value.trim()) return value;
    try {
      const resolved = new URL(value, base);
      if (!/^https?:$/.test(resolved.protocol)) return value;
      return resolved.href;
    } catch { return value; }
  };
  const normalizeAddress = value => {
    const input = String(value ?? "").trim();
    const authority = input.split(/[/?#]/, 1)[0];
    return authority.includes(".") && !input.includes(":") && !input.startsWith("//")
      ? "https://" + input
      : input;
  };
  let currentTargetHost = "";
  const cookieHost = () => {
    try { return new URL(currentTargetHost || globalThis.__VANILLIAPXY_TARGET__ || base).hostname.toLowerCase().replace(/\.$/, ""); }
    catch { return ""; }
  };
  const currentTargetMeta = document.querySelector?.('meta[data-vanillia-target]');
  if (currentTargetMeta?.content) currentTargetHost = currentTargetMeta.content;
  const cookieDomain = cookie => {
    const host = cookieHost();
    const requested = String(cookie.match(/(?:^|;\s*)Domain=([^;]+)/i)?.[1] || host).toLowerCase().replace(/^\./, "").replace(/\.$/, "");
    return host === requested || host.endsWith("." + requested) ? requested : host;
  };
  const scopeCookie = value => {
    const input = String(value ?? "");
    const pairEnd = input.indexOf(";");
    const pair = pairEnd < 0 ? input : input.slice(0, pairEnd);
    const equals = pair.indexOf("=");
    if (equals <= 0) return input;
    const name = pair.slice(0, equals).trim();
    const scope = cookieDomain(input);
    if (!scope || name.includes("__vanilliapxy_")) return input;
    const renamed = name + "__vanilliapxy_" + scope + "=" + pair.slice(equals + 1);
    const attributes = (pairEnd < 0 ? "" : input.slice(pairEnd))
      .replace(/;\s*Domain=[^;]*/gi, "")
      .replace(/;\s*Path=[^;]*/i, "; Path=/");
    return renamed + (attributes.includes("Path=") ? attributes : attributes + "; Path=/");
  };
  const visibleCookies = value => String(value ?? "").split(/;\s*/).filter(Boolean).flatMap(cookie => {
    const equals = cookie.indexOf("=");
    if (equals <= 0) return [];
    const name = cookie.slice(0, equals);
    const marker = name.lastIndexOf("__vanilliapxy_");
    if (marker < 0) return [];
    const scope = name.slice(marker + "__vanilliapxy_".length).toLowerCase();
    const host = cookieHost();
    if (host !== scope && !host.endsWith("." + scope)) return [];
    return [name.slice(0, marker) + "=" + cookie.slice(equals + 1)];
  }).join("; ");
  const isCaptchaResource = value => {
    try {
      const url = new URL(normalizeAddress(value), base);
      const host = url.hostname.toLowerCase();
      if (host === cookieHost() || host.endsWith("." + cookieHost())) currentTargetHost = url.href;
      const isGoogleHost = host === "google.com" || host.endsWith(".google.com");
      const isRecaptchaHost = host === "recaptcha.net" || host.endsWith(".recaptcha.net");
      const isGstaticHost = host === "gstatic.com" || host.endsWith(".gstatic.com");
      const isCaptchaPath = /\/(?:recaptcha|captcha|challenge)(?:\/|$)/i.test(url.pathname);
      const isGoogleVerifyPath = isGoogleHost && /(?:^|[?&])(?:k|sitekey|render)=/i.test(url.search);
      return url.protocol === "https:" && (isGoogleHost || isRecaptchaHost || isGstaticHost) &&
        (isCaptchaPath || isGoogleVerifyPath);
    } catch { return false; }
  };
  const proxy = value => {
    if (typeof value !== "string" || !value) return value;
    const trimmed = value.trim();
    if (/^(?:data:|mailto:|javascript:|blob:|about:|#)/i.test(trimmed)) return value;
    if (isProxyUrl(trimmed)) return value;
    try {
      const normalized = normalizeAddress(trimmed);
      if (isCaptchaResource(normalized)) return value;
      const resolved = new URL(normalized, base);
      if (!/^https?:$/.test(resolved.protocol)) return value;
      return endpoint + encodeURIComponent(resolved.href);
    } catch { return value; }
  };
  const proxySrcset = value => {
    if (typeof value !== "string") return value;
    const candidates = [];
    let index = 0;
    while (index < value.length) {
      while (index < value.length && /[\s,]/.test(value[index])) index++;
      if (index >= value.length) break;
      const start = index;
      while (index < value.length && !/\s/.test(value[index])) index++;
      let candidateUrl = value.slice(start, index);
      let endsCandidate = false;
      while (candidateUrl.endsWith(",")) {
        candidateUrl = candidateUrl.slice(0, -1);
        endsCandidate = true;
      }
      if (!candidateUrl) continue;
      let descriptor = "";
      if (!endsCandidate && index < value.length) {
        while (index < value.length && /\s/.test(value[index])) index++;
        const descriptorStart = index;
        while (index < value.length && value[index] !== ",") index++;
        descriptor = value.slice(descriptorStart, index).trim();
        if (value[index] === ",") index++;
      }
      candidates.push(proxy(candidateUrl) + (descriptor ? " " + descriptor : ""));
    }
    return candidates.join(", ");
  };
  const proxyCss = value => String(value ?? "").replace(/url(\s*\(\s*)(["']?)(.*?)(\2)(\s*\))/gi,
    (match, prefix, quote, url, closingQuote, suffix) => prefix + quote + proxy(url) + closingQuote + suffix
  );
  const proxyMarkup = value => {
    let markup = String(value ?? "");
    markup = markup.replace(/(\b(?:href|src|poster|cite|formaction|manifest|ping|background|data|xlink:href)\s*=\s*)(["'])(.*?)(\2)/gi,
      (match, prefix, quote, url, closing) => prefix + quote + proxy(url) + closing
    );
    markup = markup.replace(/(\bsrcset\s*=\s*)(["'])(.*?)(\2)/gi,
      (match, prefix, quote, value, closing) => prefix + quote + proxySrcset(value) + closing
    );
    markup = markup.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi,
      (match, open, css, close) => open + proxyCss(css) + close
    );
    markup = markup.replace(/(\bstyle\s*=\s*)(["'])(.*?)(\2)/gi,
      (match, prefix, quote, value, closing) => prefix + quote + proxyCss(value) + closing
    );
    return markup;
  };
  const isProxyUrl = value => {
    try {
      const resolved = new URL(value, location.href);
      return resolved.origin === location.origin && resolved.pathname === "/vanillia";
    } catch {
      return false;
    }
  };
  const isDiscordAuthUrl = value => {
    try {
      const url = new URL(value, base);
      return url.protocol === "https:" &&
        (url.hostname === "discord.com" || url.hostname === "www.discord.com") &&
        /^\/(?:login|register|verify|reset)(?:\/|$)/i.test(url.pathname);
    } catch {
      return false;
    }
  };
  const proxyNavigation = value => {
    const normalized = normalizeAddress(value);
    return isDiscordAuthUrl(normalized) ? endpoint + encodeURIComponent(new URL(normalized, base).href) : proxy(value);
  };
  const upstreamNavigationUrl = value => {
    const unproxied = unproxy(value);
    if (unproxied) return new URL(unproxied, base).href;
    return new URL(String(value), base).href;
  };
  const installHistoryMethod = (method, nativeMethod) => {
    if (!globalThis.History?.prototype || !nativeMethod) return;
    try {
      globalThis.History.prototype[method] = function(state, unused, url) {
        if (url == null) return nativeMethod.call(this, state, unused);
        const upstream = upstreamNavigationUrl(url);
        const proxied = isDiscordAuthUrl(upstream) ? endpoint + encodeURIComponent(upstream) : proxyNavigation(upstream);
        const destination = new URL(proxied, location.href);
        if (destination.origin !== location.origin) throw new DOMException("History URL must remain on the proxy origin", "SecurityError");
        return nativeMethod.call(this, state, unused, destination.pathname + destination.search + destination.hash);
      };
    } catch {}
  };
  installHistoryMethod("pushState", nativeHistoryPushState);
  installHistoryMethod("replaceState", nativeHistoryReplaceState);
  const unproxy = value => {
    try {
      const resolved = new URL(value, location.href);
      if (resolved.origin !== location.origin || resolved.pathname !== "/vanillia") return null;
      return resolved.searchParams.get("url");
    } catch {
      return null;
    }
  };
  const messageTarget = value => {
    if (typeof value !== "string" || value === "*") return value;
    try {
      const target = new URL(value, base);
      if (!/^https?:$/.test(target.protocol)) return value;
      return target.origin === location.origin ? value : location.origin;
    } catch {
      return value;
    }
  };
  const installUrlProperty = (prototype, property) => {
    if (!prototype) return;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    if (!descriptor?.get || !descriptor?.set) return;
    try {
      Object.defineProperty(prototype, property, {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
      set(value) { return descriptor.set.call(this, proxy(String(value))); }
      });
    } catch {}
  };
  const installSrcsetProperty = (prototype) => {
    if (!prototype) return;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "srcset");
    if (!descriptor?.get || !descriptor?.set) return;
    try {
      Object.defineProperty(prototype, "srcset", {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(value) { return descriptor.set.call(this, proxySrcset(String(value))); }
      });
    } catch {}
  };
  if (globalThis.Element?.prototype && nativeSetAttribute) {
    try {
      globalThis.Element.prototype.setAttribute = function(name, value) {
        const lower = String(name).toLowerCase();
        if (lower === "srcset") value = proxySrcset(String(value));
        else if (["src", "href", "poster", "data", "action", "cite", "formaction", "manifest", "ping", "background", "xlink:href"].includes(lower)) value = proxy(String(value));
        else if (lower === "style") value = proxyCss(String(value));
        return nativeSetAttribute.call(this, name, value);
      };
    } catch {}
  }
  if (globalThis.Element?.prototype && nativeInnerHTML?.get && nativeInnerHTML?.set) {
    try {
      Object.defineProperty(globalThis.Element.prototype, "innerHTML", {
        configurable: nativeInnerHTML.configurable,
        enumerable: nativeInnerHTML.enumerable,
        get: nativeInnerHTML.get,
        set(value) { return nativeInnerHTML.set.call(this, proxyMarkup(value)); }
      });
    } catch {}
  }
  if (globalThis.Element?.prototype && nativeOuterHTML?.get && nativeOuterHTML?.set) {
    try {
      Object.defineProperty(globalThis.Element.prototype, "outerHTML", {
        configurable: nativeOuterHTML.configurable,
        enumerable: nativeOuterHTML.enumerable,
        get: nativeOuterHTML.get,
        set(value) { return nativeOuterHTML.set.call(this, proxyMarkup(value)); }
      });
    } catch {}
  }
  if (globalThis.Element?.prototype && nativeInsertAdjacentHTML) {
    try {
      globalThis.Element.prototype.insertAdjacentHTML = function(position, html) {
        return nativeInsertAdjacentHTML.call(this, position, proxyMarkup(html));
      };
    } catch {}
  }
  if (globalThis.Document?.prototype) {
    if (nativeDocumentWrite) {
      try {
        globalThis.Document.prototype.write = function(...args) {
          return nativeDocumentWrite.apply(this, args.map(proxyMarkup));
        };
      } catch {}
    }
    if (nativeDocumentWriteln) {
      try {
        globalThis.Document.prototype.writeln = function(...args) {
          return nativeDocumentWriteln.apply(this, args.map(proxyMarkup));
        };
      } catch {}
    }
  }
  if (globalThis.Range?.prototype && nativeCreateContextualFragment) {
    try {
      globalThis.Range.prototype.createContextualFragment = function(html) {
        return nativeCreateContextualFragment.call(this, proxyMarkup(html));
      };
    } catch {}
  }
  if (globalThis.DOMParser?.prototype && nativeParseFromString) {
    try {
      globalThis.DOMParser.prototype.parseFromString = function(input, type, ...rest) {
        return nativeParseFromString.call(this, type === "text/html" ? proxyMarkup(input) : input, type, ...rest);
      };
    } catch {}
  }
  if (globalThis.CSSStyleDeclaration?.prototype) {
    if (nativeCssSetProperty) {
      try {
        globalThis.CSSStyleDeclaration.prototype.setProperty = function(name, value, priority) {
          return nativeCssSetProperty.call(this, name, proxyCss(String(value)), priority);
        };
      } catch {}
    }
    if (nativeCssText?.get && nativeCssText?.set) {
      try {
        Object.defineProperty(globalThis.CSSStyleDeclaration.prototype, "cssText", {
          configurable: nativeCssText.configurable,
          enumerable: nativeCssText.enumerable,
          get: nativeCssText.get,
          set(value) { return nativeCssText.set.call(this, proxyCss(String(value))); }
        });
      } catch {}
    }
  }
  installUrlProperty(globalThis.HTMLImageElement?.prototype, "src");
  installUrlProperty(globalThis.HTMLAnchorElement?.prototype, "href");
  installSrcsetProperty(globalThis.HTMLImageElement?.prototype);
  installUrlProperty(globalThis.HTMLIFrameElement?.prototype, "src");
  installUrlProperty(globalThis.HTMLScriptElement?.prototype, "src");
  installUrlProperty(globalThis.HTMLLinkElement?.prototype, "href");
  installUrlProperty(globalThis.HTMLSourceElement?.prototype, "src");
  installSrcsetProperty(globalThis.HTMLSourceElement?.prototype);
  installUrlProperty(globalThis.HTMLVideoElement?.prototype, "poster");
  installUrlProperty(globalThis.HTMLMediaElement?.prototype, "src");
  installUrlProperty(globalThis.HTMLObjectElement?.prototype, "data");
  installUrlProperty(globalThis.HTMLEmbedElement?.prototype, "src");
  const messageOrigin = (() => {
    try { return new URL(base).origin; } catch { return location.origin; }
  })();
  const messageMarker = "__VANILLIAPXY_MESSAGE__";
  const wrapMessage = value => ({
    [messageMarker]: true,
    origin: messageOrigin,
    data: value
  });
  const unwrapMessageEvent = event => {
    const value = event?.data;
    if (!value || typeof value !== "object" || value[messageMarker] !== true) return event;
    return new Proxy(event, {
      get(target, property, receiver) {
        if (property === "data") return value.data;
        if (property === "origin") return value.origin || messageOrigin;
        return Reflect.get(target, property, receiver);
      }
    });
  };
  const nativeEventTargetAddEventListener = globalThis.EventTarget?.prototype?.addEventListener;
  const nativeEventTargetRemoveEventListener = globalThis.EventTarget?.prototype?.removeEventListener;
  const messageListeners = new WeakMap();
  if (nativeEventTargetAddEventListener && nativeEventTargetRemoveEventListener) {
    try {
      globalThis.EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (type !== "message" || typeof listener !== "function") {
          return nativeEventTargetAddEventListener.call(this, type, listener, options);
        }
        let wrapped = messageListeners.get(listener);
        if (!wrapped) {
          wrapped = event => listener.call(event.currentTarget, unwrapMessageEvent(event));
          messageListeners.set(listener, wrapped);
        }
        return nativeEventTargetAddEventListener.call(this, type, wrapped, options);
      };
      globalThis.EventTarget.prototype.removeEventListener = function(type, listener, options) {
        if (type !== "message" || typeof listener !== "function") {
          return nativeEventTargetRemoveEventListener.call(this, type, listener, options);
        }
        return nativeEventTargetRemoveEventListener.call(this, type, messageListeners.get(listener) || listener, options);
      };
    } catch {}
  }
  const installMessageProperty = prototype => {
    if (!prototype) return;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "onmessage");
    if (!descriptor?.get || !descriptor?.set || !descriptor.configurable) return;
    try {
      Object.defineProperty(prototype, "onmessage", {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get() { return descriptor.get.call(this); },
        set(listener) {
          if (typeof listener !== "function") return descriptor.set.call(this, listener);
          const wrapped = event => listener.call(this, unwrapMessageEvent(event));
          return descriptor.set.call(this, wrapped);
        }
      });
    } catch {}
  };
  installMessageProperty(globalThis.Window?.prototype);
  installMessageProperty(globalThis.MessagePort?.prototype);
  installMessageProperty(globalThis.Worker?.prototype);
  const installWindowPostMessage = windowObject => {
    if (!windowObject) return;
    try {
      const nativePostMessage = windowObject.postMessage;
      if (typeof nativePostMessage !== "function" || nativePostMessage[messageMarker]) return;
      const wrappedPostMessage = function(message, targetOrigin, transfer) {
        const nextMessage = wrapMessage(message);
        const nextOrigin = messageTarget(targetOrigin);
        const postMessage = windowObject === globalThis && nativeWindowPrototypePostMessage
          ? nativeWindowPrototypePostMessage
          : nativePostMessage;
        if (arguments.length >= 3) return postMessage.call(this, nextMessage, nextOrigin, transfer);
        if (arguments.length >= 2) return postMessage.call(this, nextMessage, nextOrigin);
        return postMessage.call(this, nextMessage);
      };
      Object.defineProperty(wrappedPostMessage, messageMarker, { value: true });
      if (windowObject === globalThis && globalThis.Window?.prototype) {
        try { globalThis.Window.prototype.postMessage = wrappedPostMessage; } catch {}
      }
      windowObject.postMessage = wrappedPostMessage;
    } catch {}
  };
  installWindowPostMessage(globalThis);
  if (nativeIframeContentWindow?.get && globalThis.HTMLIFrameElement?.prototype) {
    try {
      Object.defineProperty(globalThis.HTMLIFrameElement.prototype, "contentWindow", {
        configurable: nativeIframeContentWindow.configurable,
        enumerable: nativeIframeContentWindow.enumerable,
        get() {
          const childWindow = nativeIframeContentWindow.get.call(this);
          installWindowPostMessage(childWindow);
          return childWindow;
        }
      });
    } catch {}
  }
  const navigate = (value, method) => {
    const next = proxyNavigation(String(value));
    if (method === "replace" && nativeLocationReplace) return nativeLocationReplace.call(location, next);
    if (nativeLocationAssign) return nativeLocationAssign.call(location, next);
    return undefined;
  };
  if (nativeWindowOpen) {
    globalThis.open = (value, ...args) => nativeWindowOpen(proxyNavigation(String(value)), ...args);
  }
  if (globalThis.Location?.prototype && nativeLocationHref?.get && nativeLocationHref?.set) {
    try {
      Object.defineProperty(globalThis.Location.prototype, "href", {
        configurable: nativeLocationHref.configurable,
        enumerable: nativeLocationHref.enumerable,
        get: nativeLocationHref.get,
        set(value) {
          const direct = isDirectRedirectNavigation(value);
          const next = direct || proxyNavigation(String(value));
          return nativeLocationHref.set.call(this, next);
        }
      });
    } catch {}
  }
  const isDirectRedirectNavigation = value => {
    if (!globalThis.__VANILLIAPXY_DIRECT_REDIRECT_PAGE__) return null;
    const resolved = navigateDirectRedirect(String(value));
    const destinations = globalThis.__VANILLIAPXY_DIRECT_REDIRECTS__;
    return resolved !== value && Array.isArray(destinations) && destinations.includes(resolved) ? resolved : null;
  };
  if (globalThis.Location?.prototype) {
    for (const [method, nativeMethod] of [["assign", nativeLocationAssign], ["replace", nativeLocationReplace]]) {
      if (!nativeMethod) continue;
      try {
        globalThis.Location.prototype[method] = function(value) {
          const direct = isDirectRedirectNavigation(value);
          const next = direct || proxyNavigation(String(value));
          return nativeMethod.call(this, next);
        };
      } catch {}
    }
    if (nativeLocationToString) {
      try {
        globalThis.Location.prototype.toString = function() {
          const href = nativeLocationHref?.get?.call(this);
          return proxy(typeof href === "string" ? href : nativeLocationToString.call(this));
        };
      } catch {}
    }
  }
  globalThis.__VANILLIAPXY_DIRECT_REDIRECT_PAGE__ = Boolean(document.querySelector?.('meta[data-vanillia-direct-redirect-page="true"]'));

  if (globalThis.Document?.prototype && nativeDocumentCookie?.get && nativeDocumentCookie?.set) {
    try {
      Object.defineProperty(globalThis.Document.prototype, "cookie", {
        configurable: nativeDocumentCookie.configurable,
        enumerable: nativeDocumentCookie.enumerable,
        get() { return visibleCookies(nativeDocumentCookie.get.call(this)); },
        set(value) { return nativeDocumentCookie.set.call(this, scopeCookie(value)); }
      });
    } catch {}
  }
  if (globalThis.HTMLFormElement) {
    document.addEventListener("submit", event => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const method = String(form.method || "get").toLowerCase();
      const action = form.getAttribute("action") || document.baseURI;
      const target = unproxy(action) || new URL(action, base).href;
      if (!/^https?:$/i.test(new URL(target, base).protocol)) return;
      const destination = new URL(target, base);
      const isDuckDuckGoSearch = method === "post" &&
        ["html.duckduckgo.com", "lite.duckduckgo.com"].includes(destination.hostname.toLowerCase()) &&
        /^\/(?:html|lite)\/?$/i.test(destination.pathname);
      if (method !== "get" && !isDuckDuckGoSearch) return;
      if (isDuckDuckGoSearch) {
        const data = new FormData(form);
        for (const [name, value] of data.entries()) {
          if (typeof value === "string") destination.searchParams.append(name, value);
        }
        event.preventDefault();
        const        next = proxyNavigation(destination.href);
        const targetName = form.target || "_self";
        if (targetName === "_blank") globalThis.open(next, "_blank", "noopener");
        else location.assign(next);
        return;
      }
      const data = new FormData(form);

      const entries = [...data.entries()].filter(([, value]) => typeof value === "string");
      const targetHost = destination.hostname.toLowerCase();
      const hostLabels = targetHost.split(".");
      const googleLabel = hostLabels.indexOf("google");
      const googlePrefix = hostLabels.slice(0, googleLabel).join(".");
      const googleSuffix = hostLabels.slice(googleLabel + 1);
      const isGoogleSuffix = (googleSuffix.length === 1 && googleSuffix[0].length >= 2 && googleSuffix[0].length <= 3) ||
        (googleSuffix.length === 2 && ["co", "com", "net", "org"].includes(googleSuffix[0]) && googleSuffix[1].length === 2);
      const isGoogleSearchHost = googleLabel >= 0 && (googlePrefix === "" || googlePrefix === "www") && isGoogleSuffix;
      const isGoogleSearch = isGoogleSearchHost && entries.some(([name, value]) => name === "q" && value);
      if (isGoogleSearch) {
        destination.pathname = "/search";
        destination.search = "";
      }
      for (const [name, value] of entries) {
        destination.searchParams.append(name, value);
      }
      event.preventDefault();
      let next;
      if (isGoogleSearch) {
        const searchEndpoint = new URL(endpoint, location.href);
        searchEndpoint.searchParams.delete("url");
        for (const [name, value] of destination.searchParams) {
          searchEndpoint.searchParams.append(name, value);
        }
        next = searchEndpoint.pathname + searchEndpoint.search;
      } else {
        next = proxyNavigation(destination.href);
      }
      const targetName = form.target || "_self";
      if (targetName === "_blank") globalThis.open(next, "_blank", "noopener");
      else location.assign(next);
    }, true);
  }
  document.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target?.closest?.("a[href]");
    if (!anchor || anchor.hasAttribute("download")) return;
    const destination = anchor.href;
    if (!isDiscordAuthUrl(destination)) return;
    event.preventDefault();
    const targetName = anchor.target || "_self";
    if (targetName.toLowerCase() === "_self") navigate(destination, "assign");
    else globalThis.open(proxyNavigation(destination), targetName, anchor.rel?.includes("noopener") ? "noopener" : "");
  }, true);
  if (nativeFetch) {
    globalThis.fetch = (input, init) => {
      if (typeof input === "string" || input instanceof URL) return nativeFetch(proxy(String(input)), init);
      if (input instanceof Request) {
        const url = proxy(input.url);
        if (url === input.url) return nativeFetch(input, init);
        const options = init || {};
        const requestInit = { ...options };
        if (input.method !== "GET" && input.method !== "HEAD" && input.body !== null && !("duplex" in requestInit)) {
          requestInit.duplex = "half";
        }
        return nativeFetch(new Request(url, input), requestInit);
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
            const socket = new URL("/ws?url=" + encodeURIComponent(httpTarget), location.origin);
            if (relayServer) socket.searchParams.set("server", relayServer);
            next = socket.href;
          }
        } catch {}
        super(next, protocols);
      }
    };
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
  if (nativeBlob && nativeWorker) {
    try {
      globalThis.Blob = class extends nativeBlob {
        constructor(parts = [], options = {}) {
          const blobParts = Array.from(parts);
          const type = String(options?.type || "").toLowerCase().split(";", 1)[0].trim();
          const source = blobParts.filter(part => typeof part === "string").join("");
          if ((!type || /^(?:text|application)\/(?:java|ecma)script$/.test(type)) && source.includes("importScripts")) {
            blobParts.unshift(blobWorkerBootstrap);
          }
          super(blobParts, options);
        }
      };
    } catch {}
  }
  if (nativeWorker) {
    globalThis.Worker = class extends nativeWorker {
      constructor(scriptURL, options) {
        const target = new URL(String(scriptURL), base);
        const next = target.origin === new URL(base).origin && target.pathname.startsWith("/assets/")
          ? proxy(target.href)
          : proxy(String(scriptURL));
        super(next, options);
      }
    };
  }
  if (nativeSharedWorker) {
    globalThis.SharedWorker = class extends nativeSharedWorker {
      constructor(scriptURL, options) { super(proxy(String(scriptURL)), options); }
    };
  }
  if (navigator.serviceWorker) {
    const nativeRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = (scriptURL, options = {}) => {
      const original = new URL(String(scriptURL), base).href;
      const isolated = new URL(workerEndpoint, location.origin);
      isolated.searchParams.set("target", original);
      if (relayServer) isolated.searchParams.set("server", relayServer);
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
  return `<script data-vanillia-runtime>globalThis.__VANILLIAPXY_BLOB_BOOTSTRAP__=${JSON.stringify(createBlobWorkerBootstrap(endpoint, target))};globalThis.__VANILLIAPXY_ENDPOINT__=${JSON.stringify(endpoint)};globalThis.__VANILLIAPXY_SW__=${JSON.stringify(workerEndpoint)};globalThis.__VANILLIAPXY_TARGET__=${JSON.stringify(target)};${runtimeSource}</script>`;
}
