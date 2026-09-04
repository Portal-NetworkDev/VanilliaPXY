const absolute = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:|mailto:|javascript:|blob:|about:)/i;

export function proxyUrl(value, base, endpoint = "/proxy?url=") {
  if (!value || absolute.test(value.trim())) return value;
  try {
    const resolved = new URL(value, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return value;
    return endpoint + encodeURIComponent(resolved.href);
  } catch {
    return value;
  }
}

export function rewriteCss(text, base, endpoint) {
  return text.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (match, quote, value) => {
    if (!value || /^(?:data:|blob:|about:|#)/i.test(value.trim())) return match;
    return `url(${quote}${proxyUrl(value.trim(), base, endpoint)}${quote})`;
  });
}

export function rewriteHtml(text, base, endpoint, runtime = "") {
  let output = text.replace(/(\b(?:href|src|action|poster|cite|formaction)\s*=\s*)(["'])(.*?)(\2)/gi,
    (match, prefix, quote, value, closing) => prefix + quote + proxyUrl(value, base, endpoint) + closing
  );

  if (runtime && /<\/head\s*>/i.test(output)) {
    output = output.replace(/<\/head\s*>/i, `${runtime}</head>`);
  } else if (runtime) {
    output = `${runtime}${output}`;
  }
  return output;
}
