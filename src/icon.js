import { request } from "undici";
import { validateTarget, validateRedirect } from "./policy.js";

const maxRedirects = Number(process.env.MAX_ICON_REDIRECTS) || 5;
const maxPageSize = Number(process.env.MAX_ICON_PAGE_SIZE) || 2 * 1024 * 1024;
const maxIconSize = Number(process.env.MAX_ICON_SIZE) || 4 * 1024 * 1024;
const timeout = Number(process.env.UPSTREAM_TIMEOUT) || 30000;

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? match[2] : null;
}

export function extractIconHref(html, base) {
  const tags = String(html || "").match(/<link\\b[^>]*>/gi) || [];
  let manifest = null;
  for (const tag of tags) {
    const href = attr(tag, "href");
    if (!href) continue;
    const rel = String(attr(tag, "rel") || "").toLowerCase().split(/\\s+/);
    if (rel.includes("manifest")) manifest = href;
    if (rel.includes("icon") || (rel.includes("shortcut") && rel.includes("icon")) || rel.includes("apple-touch-icon")) {
      try {
        const url = new URL(href, base);
        if (/^https?:$/.test(url.protocol)) return { url, manifest: null };
      } catch {}
    }
  }
  return { url: null, manifest };
}

async function readBody(stream, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > limit) {
      stream.destroy();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function fetchResource(initial, limit, accept) {
  let target = initial;
  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const allowed = await validateTarget(target.href);
    if (!allowed) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await request(allowed, {
        method: "GET",
        headers: { accept },
        maxRedirections: 0,
        headersTimeout: timeout,
        bodyTimeout: 0,
        signal: controller.signal
      });
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.body.resume();
        if (redirects >= maxRedirects) return null;
        target = await validateRedirect(response.headers.location, allowed);
        if (!target) return null;
        continue;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.body.resume();
        return null;
      }
      const body = await readBody(response.body, limit);
      if (!body) return null;
      return { body, contentType: response.headers["content-type"] || "application/octet-stream", url: allowed };
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function iconFromManifest(manifestUrl) {
  const manifest = await fetchResource(manifestUrl, maxPageSize, "application/manifest+json,application/json,text/json,*/*;q=0.1");
  if (!manifest) return null;
  try {
    const data = JSON.parse(manifest.body.toString("utf8"));
    const icons = Array.isArray(data.icons) ? data.icons : [];
    const ranked = icons
      .filter(icon => icon && typeof icon.src === "string")
      .map(icon => ({ icon, score: String(icon.sizes || "").split(/\\s+/).reduce((best, size) => {
        const match = size.match(/^(\\d+)x(\\d+)$/i);
        return match ? Math.max(best, Number(match[1]) * Number(match[2])) : best;
      }, 0) }))
      .sort((a, b) => b.score - a.score);
    for (const item of ranked) {
      try {
        const url = new URL(item.icon.src, manifest.url);
        if (!/^https?:$/.test(url.protocol)) continue;
        const result = await fetchResource(url, maxIconSize, "image/avif,image/webp,image/png,image/svg+xml,image/x-icon,image/*,*/*;q=0.1");
        if (result) return result;
      } catch {}
    }
  } catch {}
  return null;
}

export async function fetchSiteIcon(value) {
  const target = await validateTarget(value);
  if (!target) return null;
  const page = await fetchResource(target, maxPageSize, "text/html,application/xhtml+xml,*/*;q=0.1");
  if (page) {
    const extracted = extractIconHref(page.body.toString("utf8"), page.url.href);
    if (extracted.url) {
      const icon = await fetchResource(extracted.url, maxIconSize, "image/avif,image/webp,image/png,image/svg+xml,image/x-icon,image/*,*/*;q=0.1");
      if (icon) return icon;
    }
    if (extracted.manifest) {
      try {
        const manifestUrl = new URL(extracted.manifest, page.url);
        if (/^https?:$/.test(manifestUrl.protocol)) {
          const icon = await iconFromManifest(manifestUrl);
          if (icon) return icon;
        }
      } catch {}
    }
  }
  const fallback = new URL("/favicon.ico", target.origin);
  return fetchResource(fallback, maxIconSize, "image/avif,image/webp,image/png,image/svg+xml,image/x-icon,image/*,*/*;q=0.1");
}
