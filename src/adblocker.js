// Built in adblocker. Helped & built by emma and Blake. 

const adblockerSource = String.raw`(() => {
  const marker = Symbol.for("VanilliaPXY.adblocker");

  if (globalThis[marker]) return;
  globalThis[marker] = true;

  const nativeFetch = globalThis.fetch?.bind(globalThis);
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSendBeacon = navigator.sendBeacon?.bind(navigator);

  // all the ad urls i added. Blake can add more. Im tired
  const blockedHostPatterns = [
  /(^|\.)doubleclick\.net$/i,
  /(^|\.)googlesyndication\.com$/i,
  /(^|\.)googleadservices\.com$/i,
  /(^|\.)adservice\.google\.com$/i,
  /(^|\.)adnxs\.com$/i,
  /(^|\.)adsrvr\.org$/i,
  /(^|\.)advertising\.com$/i,
  /(^|\.)amazon-adsystem\.com$/i,
  /(^|\.)criteo\.com$/i,
  /(^|\.)criteo\.net$/i,
  /(^|\.)taboola\.com$/i,
  /(^|\.)outbrain\.com$/i,
  /(^|\.)zedo\.com$/i,
  /(^|\.)rubiconproject\.com$/i,
  /(^|\.)pubmatic\.com$/i,
  /(^|\.)openx\.net$/i,
  /(^|\.)33across\.com$/i,
  /(^|\.)media\.net$/i,
  /(^|\.)scorecardresearch\.com$/i,
  /(^|\.)quantserve\.com$/i,
  /(^|\.)adsafeprotected\.com$/i,
  /(^|\.)moatads\.com$/i,
  /(^|\.)smartadserver\.com$/i,
  /(^|\.)adform\.net$/i,
  /(^|\.)adroll\.com$/i,
  /(^|\.)yieldmo\.com$/i,
  /(^|\.)sharethrough\.com$/i,
  /(^|\.)casalemedia\.com$/i,
  /(^|\.)lijit\.com$/i,
  /(^|\.)smaato\.net$/i,
  /(^|\.)inmobi\.com$/i,
  /(^|\.)unityads\.unity3d\.com$/i,
  /(^|\.)applovin\.com$/i,
  /(^|\.)vungle\.com$/i,
  /(^|\.)ironsrc\.com$/i,
  /(^|\.)appsflyer\.com$/i,
  /(^|\.)adjust\.com$/i,
  /(^|\.)branch\.io$/i,

  /(^|\.)ads\.yahoo\.com$/i,
  /(^|\.)gemini\.yahoo\.com$/i,
  /(^|\.)analytics\.yahoo\.com$/i,
  /(^|\.)ads-twitter\.com$/i,
  /(^|\.)ads\.linkedin\.com$/i,
  /(^|\.)ads\.pinterest\.com$/i,
  /(^|\.)ads\.reddit\.com$/i,
  /(^|\.)ads\.tiktok\.com$/i,
  /(^|\.)analytics\.tiktok\.com$/i,
  /(^|\.)ads\.facebook\.com$/i,
  /(^|\.)an\.facebook\.com$/i,
  /(^|\.)connect\.facebook\.net$/i,

  /(^|\.)googletagmanager\.com$/i,
  /(^|\.)googletagservices\.com$/i,
  /(^|\.)google-analytics\.com$/i,
  /(^|\.)analytics\.google\.com$/i,
  /(^|\.)stats\.g\.doubleclick\.net$/i,
  /(^|\.)pagead2\.googlesyndication\.com$/i,

  /(^|\.)hotjar\.com$/i,
  /(^|\.)hotjar\.io$/i,
  /(^|\.)mouseflow\.com$/i,
  /(^|\.)fullstory\.com$/i,
  /(^|\.)clarity\.ms$/i,
  /(^|\.)mixpanel\.com$/i,
  /(^|\.)segment\.io$/i,
  /(^|\.)segment\.com$/i,
  /(^|\.)amplitude\.com$/i,
  /(^|\.)heap\.io$/i,
  /(^|\.)heapanalytics\.com$/i,

  /(^|\.)braze\.com$/i,
  /(^|\.)onesignal\.com$/i,
  /(^|\.)customer\.io$/i,
  /(^|\.)intercom\.io$/i,
  /(^|\.)intercomcdn\.com$/i,

  /(^|\.)adskeeper\.co$/i,
  /(^|\.)adsterra\.com$/i,
  /(^|\.)propellerads\.com$/i,
  /(^|\.)popads\.net$/i,
  /(^|\.)popcash\.net$/i,
  /(^|\.)trafficjunky\.com$/i,
  /(^|\.)exoclick\.com$/i,
  /(^|\.)juicyads\.com$/i,
  /(^|\.)hilltopads\.net$/i,
  /(^|\.)adcash\.com$/i,
  /(^|\.)evadav\.com$/i,
  /(^|\.)clickadu\.com$/i,
  /(^|\.)richpush\.co$/i,
  /(^|\.)pushground\.com$/i,

  /(^|\.)teads\.tv$/i,
  /(^|\.)gumgum\.com$/i,
  /(^|\.)conversantmedia\.com$/i,
  /(^|\.)sonobi\.com$/i,
  /(^|\.)33across\.com$/i,
  /(^|\.)triplelift\.com$/i,
  /(^|\.)indexexchange\.com$/i,
  /(^|\.)sharethrough\.com$/i,
  /(^|\.)spotxchange\.com$/i,
  /(^|\.)spotx\.tv$/i,
  /(^|\.)bidtellect\.com$/i,
  /(^|\.)districtm\.io$/i,
  /(^|\.)emxdgt\.com$/i,
  /(^|\.)gumgum\.com$/i,
  /(^|\.)nexage\.com$/i,
  /(^|\.)aerserv\.com$/i,
  /(^|\.)fyber\.com$/i,

  /(^|\.)adcolony\.com$/i,
  /(^|\.)chartboost\.com$/i,
  /(^|\.)tapjoy\.com$/i,
  /(^|\.)mintegral\.com$/i,
  /(^|\.)liftoff\.io$/i,
  /(^|\.)moloco\.com$/i,
  /(^|\.)bidmachine\.io$/i,
  /(^|\.)digitalturbine\.com$/i,

  /(^|\.)demdex\.net$/i,
  /(^|\.)omtrdc\.net$/i,
  /(^|\.)everesttech\.net$/i,
  /(^|\.)rlcdn\.com$/i,
  /(^|\.)bluekai\.com$/i,
  /(^|\.)krxd\.net$/i,
  /(^|\.)exelator\.com$/i,
  /(^|\.)agkn\.com$/i,
  /(^|\.)mathtag\.com$/i,
  /(^|\.)everestjs\.net$/i,
  /(^|\.)eyeota\.net$/i,
  /(^|\.)lotame\.com$/i,
  /(^|\.)addthis\.com$/i,
  /(^|\.)sharethis\.com$/i,
  /(^|\.)scorecardresearch\.com$/i,
  /(^|\.)imrworldwide\.com$/i
];

  const blockedPathPatterns = [
    /(^|\/)ads?[\/_-]/i,
    /(^|\/)adserver[\/_-]/i,
    /(^|\/)advert/i,
    /(^|\/)banner[\/_-]/i,
    /(^|\/)doubleclick[\/_-]/i,
    /(^|\/)prebid[\/_-]/i,
    /(^|\/)tracking[\/_-]/i,
    /(^|\/)tracker[\/_-]/i,
    /(^|\/)analytics[\/_-]/i,
    /(^|\/)pixel\.(gif|png|jpg|webp)$/i,
    /(^|\/)beacon[\/_-]/i,
    /(^|\/)telemetry[\/_-]/i,
    /(^|\/)collect[\/_-]/i
  ];

  const blockedQueryPatterns = [
    /[?&](?:adid|ad_id|adunit|ad_unit|adserver)=/i,
    /[?&](?:clickid|click_id|gclid|dclid|msclkid)=/i,
    /[?&](?:tracking|tracker|track)=/i,
    /[?&](?:utm_source|utm_medium|utm_campaign|utm_content|utm_term)=/i
  ];

  const trustedHostPatterns = [
    /(^|\.)google\.com$/i,
    /(^|\.)googleapis\.com$/i,
    /(^|\.)gstatic\.com$/i,
    /(^|\.)youtube\.com$/i,
    /(^|\.)ytimg\.com$/i,
    /(^|\.)microsoft\.com$/i,
    /(^|\.)microsoftonline\.com$/i,
    /(^|\.)github\.com$/i,
    /(^|\.)githubusercontent\.com$/i,
    /(^|\.)discord\.com$/i,
    /(^|\.)discordapp\.com$/i,
    /(^|\.)discordapp\.net$/i,
    /(^|\.)cloudflare\.com$/i,
    /(^|\.)cloudflareinsights\.com$/i
  ];

  const normalizeUrl = value => {
    try {
      return new URL(String(value), location.href);
    } catch {
      return null;
    }
  };

  const isTrustedHost = host =>
    trustedHostPatterns.some(pattern => pattern.test(host));

  const isBlockedUrl = value => {
    const url = normalizeUrl(value);

    if (!url || !/^https?:$/i.test(url.protocol)) {
      return false;
    }

    const host = url.hostname.toLowerCase();
    const pathname = url.pathname;
    const href = url.href;

    if (blockedHostPatterns.some(pattern => pattern.test(host))) {
      return true;
    }

    if (isTrustedHost(host)) {
      return false;
    }

    if (blockedPathPatterns.some(pattern => pattern.test(pathname))) {
      return true;
    }

    if (blockedQueryPatterns.some(pattern => pattern.test(href))) {
      return true;
    }

    return false;
  };

  const shouldBlockElement = element => {
    if (!element || element.nodeType !== 1) return false;

    const tag = element.tagName.toLowerCase();

    if (
      tag === "iframe" ||
      tag === "script" ||
      tag === "img" ||
      tag === "source" ||
      tag === "video" ||
      tag === "audio" ||
      tag === "link"
    ) {
      const attributes = [
        "src",
        "href",
        "poster",
        "data",
        "srcset"
      ];

      for (const attribute of attributes) {
        const value = element.getAttribute?.(attribute);

        if (!value) continue;

        if (
          attribute === "srcset" &&
          value.split(",").some(item =>
            isBlockedUrl(item.trim().split(/\s+/)[0])
          )
        ) {
          return true;
        }

        if (attribute !== "srcset" && isBlockedUrl(value)) {
          return true;
        }
      }
    }

    const className = String(element.className || "");
    const id = String(element.id || "");

    const cosmeticPattern =
      /(^|[-_\s])(ad|ads|advert|advertisement|sponsor|sponsored|ad-container|ad-wrapper)([-_\s]|$)/i;

    if (
      cosmeticPattern.test(className) ||
      cosmeticPattern.test(id)
    ) {
      return true;
    }

    if (
      element.getAttribute?.("data-ad") !== null ||
      element.getAttribute?.("data-ad-slot") !== null ||
      element.getAttribute?.("data-ad-client") !== null ||
      element.getAttribute?.("data-google-query-id") !== null
    ) {
      return true;
    }

    return false;
  };

  const hideElement = element => {
    if (!element || element.nodeType !== 1) return;

    element.setAttribute("data-vanillia-adblocked", "true");

    if (element.style) {
      element.style.setProperty("display", "none", "important");
      element.style.setProperty("visibility", "hidden", "important");
      element.style.setProperty("height", "0", "important");
      element.style.setProperty("min-height", "0", "important");
      element.style.setProperty("width", "0", "important");
      element.style.setProperty("min-width", "0", "important");
      element.style.setProperty("overflow", "hidden", "important");
    }
  };

  if (nativeFetch) {
    globalThis.fetch = (input, init) => {
      let value = input;

      try {
        if (typeof input === "string" || input instanceof URL) {
          value = String(input);
        } else if (input instanceof Request) {
          value = input.url;
        }

        if (isBlockedUrl(value)) {
          return Promise.reject(
            new DOMException(
              "Blocked by VanilliaPXY AdBlocker",
              "AbortError"
            )
          );
        }
      } catch {}

      return nativeFetch(input, init);
    };
  }

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    if (isBlockedUrl(url)) {
      this.__vanilliaBlocked = true;

      return nativeOpen.call(
        this,
        "GET",
        "data:,",
        ...rest
      );
    }

    this.__vanilliaBlocked = false;

    return nativeOpen.call(this, method, url, ...rest);
  };

  const nativeXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.send = function(...args) {
    if (this.__vanilliaBlocked) {
      try {
        this.abort();
      } catch {}

      return;
    }

    return nativeXhrSend.apply(this, args);
  };

  if (nativeSendBeacon) {
    navigator.sendBeacon = (url, data) => {
      if (isBlockedUrl(url)) {
        return false;
      }

      return nativeSendBeacon(url, data);
    };
  }

  const nativeWindowOpen = globalThis.open?.bind(globalThis);

  if (nativeWindowOpen) {
    globalThis.open = (url, ...args) => {
      if (isBlockedUrl(url)) {
        return null;
      }

      return nativeWindowOpen(url, ...args);
    };
  }

  const scan = root => {
    if (!root) return;

    if (root.nodeType === 1 && shouldBlockElement(root)) {
      hideElement(root);
    }

    const elements = root.querySelectorAll?.(
      "iframe,script,img,source,video,audio,link,[data-ad],[data-ad-slot],[data-ad-client],[data-google-query-id],[id],[class]"
    );

    if (!elements) return;

    for (const element of elements) {
      if (shouldBlockElement(element)) {
        hideElement(element);
      }
    }
  };

  const startObserver = () => {
    scan(document);

    if (!document.documentElement) return;

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          scan(node);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      startObserver,
      { once: true }
    );
  } else {
    startObserver();
  }

  const nativeSetAttribute =
    globalThis.Element?.prototype?.setAttribute;

  if (nativeSetAttribute) {
    try {
      globalThis.Element.prototype.setAttribute = function(name, value) {
        const lower = String(name).toLowerCase();

        if (
          ["src", "href", "poster", "data"].includes(lower) &&
          isBlockedUrl(value)
        ) {
          return;
        }

        return nativeSetAttribute.call(this, name, value);
      };
    } catch {}
  }

  globalThis.VanilliaAdBlocker = {
    isBlocked: isBlockedUrl,
    version: "1.0.0"
  };
})();`;

export function adblockerScript() {
  return `<script data-vanillia-adblocker>${adblockerSource}</script>`;
}
