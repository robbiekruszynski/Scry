export type ScryfallCard = {
  id: string;
  name: string;
  mana_cost: string | null;
  cmc: number;
  type_line: string;
  color_identity: string[];
  oracle_text?: string;
};

type CacheRecord = {
  fetchedAt: number;
  card: ScryfallCard;
};

const STORAGE_KEY = "scry:scryfall-cache:v1";

let memoryCache: Map<string, CacheRecord> | null = null;
let lastRequestAt = 0;
let throttleChain: Promise<void> = Promise.resolve();

function getMemoryCache() {
  if (!memoryCache) memoryCache = new Map();
  return memoryCache;
}

function normalizeKey(name: string) {
  return name.trim().toLowerCase();
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function throttleScryfallRequest() {
  const previous = throttleChain;
  let release = () => {};

  throttleChain = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  const elapsed = Date.now() - lastRequestAt;
  const waitFor = Math.max(0, 100 - elapsed);
  if (waitFor > 0) await delay(waitFor);
  lastRequestAt = Date.now();
  release();
}

function readStorage(): Record<string, CacheRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, CacheRecord>;
  } catch {
    return {};
  }
}

function writeStorage(next: Record<string, CacheRecord>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / privacy errors
  }
}

export function getCachedCardByName(name: string): ScryfallCard | null {
  const key = normalizeKey(name);
  const mem = getMemoryCache().get(key);
  if (mem) return mem.card;

  const store = readStorage();
  const rec = store[key];
  if (!rec) return null;
  getMemoryCache().set(key, rec);
  return rec.card;
}

export async function fetchCardByNameFuzzy(name: string): Promise<ScryfallCard> {
  const cached = getCachedCardByName(name);
  if (cached) return cached;

  await throttleScryfallRequest();

  const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(
    name
  )}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Scryfall fetch failed (${res.status}): ${text || res.statusText}`
    );
  }

  const json = (await res.json()) as any;
  const card: ScryfallCard = {
    id: String(json.id),
    name: String(json.name),
    mana_cost: json.mana_cost ? String(json.mana_cost) : null,
    cmc: Number(json.cmc ?? 0),
    type_line: String(json.type_line ?? ""),
    color_identity: Array.isArray(json.color_identity)
      ? json.color_identity.map((c: unknown) => String(c))
      : [],
    oracle_text: json.oracle_text ? String(json.oracle_text) : undefined,
  };

  const rec: CacheRecord = { fetchedAt: Date.now(), card };
  const key = normalizeKey(card.name);
  getMemoryCache().set(key, rec);

  const store = readStorage();
  store[key] = rec;
  writeStorage(store);

  return card;
}

