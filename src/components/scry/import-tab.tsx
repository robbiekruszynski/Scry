"use client";

import * as React from "react";

import { buildEntries, parseDecklist, type Deck } from "@/lib/deck";
import {
  fetchCardByNameFuzzy,
  getCachedCardByName,
  type ScryfallCard,
} from "@/lib/scryfall";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type ImportResult = {
  deck: Deck | null;
  errors: string[];
};

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]!, idx);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}

export function ImportTab({
  deck,
  onDeckChange,
}: {
  deck: Deck | null;
  onDeckChange: (next: Deck | null) => void;
}) {
  const [text, setText] = React.useState<string>("");
  const [commanderName, setCommanderName] = React.useState<string>("");
  const [isImporting, setIsImporting] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number }>(
    { done: 0, total: 0 }
  );
  const [errors, setErrors] = React.useState<string[]>([]);

  async function runImport(): Promise<ImportResult> {
    const parsed = parseDecklist(text);
    if (parsed.errors.length) return { deck: null, errors: parsed.errors };

    const uniqueNames = Array.from(new Set(parsed.lines.map((l) => l.name)));
    setProgress({ done: 0, total: uniqueNames.length });

    const cardsByRequestedName = new Map<string, ScryfallCard>();

    await mapWithConcurrency(uniqueNames, 6, async (name) => {
      const cached = getCachedCardByName(name);
      const card = cached ?? (await fetchCardByNameFuzzy(name));
      cardsByRequestedName.set(name, card);
      setProgress((p) => ({ ...p, done: Math.min(p.done + 1, p.total) }));
      return card;
    });

    const entries = buildEntries(cardsByRequestedName, parsed.lines);
    return {
      deck: {
        entries,
        commanderName: commanderName.trim() || undefined,
      },
      errors: [],
    };
  }

  async function onImportClick() {
    setIsImporting(true);
    setErrors([]);
    try {
      const res = await runImport();
      setErrors(res.errors);
      onDeckChange(res.deck);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrors([msg]);
      onDeckChange(null);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Import decklist</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="commander">Commander (optional)</Label>
            <Input
              id="commander"
              placeholder="Atraxa, Praetors' Voice"
              value={commanderName}
              onChange={(e) => setCommanderName(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="decklist">Decklist</Label>
            <Textarea
              id="decklist"
              placeholder={"Example:\n1 Sol Ring\n1 Command Tower\n1 Swords to Plowshares"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-48"
            />
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">1 card per line</Badge>
              <Badge variant="secondary">Optional leading count</Badge>
              <span>Fetched from Scryfall with local caching.</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={onImportClick} disabled={isImporting || !text.trim()}>
              {isImporting ? "Importing…" : "Import"}
            </Button>
            {isImporting ? (
              <div className="text-sm text-muted-foreground">
                Fetching cards: {progress.done}/{progress.total}
              </div>
            ) : null}
            {deck ? (
              <div className="text-sm text-muted-foreground">
                Current deck: <span className="text-foreground">{deck.entries.reduce((s, e) => s + e.count, 0)}</span>{" "}
                cards ({deck.entries.length} unique)
              </div>
            ) : null}
          </div>

          {errors.length ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <div className="font-medium">Import error</div>
              <ul className="mt-2 list-disc pl-5">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

