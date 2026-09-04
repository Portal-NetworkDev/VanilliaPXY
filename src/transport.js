import { request } from "undici";

export function createTransport({ timeout = 30000, maxResponseSize = 16 * 1024 * 1024 } = {}) {
  return {
    async fetch(target, options = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await request(target, {
          method: options.method || "GET",
          headers: options.headers,
          body: options.body,
          signal: controller.signal,
          maxRedirections: 0,
          headersTimeout: timeout,
          bodyTimeout: 0,
        });
        return response;
      } finally {
        clearTimeout(timer);
      }
    },
    maxResponseSize,
  };
}
