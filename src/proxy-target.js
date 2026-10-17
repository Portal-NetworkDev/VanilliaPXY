export function resolveProxyTarget(searchParams) {
  const target = searchParams.get("url");
  if (target) return target;
  if (!searchParams.has("q")) return null;

  const search = new URL("https://www.google.com/search");
  for (const [name, value] of searchParams) {
    if (name !== "url" && name !== "server") search.searchParams.append(name, value);
  }
  return search.href;
}
