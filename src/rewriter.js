import { rewriteSrcset, rewriteUrl } from "./url.js";

const attributePattern = /(\b(?:href|src|action|poster|cite|formaction|manifest|ping|background)\s*=\s*)(["'])(.*?)(\2)/gi;

export function proxyUrl(value, base, endpoint = "/vanillia?url=") {
  return rewriteUrl(value, base, endpoint);
}

export function rewriteCss(text, base, endpoint = "/vanillia?url=") {
  return text.replace(/url\(\s*(["']?)(.*?)\1\s*\)/gi, (match, quote, value) => {
    const input = value.trim();
    if (!input || /^(?:data:|blob:|about:|#)/i.test(input)) return match;
    return `url(${quote}${rewriteUrl(input, base, endpoint)}${quote})`;
  });
}

export function rewriteHtml(text, base, endpoint = "/vanillia?url=", runtime = "") {
  let output = text.replace(attributePattern, (match, prefix, quote, value, closing) => {
    return `${prefix}${quote}${rewriteUrl(value, base, endpoint)}${closing}`;
  });

  output = output.replace(/(\bsrcset\s*=\s*)(["'])(.*?)(\2)/gi, (match, prefix, quote, value, closing) => {
    return `${prefix}${quote}${rewriteSrcset(value, base, endpoint)}${closing}`;
  });

  if (runtime && /<\/head\s*>/i.test(output)) output = output.replace(/<\/head\s*>/i, `${runtime}</head>`);
  else if (runtime) output = `${runtime}${output}`;
  return output;
}
