"use client";

import * as React from "react";

import type { Deck } from "@/lib/deck";
import type { ScryfallCard } from "@/lib/scryfall";
import { fetchCardById, fetchCardByNameFuzzy } from "@/lib/scryfall";
import { computeDeckStats } from "@/lib/stats";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Candidate = {
  name: string;
  reason: string;
  /** Used for impact scoring and “why this add” copy */
  category: "ramp" | "interaction" | "draw";
};

const RAMP_CANDIDATES: Candidate[] = [
  { name: "Arcane Signet", reason: "cheap, universal mana rock", category: "ramp" },
  { name: "Fellwar Stone", reason: "efficient color fixing", category: "ramp" },
  { name: "Nature's Lore", reason: "2 mana land ramp", category: "ramp" },
  { name: "Three Visits", reason: "2 mana land ramp", category: "ramp" },
  { name: "Rampant Growth", reason: "budget land acceleration", category: "ramp" },
];

const INTERACTION_CANDIDATES: Candidate[] = [
  { name: "Swords to Plowshares", reason: "efficient creature removal", category: "interaction" },
  { name: "Path to Exile", reason: "efficient creature removal", category: "interaction" },
  { name: "Generous Gift", reason: "broad permanent answer", category: "interaction" },
  { name: "Pongify", reason: "1 mana creature interaction", category: "interaction" },
  { name: "Counterspell", reason: "clean stack interaction", category: "interaction" },
];

const DRAW_CANDIDATES: Candidate[] = [
  { name: "Mystic Remora", reason: "early draw engine", category: "draw" },
  { name: "Rhystic Study", reason: "high impact draw source", category: "draw" },
  { name: "Fact or Fiction", reason: "instant speed card advantage", category: "draw" },
  { name: "Night's Whisper", reason: "cheap card draw", category: "draw" },
  { name: "Read the Bones", reason: "selection + draw", category: "draw" },
];

function colorLegal(candidateColors: string[], commanderColors: Set<string>) {
  if (commanderColors.size === 0) return true;
  return candidateColors.every((c) => commanderColors.has(c));
}

function describeAddBenefit(
  c: Candidate,
  stats: ReturnType<typeof computeDeckStats>
): string {
  if (c.category === "ramp") {
    return `Ramp is at ${stats.rampCount} (this tool uses ~10 as a loose Commander baseline from card text + tags). ${c.name} helps you deploy your commander and mid-game plays sooner.`;
  }
  if (c.category === "interaction") {
    return `Interaction is at ${stats.interactionCount} (~10 baseline). ${c.name} improves answers to creatures, planeswalkers, and problem permanents so you can survive to your win condition.`;
  }
  return `Nonland average CMC is ${stats.avgCmcNonLands.toFixed(2)} (above ~3.3 triggers draw suggestions). ${c.name} helps you dig for lands and action in longer games.`;
}

/** Split ordered lists into three visual bands: best candidates, middle, weakest. */
function listTier(index: number, length: number): "high" | "mid" | "low" {
  if (length <= 0) return "mid";
  const third = Math.max(1, Math.ceil(length / 3));
  if (index < third) return "high";
  if (index < third * 2) return "mid";
  return "low";
}

const ADD_TIER_ROW: Record<
  "high" | "mid" | "low",
  { row: string; label: string }
> = {
  high: {
    row: "border-l-[3px] border-l-emerald-500 bg-emerald-500/[0.12] dark:bg-emerald-950/35",
    label: "Priority add",
  },
  mid: {
    row: "border-l-[3px] border-l-amber-500 bg-amber-500/[0.12] dark:bg-amber-950/35",
    label: "Consider",
  },
  low: {
    row: "border-l-[3px] border-l-red-500 bg-red-500/[0.12] dark:bg-red-950/35",
    label: "Optional / if owned",
  },
};

export function BudgetTuner({ deck }: { deck: Deck }) {
  const [targetBudget, setTargetBudget] = React.useState<string>("0.00");
  /** Once true, estimated deck value no longer overwrites the budget field (until deck change or “Match deck value”). */
  const [userEditedBudget, setUserEditedBudget] = React.useState(false);
  const [priceMap, setPriceMap] = React.useState<Record<string, number | null>>({});
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isHydratingEstimate, setIsHydratingEstimate] = React.useState(false);
  const [priceProgress, setPriceProgress] = React.useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [suggestions, setSuggestions] = React.useState<
    {
      card: ScryfallCard;
      price: number;
      reason: string;
      impact: number;
      category: Candidate["category"];
      deckBenefit: string;
    }[]
  >([]);
  const [hovered, setHovered] = React.useState<ScryfallCard | null>(null);
  const hydrationStateRef = React.useRef<{
    deckSignature: string;
    attemptedIds: Set<string>;
  }>({
    deckSignature: "",
    attemptedIds: new Set<string>(),
  });
  const stats = React.useMemo(() => computeDeckStats(deck), [deck]);
  const deckSignature = React.useMemo(
    () =>
      deck.entries
        .map((e) => `${e.card.id}:${e.count}`)
        .sort()
        .join("|"),
    [deck.entries]
  );

  const currentDeckPrice = React.useMemo(() => {
    return deck.entries.reduce((sum, e) => {
      const p =
        priceMap[e.card.id] !== undefined
          ? priceMap[e.card.id]
          : e.card.price_usd ?? null;
      return sum + (p ?? 0) * e.count;
    }, 0);
  }, [deck.entries, priceMap]);

  const prevDeckSigRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const sigChanged = prevDeckSigRef.current !== deckSignature;
    if (prevDeckSigRef.current === null) {
      prevDeckSigRef.current = deckSignature;
      setTargetBudget(currentDeckPrice.toFixed(2));
      return;
    }
    if (sigChanged) {
      prevDeckSigRef.current = deckSignature;
      setUserEditedBudget(false);
      setTargetBudget(currentDeckPrice.toFixed(2));
    } else if (!userEditedBudget) {
      setTargetBudget(currentDeckPrice.toFixed(2));
    }
  }, [deckSignature, currentDeckPrice, userEditedBudget]);

  const pricedCardCount = React.useMemo(() => {
    return deck.entries.filter((e) => {
      const p =
        priceMap[e.card.id] !== undefined
          ? priceMap[e.card.id]
          : e.card.price_usd ?? null;
      return p !== null && p !== undefined;
    }).length;
  }, [deck.entries, priceMap]);

  const totalUniqueCount = deck.entries.length;
  const coverageRatio =
    totalUniqueCount > 0 ? pricedCardCount / totalUniqueCount : 0;
  const priceProgressPct =
    priceProgress.total > 0
      ? Math.round((priceProgress.done / priceProgress.total) * 100)
      : 0;
  const confidenceLabel =
    coverageRatio >= 0.95
      ? "High confidence"
      : coverageRatio >= 0.75
        ? "Medium confidence"
        : "Low confidence";

  const budgetAmount = Number(targetBudget);
  const budgetNum = Number.isFinite(budgetAmount) ? budgetAmount : 0;
  /** Positive = room under your budget for purchases; negative = deck costs more than your budget. */
  const buyingPower = budgetNum - currentDeckPrice;
  const overBudgetAbs = Math.max(0, currentDeckPrice - budgetNum);

  const profileNeed = React.useMemo(() => {
    return {
      needRamp: Math.max(0, 10 - stats.rampCount),
      needInteraction: Math.max(0, 10 - stats.interactionCount),
      needCurve: stats.avgCmcNonLands > 3.3 ? 1 : 0,
    };
  }, [stats.rampCount, stats.interactionCount, stats.avgCmcNonLands]);

  const refreshPrices = React.useCallback(async () => {
    setIsRefreshing(true);
    try {
      const next: Record<string, number | null> = {};
      setPriceProgress({ done: 0, total: deck.entries.length });
      let done = 0;
      for (const e of deck.entries) {
        try {
          const card = await fetchCardById(e.card.id);
          next[e.card.id] = card.price_usd ?? null;
        } catch {
          next[e.card.id] = e.card.price_usd ?? null;
        }
        done += 1;
        setPriceProgress({ done, total: deck.entries.length });
      }
      setPriceMap(next);
    } finally {
      setIsRefreshing(false);
      setPriceProgress({ done: 0, total: 0 });
    }
  }, [deck.entries]);

  React.useEffect(() => {
    let active = true;
    if (hydrationStateRef.current.deckSignature !== deckSignature) {
      hydrationStateRef.current = {
        deckSignature,
        attemptedIds: new Set<string>(),
      };
    }

    const unresolved = deck.entries.filter((e) => {
      const p =
        priceMap[e.card.id] !== undefined
          ? priceMap[e.card.id]
          : e.card.price_usd ?? null;
      if (p !== null && p !== undefined) return false;
      return !hydrationStateRef.current.attemptedIds.has(e.card.id);
    });
    if (unresolved.length === 0) return;

    (async () => {
      setIsHydratingEstimate(true);
      try {
        const next: Record<string, number | null> = {};
        setPriceProgress({ done: 0, total: unresolved.length });
        let done = 0;
        for (const e of unresolved) {
          hydrationStateRef.current.attemptedIds.add(e.card.id);
          try {
            const card = await fetchCardById(e.card.id);
            next[e.card.id] = card.price_usd ?? null;
          } catch {
            next[e.card.id] = e.card.price_usd ?? null;
          }
          done += 1;
          setPriceProgress({ done, total: unresolved.length });
        }
        if (active) {
          setPriceMap((prev) => ({ ...prev, ...next }));
        }
      } finally {
        if (active) setIsHydratingEstimate(false);
        if (active) setPriceProgress({ done: 0, total: 0 });
      }
    })();

    return () => {
      active = false;
    };
  }, [deck.entries, priceMap, deckSignature]);

  const buildAddSuggestions = React.useCallback(async () => {
    const commander = deck.commanderName
      ? deck.entries.find(
          (e) => e.card.name.toLowerCase() === deck.commanderName!.toLowerCase()
        )?.card
      : undefined;
    const commanderColors = new Set(commander?.color_identity ?? []);
    const pool: Candidate[] = [];
    if (stats.rampCount < 10) pool.push(...RAMP_CANDIDATES);
    if (stats.interactionCount < 10) pool.push(...INTERACTION_CANDIDATES);
    if (stats.avgCmcNonLands > 3.3) pool.push(...DRAW_CANDIDATES);
    if (pool.length === 0) pool.push(...RAMP_CANDIDATES.slice(0, 2), ...INTERACTION_CANDIDATES.slice(0, 2));

    const out: {
      card: ScryfallCard;
      price: number;
      reason: string;
      impact: number;
      category: Candidate["category"];
      deckBenefit: string;
    }[] = [];
    const seen = new Set(deck.entries.map((e) => e.card.name.toLowerCase()));
    for (const c of pool) {
      if (seen.has(c.name.toLowerCase())) continue;
      const card = await fetchCardByNameFuzzy(c.name);
      if (!colorLegal(card.color_identity, commanderColors)) continue;
      const p = card.price_usd ?? 0;
      const impact =
        c.category === "ramp"
          ? Math.min(1, 0.5 + profileNeed.needRamp * 0.08)
          : c.category === "interaction"
            ? Math.min(1, 0.5 + profileNeed.needInteraction * 0.08)
            : Math.min(1, 0.45 + profileNeed.needCurve * 0.25);
      out.push({
        card,
        price: p,
        reason: c.reason,
        impact,
        category: c.category,
        deckBenefit: describeAddBenefit(c, stats),
      });
    }
    out.sort((a, b) => b.impact - a.impact || a.price - b.price);
    setSuggestions(out.slice(0, 10));
  }, [
    deck,
    stats.rampCount,
    stats.interactionCount,
    stats.avgCmcNonLands,
    profileNeed.needRamp,
    profileNeed.needInteraction,
    profileNeed.needCurve,
  ]);

  React.useEffect(() => {
    void buildAddSuggestions();
  }, [buildAddSuggestions]);

  const addCount = suggestions.length;

  const previewPanel = (
    <div
      className="rounded-lg border bg-muted/30 p-2 shadow-sm backdrop-blur-sm lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
      aria-live="polite"
    >
      {hovered?.image_url_large || hovered?.image_url ? (
        <div className="space-y-2">
          <img
            src={hovered?.image_url_large || hovered?.image_url}
            alt={hovered?.name ?? "Card preview"}
            className="mx-auto h-auto max-h-[min(320px,calc(100vh-10rem))] w-auto rounded-md border object-contain"
          />
          <div className="text-sm font-medium">{hovered?.name}</div>
          <div className="flex flex-wrap gap-2 text-xs">
            {hovered?.scryfall_uri ? (
              <a
                href={hovered.scryfall_uri}
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:underline"
              >
                View on Scryfall
              </a>
            ) : null}
            {hovered?.purchase_uris?.tcgplayer ? (
              <a
                href={hovered.purchase_uris.tcgplayer}
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:underline"
              >
                Buy on TCGplayer
              </a>
            ) : null}
            {hovered?.purchase_uris?.cardmarket ? (
              <a
                href={hovered.purchase_uris.cardmarket}
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:underline"
              >
                Buy on Cardmarket
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex min-h-[160px] items-center justify-center px-2 text-center text-xs text-muted-foreground lg:min-h-[200px]">
          Hover a suggested add to preview.
        </div>
      )}
    </div>
  );

  return (
    <Card className="overflow-visible">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Budget tuner</CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Your budget defaults to this deck’s estimated value — set it to what you can spend on
          upgrades. Suggestions use simple deck stats and a small staple pool (not full deck
          “synergy” analysis). Automatic cut lists are disabled: price-only heuristics tended to
          flag expensive staples instead of true dead weight.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 overflow-visible text-sm">
        <div className="flex flex-col gap-4 overflow-visible lg:grid lg:grid-cols-[1fr_min(300px,100%)] lg:grid-rows-[auto_auto] lg:items-start lg:gap-x-4 lg:gap-y-4">
          <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-1">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Your budget (USD)</div>
                <Input
                  value={targetBudget}
                  onChange={(e) => {
                    setUserEditedBudget(true);
                    setTargetBudget(e.target.value);
                  }}
                  className="w-36"
                  inputMode="decimal"
                  aria-label="Budget in US dollars"
                />
                <div className="text-[11px] text-muted-foreground">
                  Starts at your deck’s estimated value. Change it to your spending limit.
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-xs"
                onClick={() => {
                  setUserEditedBudget(false);
                  setTargetBudget(currentDeckPrice.toFixed(2));
                }}
              >
                Match deck value
              </Button>
              <Button variant="outline" onClick={refreshPrices} disabled={isRefreshing}>
                {isRefreshing ? "Refreshing prices…" : "Refresh prices"}
              </Button>
            </div>

            <div className="rounded border bg-muted/20 p-3">
              <div>Current estimated deck value: ${currentDeckPrice.toFixed(2)}</div>
              <div>Your budget: ${budgetNum.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">
                Pricing coverage: {pricedCardCount}/{totalUniqueCount} unique cards
                {isHydratingEstimate ? " (updating…)" : ""}
              </div>
              {isHydratingEstimate || isRefreshing ? (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      Fetching card prices: {priceProgress.done}/{priceProgress.total}
                    </span>
                    <span>{priceProgressPct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-muted">
                    <div
                      className="h-2 rounded bg-primary transition-all duration-300"
                      style={{ width: `${priceProgressPct}%` }}
                    />
                  </div>
                </div>
              ) : null}
              <div
                className={
                  confidenceLabel === "High confidence"
                    ? "mt-2 text-xs text-emerald-600 dark:text-emerald-500"
                    : confidenceLabel === "Medium confidence"
                      ? "mt-2 text-xs text-amber-600 dark:text-amber-500"
                      : "mt-2 text-xs text-destructive"
                }
              >
                {confidenceLabel}
              </div>
              <div
                className={
                  overBudgetAbs > 0.01
                    ? "text-destructive"
                    : buyingPower > 0.01
                      ? "text-emerald-600 dark:text-emerald-500"
                      : "text-muted-foreground"
                }
              >
                {overBudgetAbs > 0.01 ? (
                  <>
                    Deck is about ${overBudgetAbs.toFixed(2)} above your budget — trim or swap cards
                    manually, or raise your budget target.
                  </>
                ) : buyingPower > 0.01 ? (
                  <>
                    About ${buyingPower.toFixed(2)} buying power vs your budget (room for upgrades
                    before you exceed your limit).
                  </>
                ) : (
                  <>Deck value and your budget are aligned.</>
                )}
              </div>
            </div>

            <div className="rounded border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">Impact if added</span>: fit for current
                gaps (ramp, interaction, curve) and commander color legality. Higher % is a stronger
                generic upgrade for this list. A “within buying power” tag means this card’s list price
                is at or below your current headroom (single purchase — not a full cart).
              </div>
            </div>
          </div>

          {/* Desktop: right column spans controls + lists; sticky needs Card overflow-visible (default Card overflow-hidden breaks sticky) */}
          <div className="hidden lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-28 lg:z-30 lg:block lg:self-start">
            {previewPanel}
          </div>

          {/* Mobile: stays under the sticky app header while scrolling suggested adds */}
          <div className="sticky top-28 z-30 lg:hidden">{previewPanel}</div>

          <div className="min-w-0 lg:col-start-1 lg:row-start-2 space-y-4">
            <div className="flex min-h-[min(420px,55vh)] flex-col gap-2">
            <div>
              <div className="font-medium">Suggested adds</div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Green = priority add · Orange = consider · Red = optional / nice-to-have if you
                already own it. Tags compare each card’s price to your current buying power (budget
                minus deck value).
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded border">
              {suggestions.map((s, idx) => {
                const tier = listTier(idx, addCount);
                const tierStyle = ADD_TIER_ROW[tier];
                const withinBuyingPower =
                  buyingPower > 0.01 && s.price <= buyingPower + 0.005;
                return (
                  <div
                    key={s.card.name}
                    className={`border-b px-2 py-2 last:border-b-0 ${tierStyle.row}`}
                    onMouseEnter={() => setHovered(s.card)}
                  >
                    <div className="mb-0.5 flex flex-wrap items-center gap-2">
                      <span className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground">
                        {tierStyle.label}
                      </span>
                      {withinBuyingPower ? (
                        <span className="rounded border border-emerald-500/50 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                          Within buying power
                        </span>
                      ) : buyingPower > 0.01 ? (
                        <span className="rounded border border-muted-foreground/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          Over headroom
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={s.card.scryfall_uri}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate pr-2 underline-offset-2 hover:underline"
                      >
                        {s.card.name}
                      </a>
                      <span className="shrink-0">${s.price.toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{s.reason}</div>
                    <div className="text-xs text-muted-foreground">
                      Impact if added: {(s.impact * 100).toFixed(0)}%
                    </div>
                    <div className="mt-1.5 space-y-1 text-[11px] leading-snug text-muted-foreground">
                      <p>
                        <span className="font-medium text-foreground/90">How this helps the deck: </span>
                        {s.deckBenefit}
                      </p>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-2 text-xs">
                      {s.card.purchase_uris?.tcgplayer ? (
                        <a
                          href={s.card.purchase_uris.tcgplayer}
                          target="_blank"
                          rel="noreferrer"
                          className="underline-offset-2 hover:underline"
                        >
                          Buy (TCGplayer)
                        </a>
                      ) : null}
                      {s.card.purchase_uris?.cardmarket ? (
                        <a
                          href={s.card.purchase_uris.cardmarket}
                          target="_blank"
                          rel="noreferrer"
                          className="underline-offset-2 hover:underline"
                        >
                          Buy (Cardmarket)
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Prices come from Scryfall and can be refreshed any time.
        </div>
      </CardContent>
    </Card>
  );
}

