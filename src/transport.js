import { request } from "undici";

export function createTransport({ timeout = 30000, maxResponseSize = 16 * 1024 * 1024, maxRedirects = 8 } = {}) {
  return {
    async fetch(target, options = {}) {
      let current = new URL(target);
      for (let redirects = 0; ; redirects++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
          const response = await request(current, {
            method: options.method || "GET",
            headers: options.headers,
            body: options.body,
            signal: controller.signal,
            maxRedirections: 0,
            headersTimeout: timeout,
            bodyTimeout: 0,
          });
          const location = response.headers.location;
          if (location && response.statusCode >= 300 && response.statusCode < 400 && (options.method || "GET") === "GET") {
            response.body.resume();
            if (redirects >= maxRedirects) throw new Error("Too many redirects");
            current = new URL(location, current);
            continue;
          }
          return { response, url: current };
        } finally {
          clearTimeout(timer);
        }
      }
    },
    maxResponseSize,
  };
}
