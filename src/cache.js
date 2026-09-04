const store = new Map();
const maxEntries = Number(process.env.CACHE_MAX_ENTRIES) || 256;
const ttl = Number(process.env.CACHE_TTL) || 30000;

export function getCached(key) {
  const entry = store.get(key);
  if (!entry || entry.expires <= Date.now()) {
    if (entry) store.delete(key);
    return null;
  }
  store.delete(key);
  store.set(key, entry);
  return entry.value;
}

export function setCached(key, value, lifetime = ttl) {
  if (maxEntries <= 0 || lifetime <= 0) return;
  store.delete(key);
  store.set(key, { value, expires: Date.now() + lifetime });
  while (store.size > maxEntries) store.delete(store.keys().next().value);
}

export function deleteCached(key) {
  store.delete(key);
}

export function clearCache() {
  store.clear();
}

export function cacheSize() {
  return store.size;
}
