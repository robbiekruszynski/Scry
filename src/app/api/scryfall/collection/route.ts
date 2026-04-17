import { NextRequest, NextResponse } from "next/server";

import {
  createAsyncQueue,
  delay,
  MIN_MS_BETWEEN_SCRYFALL_REQUESTS,
  parseRetryAfterMs,
  scryfallFetchHeaders,
} from "@/lib/scryfall-rate-limit";

const enqueue = createAsyncQueue();

async function postCollection(identifiers: { name: string }[]) {
  const res = await fetch("https://api.scryfall.com/cards/collection", {
    method: "POST",
    headers: {
      ...scryfallFetchHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ identifiers }),
  });
  const text = await res.text();
  return { res, text };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const names = (body as { names?: unknown }).names;
  if (!Array.isArray(names) || names.length === 0) {
    return NextResponse.json(
      { error: "Body must include a non-empty names array." },
      { status: 400 }
    );
  }
  if (names.length > 75) {
    return NextResponse.json(
      { error: "Scryfall allows at most 75 cards per collection request." },
      { status: 400 }
    );
  }

  const identifiers = [
    ...new Set(
      names
        .map((n) => String(n).trim())
        .filter(Boolean)
    ),
  ].map((name) => ({ name }));

  if (identifiers.length === 0) {
    return NextResponse.json({ error: "No valid names after normalization." }, { status: 400 });
  }

  return enqueue(async () => {
    await delay(MIN_MS_BETWEEN_SCRYFALL_REQUESTS);

    let { res, text } = await postCollection(identifiers);

    if (res.status === 429) {
      const retryMs = Math.max(
        parseRetryAfterMs(res.headers.get("Retry-After")) ?? 60_000,
        60_000
      );
      await delay(retryMs);
      await delay(MIN_MS_BETWEEN_SCRYFALL_REQUESTS);
      ({ res, text } = await postCollection(identifiers));
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: text || res.statusText, status: res.status },
        { status: res.status }
      );
    }

    try {
      const json = JSON.parse(text) as unknown;
      return NextResponse.json(json);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON from Scryfall" },
        { status: 502 }
      );
    }
  });
}
