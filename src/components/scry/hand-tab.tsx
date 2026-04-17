"use client";

import * as React from "react";

import type { CardTagMap, Deck } from "@/lib/deck";
import { expandDeck } from "@/lib/deck";
import { mulliganAdvice } from "@/lib/commander-tools";
import { isLand } from "@/lib/stats";
import type { ScryfallCard } from "@/lib/scryfall";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function verdictForHand(cards: ScryfallCard[]) {
  const lands = cards.filter(isLand).length;
  if (lands >= 2 && lands <= 4) return "Keep";
  if (lands <= 1 || lands >= 6) return "Mulligan";
  return "Risky";
}

export function HandTab({
  deck,
  tagMap,
}: {
  deck: Deck;
  tagMap: CardTagMap;
}) {
  const fullDeck = React.useMemo(() => {
    const expanded = expandDeck(deck);
    if (!deck.commanderName) return expanded;

    const commanderIdx = expanded.findIndex(
      (c) => c.name.toLowerCase() === deck.commanderName!.toLowerCase()
    );
    if (commanderIdx < 0) return expanded;

    return [...expanded.slice(0, commanderIdx), ...expanded.slice(commanderIdx + 1)];
  }, [deck]);
  const [library, setLibrary] = React.useState<ScryfallCard[]>([]);
  const [hand, setHand] = React.useState<ScryfallCard[]>([]);
  const [handSize, setHandSize] = React.useState(7);
  const [hoveredCard, setHoveredCard] = React.useState<ScryfallCard | null>(null);

  const newHand = React.useCallback(
    (size = handSize) => {
      const shuffled = shuffle(fullDeck);
      setLibrary(shuffled.slice(size));
      setHand(shuffled.slice(0, size));
    },
    [fullDeck, handSize]
  );

  React.useEffect(() => {
    const start = Math.min(7, fullDeck.length);
    setHandSize(start);
    const shuffled = shuffle(fullDeck);
    setLibrary(shuffled.slice(start));
    setHand(shuffled.slice(0, start));
    setHoveredCard(shuffled[0] ?? null);
  }, [fullDeck]);

  const drawCard = () => {
    if (!library.length) return;
    setHand((h) => [...h, library[0]!]);
    setLibrary((lib) => lib.slice(1));
  };

  const mulligan = () => {
    const next = Math.max(0, handSize - 1);
    setHandSize(next);
    newHand(next);
  };

  const baselineVerdict = verdictForHand(hand);
  const advice = mulliganAdvice(hand, deck.archetype ?? "midrange", tagMap);
  const landCount = hand.filter(isLand).length;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => newHand()}>New hand</Button>
        <Button variant="secondary" onClick={mulligan} disabled={handSize <= 0}>
          Mulligan ({Math.max(0, handSize - 1)})
        </Button>
        <Button variant="outline" onClick={drawCard} disabled={!library.length}>
          Draw a card
        </Button>
        <Badge variant={advice.verdict === "Keep" ? "default" : "secondary"}>
          Verdict: {advice.verdict}
        </Badge>
        <Badge variant="secondary">Lands: {landCount}</Badge>
        <Badge variant="outline">Baseline: {baselineVerdict}</Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Mulligan assistant</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="text-muted-foreground">
            Archetype: <span className="text-foreground capitalize">{deck.archetype ?? "midrange"}</span>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {advice.reasons.map((r, i) => (
              <li key={`${r}-${i}`}>{r}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Opening hand spread</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max items-end px-1 py-3">
              {hand.map((card, idx) => {
                const center = (hand.length - 1) / 2;
                const offsetFromCenter = idx - center;
                const angle = offsetFromCenter * 2.8;
                const lift = Math.abs(offsetFromCenter) * 2;

                return (
                  <div
                    key={`${card.id}-${idx}`}
                    className="relative transition-transform duration-200 hover:z-20 hover:-translate-y-3"
                    style={{
                      marginLeft: idx === 0 ? 0 : -54,
                      transform: `translateY(${lift}px) rotate(${angle}deg)`,
                    }}
                    onMouseEnter={() => setHoveredCard(card)}
                  >
                    <div className="w-[170px] overflow-hidden rounded-xl border bg-card shadow-md">
                      {card.image_url_large || card.image_url ? (
                        <img
                          src={card.image_url_large || card.image_url}
                          alt={card.name}
                          className="h-[238px] w-full object-cover [transform:translateZ(0)]"
                          loading="lazy"
                          draggable={false}
                        />
                      ) : (
                        <div className="flex h-[238px] items-center justify-center px-3 text-center text-xs text-muted-foreground">
                          No image
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {hand.map((card, idx) => (
                <div
                  key={`${card.id}-meta-${idx}`}
                  className="cursor-default rounded-lg border bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50"
                  onMouseEnter={() => setHoveredCard(card)}
                >
                  <div className="truncate text-sm font-medium">{card.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    <Badge variant="secondary" className="font-normal">
                      {card.mana_cost || "No cost"}
                    </Badge>
                    <Badge variant="outline" className="font-normal">
                      {card.type_line}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border bg-muted/20 p-2">
              {hoveredCard?.image_url_large || hoveredCard?.image_url ? (
                <img
                  src={hoveredCard?.image_url_large || hoveredCard?.image_url}
                  alt={hoveredCard?.name ?? "Card preview"}
                  className="mx-auto h-auto max-h-[480px] w-auto rounded-md border object-contain"
                />
              ) : (
                <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                  Hover a card in the spread or a detail panel below
                </div>
              )}
              <div className="mt-2 text-sm">
                <div className="font-medium">
                  {hoveredCard?.name ?? "Card preview"}
                </div>
                {hoveredCard ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {hoveredCard.type_line}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

