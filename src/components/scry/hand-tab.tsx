"use client";

import * as React from "react";

import type { Deck } from "@/lib/deck";
import { expandDeck } from "@/lib/deck";
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

export function HandTab({ deck }: { deck: Deck }) {
  const fullDeck = React.useMemo(() => expandDeck(deck), [deck]);
  const [library, setLibrary] = React.useState<ScryfallCard[]>([]);
  const [hand, setHand] = React.useState<ScryfallCard[]>([]);
  const [handSize, setHandSize] = React.useState(7);

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

  const verdict = verdictForHand(hand);
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
        <Badge variant={verdict === "Keep" ? "default" : "secondary"}>
          Verdict: {verdict}
        </Badge>
        <Badge variant="secondary">Lands: {landCount}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {hand.map((card, idx) => (
          <Card key={`${card.id}-${idx}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{card.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <div>{card.mana_cost || "No mana cost"}</div>
              <div>{card.type_line}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

