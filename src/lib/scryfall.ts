import {
  createAsyncQueue,
  delay,
  MIN_MS_BETWEEN_SCRYFALL_REQUESTS,
  parseRetryAfterMs,
  scryfallFetchHeaders,
} from "@/lib/scryfall-rate-limit";

export type ScryfallCard = {
  id: string;
  name: string;
  scryfall_uri?: string;
  mana_cost: string | null;
  cmc: number;
  type_line: string;
  color_identity: string[];
  oracle_text?: string;
  image_url?: string;
  image_url_large?: string;
  price_usd?: number | null;
  price_updated_at?: number;
  purchase_uris?: {
    tcgplayer?: string;
    cardmarket?: string;
    cardhoarder?: string;
  };
};

type CacheRecord = {
  fetchedAt: number;
  card: ScryfallCard;
};

const STORAGE_KEY = "scry:scryfall-cache:v2";

let memoryCache: Map<string, CacheRecord> | null = null;

const enqueueScryfall = createAsyncQueue();

function getMemoryCache() {
  if (!memoryCache) memoryCache = new Map();
  return memoryCache;
}

function normalizeKey(name: string) {
  return name.trim().toLowerCase();
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
  }
}

export function getCachedCardByName(name: string): ScryfallCard | null {
  const key = normalizeKey(name);
  const mem = getMemoryCache().get(key);
  if (mem) {
    if (!mem.card.image_url && !mem.card.image_url_large) return null;
    return mem.card;
  }

  const store = readStorage();
  const rec = store[key];
  if (!rec) return null;
  if (!rec.card.image_url && !rec.card.image_url_large) return null;
  getMemoryCache().set(key, rec);
  return rec.card;
}

function cardFromScryfallJson(json: any): ScryfallCard {
  const faceImageUris =
    Array.isArray(json.card_faces) && json.card_faces.length > 0
      ? json.card_faces.find((f: any) => f?.image_uris)?.image_uris
      : undefined;
  const imageUris = json.image_uris ?? {};

  return {
    id: String(json.id),
    name: String(json.name),
    scryfall_uri: json.scryfall_uri ? String(json.scryfall_uri) : undefined,
    mana_cost: json.mana_cost ? String(json.mana_cost) : null,
    cmc: Number(json.cmc ?? 0),
    type_line: String(json.type_line ?? ""),
    color_identity: Array.isArray(json.color_identity)
      ? json.color_identity.map((c: unknown) => String(c))
      : [],
    oracle_text: json.oracle_text ? String(json.oracle_text) : undefined,
    image_url: imageUris.png
      ? String(imageUris.png)
      : imageUris.large
        ? String(imageUris.large)
        : imageUris.normal
          ? String(imageUris.normal)
          : faceImageUris?.png
            ? String(faceImageUris.png)
            : faceImageUris?.large
              ? String(faceImageUris.large)
              : faceImageUris?.normal
                ? String(faceImageUris.normal)
                : undefined,
    image_url_large: imageUris.png
      ? String(imageUris.png)
      : imageUris.large
        ? String(imageUris.large)
        : faceImageUris?.png
          ? String(faceImageUris.png)
          : faceImageUris?.large
            ? String(faceImageUris.large)
            : undefined,
    price_usd:
      json?.prices?.usd !== undefined && json?.prices?.usd !== null
        ? Number(json.prices.usd)
        : null,
    price_updated_at: Date.now(),
    purchase_uris: {
      tcgplayer: json?.purchase_uris?.tcgplayer
        ? String(json.purchase_uris.tcgplayer)
        : undefined,
      cardmarket: json?.purchase_uris?.cardmarket
        ? String(json.purchase_uris.cardmarket)
        : undefined,
      cardhoarder: json?.purchase_uris?.cardhoarder
        ? String(json.purchase_uris.cardhoarder)
        : undefined,
    },
  };
}

function persistCache(requestedName: string, card: ScryfallCard) {
  const rec: CacheRecord = { fetchedAt: Date.now(), card };
  const requestedKey = normalizeKey(requestedName);
  const canonicalKey = normalizeKey(card.name);
  getMemoryCache().set(requestedKey, rec);
  if (requestedKey !== canonicalKey) {
    getMemoryCache().set(canonicalKey, rec);
  }

  const store = readStorage();
  store[requestedKey] = rec;
  if (requestedKey !== canonicalKey) {
    store[canonicalKey] = rec;
  }
  writeStorage(store);
}

function headersForFetchUrl(url: string): HeadersInit {
  if (typeof window !== "undefined" && url.startsWith("/api")) {
    return { Accept: "application/json" };
  }
  return scryfallFetchHeaders();
}

async function fetchCardPayload(url: string): Promise<{
  ok: boolean;
  status: number;
  text: string;
  retryAfter: string | null;
}> {
  const res = await fetch(url, {
    method: "GET",
    headers: headersForFetchUrl(url),
    cache: "no-store",
  });
  const text = await res.text().catch(() => "");
  return {
    ok: res.ok,
    status: res.status,
    text,
    retryAfter: res.headers.get("Retry-After"),
  };
}

const COLLECTION_CHUNK = 75;

export type ImportProgress = {
  done: number;
  total: number;
  /** Short status for the loading panel */
  detail: string;
};

/**
 * Resolves unique card names for deck import: cache hits, then Scryfall collection
 * (up to 75 names per HTTP request), then fuzzy lookup for any collection misses.
 */
export async function resolveNamesForDeckImport(
  uniqueNames: string[],
  onProgress?: (p: ImportProgress) => void
): Promise<Map<string, ScryfallCard>> {
  const out = new Map<string, ScryfallCard>();
  const total = uniqueNames.length;
  let done = 0;

  const report = (detail: string) => {
    onProgress?.({ done, total, detail });
  };

  const uncached: string[] = [];
  let cacheHits = 0;
  for (const name of uniqueNames) {
    const hit = getCachedCardByName(name);
    if (hit) {
      out.set(name, hit);
      done += 1;
      cacheHits += 1;
    } else {
      uncached.push(name);
    }
  }
  if (cacheHits > 0) {
    report(`Loaded ${cacheHits} unique name(s) from cache`);
  }

  if (uncached.length === 0) {
    report("All cards loaded from cache.");
    return out;
  }

  const useProxy = typeof window !== "undefined";
  const collectionUrl = useProxy
    ? "/api/scryfall/collection"
    : null;

  const stillNeedFuzzy: string[] = [];

  if (collectionUrl) {
    for (let i = 0; i < uncached.length; i += COLLECTION_CHUNK) {
      const chunk = uncached.slice(i, i + COLLECTION_CHUNK);
      const batchNum = Math.floor(i / COLLECTION_CHUNK) + 1;
      const batchTotal = Math.ceil(uncached.length / COLLECTION_CHUNK);
      report(`Bulk lookup batch ${batchNum}/${batchTotal} (${chunk.length} cards)…`);

      const res = await fetch(collectionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ names: chunk }),
        cache: "no-store",
      });
      const raw = await res.text();

      if (!res.ok) {
        chunk.forEach((n) => stillNeedFuzzy.push(n));
        report(`Batch ${batchNum} failed (${res.status}); will try individual lookup…`);
        continue;
      }

      let json: {
        data?: unknown[];
        not_found?: { name?: string }[];
      };
      try {
        json = JSON.parse(raw) as typeof json;
      } catch {
        chunk.forEach((n) => stillNeedFuzzy.push(n));
        continue;
      }

      const byNorm = new Map<string, ScryfallCard>();
      for (const row of json.data ?? []) {
        const card = cardFromScryfallJson(row);
        byNorm.set(normalizeKey(card.name), card);
      }

      const notFoundSet = new Set(
        (json.not_found ?? [])
          .map((nf) => {
            const n = nf && typeof nf === "object" && "name" in nf ? (nf as { name?: string }).name : undefined;
            return n ? normalizeKey(n) : "";
          })
          .filter(Boolean)
      );

      let matchedInChunk = 0;
      for (const requested of chunk) {
        const key = normalizeKey(requested);
        if (notFoundSet.has(key)) {
          stillNeedFuzzy.push(requested);
          continue;
        }
        const card = byNorm.get(key);
        if (card) {
          persistCache(requested, card);
          out.set(requested, card);
          done += 1;
          matchedInChunk += 1;
        } else {
          stillNeedFuzzy.push(requested);
        }
      }
      report(
        `Batch ${batchNum}/${batchTotal}: matched ${matchedInChunk}/${chunk.length} (${done}/${total} done)`
      );
    }
  } else {
    stillNeedFuzzy.push(...uncached);
  }

  for (const name of stillNeedFuzzy) {
    report(`Looking up: ${name}…`);
    const card = await fetchCardByNameFuzzy(name);
    out.set(name, card);
    done += 1;
    report(`Resolved: ${name}`);
  }

  report("Import data ready.");
  return out;
}

export async function fetchCardByNameFuzzy(name: string): Promise<ScryfallCard> {
  const cached = getCachedCardByName(name);
  if (cached) return cached;

  return enqueueScryfall(async () => {
    const useProxy = typeof window !== "undefined";
    if (!useProxy) {
      await delay(MIN_MS_BETWEEN_SCRYFALL_REQUESTS);
    }

    const url = useProxy
      ? `/api/scryfall/card?fuzzy=${encodeURIComponent(name)}`
      : `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`;

    let payload = await fetchCardPayload(url);

    if (payload.status === 429) {
      const retryMs = Math.max(
        parseRetryAfterMs(payload.retryAfter) ?? 60_000,
        60_000
      );
      await delay(retryMs);
      if (!useProxy) {
        await delay(MIN_MS_BETWEEN_SCRYFALL_REQUESTS);
      }
      payload = await fetchCardPayload(url);
    }

    if (!payload.ok) {
      let detail = payload.text || String(payload.status);
      try {
        const errJson = JSON.parse(payload.text) as {
          details?: string;
          error?: string;
        };
        if (errJson?.details) detail = errJson.details;
        else if (errJson?.error) detail = errJson.error;
      } catch {}
      throw new Error(`Scryfall fetch failed (${payload.status}): ${detail}`);
    }

    let json: any;
    try {
      json = JSON.parse(payload.text);
    } catch {
      throw new Error("Scryfall returned invalid JSON.");
    }

    const card = cardFromScryfallJson(json);
    persistCache(name, card);

    return card;
  });
}

export async function fetchCardById(cardId: string): Promise<ScryfallCard> {
  const useProxy = typeof window !== "undefined";
  const url = useProxy
    ? `/api/scryfall/card?id=${encodeURIComponent(cardId)}`
    : `https://api.scryfall.com/cards/${encodeURIComponent(cardId)}`;

  return enqueueScryfall(async () => {
    if (!useProxy) {
      await delay(MIN_MS_BETWEEN_SCRYFALL_REQUESTS);
    }
    let payload = await fetchCardPayload(url);
    if (payload.status === 429) {
      const retryMs = Math.max(
        parseRetryAfterMs(payload.retryAfter) ?? 60_000,
        60_000
      );
      await delay(retryMs);
      if (!useProxy) {
        await delay(MIN_MS_BETWEEN_SCRYFALL_REQUESTS);
      }
      payload = await fetchCardPayload(url);
    }
    if (!payload.ok) {
      throw new Error(`Scryfall fetch failed (${payload.status})`);
    }
    const json = JSON.parse(payload.text);
    const card = cardFromScryfallJson(json);
    persistCache(card.name, card);
    return card;
  });
}
