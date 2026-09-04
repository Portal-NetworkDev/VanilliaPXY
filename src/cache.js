const store = new Map();
const maxEntries = Number(process.env.CACHE_MAX_ENTRIES) || 256;
const ttl = Number(process.env.CACHE_TTL) || 30000;

export function getCached(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    store.delete(key);
    return null;
  }
  store.delete(key);
  store.set(key, entry);
  return entry.value;
}

export function setCached(key, value) {
  if (maxEntries <= 0) return;
  store.delete(key);
  store.set(key, { value, expires: Date.now() + ttl });
  while (store.size > maxEntries) store.delete(store.keys().next().value);
}

export function clearCache() {
  store.clear();
}
