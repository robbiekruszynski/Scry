"use client";

import * as React from "react";

import type { CardTagMap, Deck } from "@/lib/deck";
import { BudgetTuner } from "@/components/scry/budget-tuner";
import {
  deckHealthWarnings,
  deckBenchmarkScores,
  simulateCurveProbabilities,
  colorIdentityViolations,
} from "@/lib/commander-tools";
import { computeDeckStats } from "@/lib/stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {hint ? (
          <div className="mt-2 text-sm text-muted-foreground">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function OverviewTab({
  deck,
  tagMap,
}: {
  deck: Deck;
  tagMap: CardTagMap;
}) {
  const stats = React.useMemo(() => computeDeckStats(deck), [deck]);
  const warnings = React.useMemo(() => deckHealthWarnings(deck), [deck]);
  const benchmarkScores = React.useMemo(() => deckBenchmarkScores(deck), [deck]);
  const violations = React.useMemo(() => colorIdentityViolations(deck), [deck]);
  const curveOdds = React.useMemo(() => simulateCurveProbabilities(deck, 1200), [
    deck,
    tagMap,
  ]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">{stats.uniqueCards} unique</Badge>
        <Badge variant="secondary">{stats.totalCards} total</Badge>
        <span className="text-xs">
          Ramp and interaction are automatically classified from card text and tags.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Total cards" value={stats.totalCards} />
        <StatCard
          title="Lands"
          value={stats.landCount}
          hint={`${stats.landPercent.toFixed(1)}%`}
        />
        <StatCard
          title="Average CMC (non-lands)"
          value={stats.avgCmcNonLands.toFixed(2)}
        />
        <StatCard title="Creatures" value={stats.creatureCount} />
        <StatCard title="Ramp" value={stats.rampCount} />
        <StatCard title="Interaction" value={stats.interactionCount} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">What these counts mean</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Metric</TableHead>
                <TableHead>What it means for deckbuilding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium text-foreground">
                  Total cards
                </TableCell>
                <TableCell>
                  Total list size. Commander lists are typically 100 cards.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">
                  Lands / Land %
                </TableCell>
                <TableCell>
                  Mana base density. Too low can cause missed land drops; too high can reduce spell
                  density.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">
                  Average CMC
                </TableCell>
                <TableCell>
                  Average mana value of nonland cards. Higher values usually mean slower starts.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">
                  Creatures
                </TableCell>
                <TableCell>
                  Number of creature cards; indicates board presence and combat focus.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">Ramp</TableCell>
                <TableCell>
                  Cards that increase available mana (rocks, land ramp, treasure generation, etc.).
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium text-foreground">
                  Interaction
                </TableCell>
                <TableCell>
                  Cards that answer threats (removal, counters, bounce, damage-based answers).
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Deck health vs benchmark metas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="text-xs leading-relaxed text-muted-foreground">
              These profiles are reference targets for common Commander environments (precon,
              upgraded precon, local tournament, and cEDH-style). The score compares your deck's
              lands, ramp, interaction, and average CMC to each profile. Higher percentages mean
              your current build structure is closer to that environment's typical pacing and
              density.
            </div>
            {benchmarkScores.map((b) => {
              const pct = Math.round(b.score * 100);
              return (
                <div key={b.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span>{b.label}</span>
                    <span className="font-medium text-foreground">{pct}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-muted">
                    <div
                      className="h-2 rounded bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}

            <div className="rounded border bg-muted/20 px-2 py-1 text-xs text-muted-foreground">
              Benchmarks compare: lands, ramp, interaction, and average CMC.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Deck health notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {warnings.length === 0 ? (
              <div className="space-y-2 text-muted-foreground">
                <div>No major warnings detected.</div>
                <div className="rounded border bg-muted/20 px-2 py-1 text-xs">
                  Example warnings you might see in other lists: low ramp density, low interaction
                  density, average CMC too high for the selected benchmark, or non-100 card deck
                  size.
                </div>
              </div>
            ) : (
              warnings.map((w, idx) => (
                <div
                  key={`${w.text}-${idx}`}
                  className={
                    w.tone === "concern"
                      ? "rounded border border-red-500/45 bg-red-500/10 px-2 py-1.5 text-foreground shadow-[inset_3px_0_0_0_rgba(239,68,68,0.75)] dark:bg-red-950/35"
                      : w.tone === "positive"
                        ? "rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-foreground shadow-[inset_3px_0_0_0_rgba(34,197,94,0.75)] dark:bg-emerald-950/30"
                        : "rounded border border-border/80 bg-muted/25 px-2 py-1.5 text-muted-foreground"
                  }
                >
                  {w.text}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Commander legality</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {!deck.commanderName ? (
              <div className="text-muted-foreground">
                Set a commander in Import to run color identity checks.
              </div>
            ) : violations.length === 0 ? (
              <div className="text-muted-foreground">
                No off-color cards detected for commander identity.
              </div>
            ) : (
              <>
                <div className="text-destructive">
                  {violations.length} off-color card(s) detected.
                </div>
                <div className="max-h-28 overflow-auto rounded border px-2 py-1 text-muted-foreground">
                  {violations.slice(0, 30).join(", ")}
                  {violations.length > 30 ? "…" : ""}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">On-curve mana odds (simulated)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {([1, 2, 3, 4] as const).map((turn) => (
            <div key={turn} className="rounded border px-3 py-2">
              <div className="text-xs text-muted-foreground">By turn {turn}</div>
              <div className="text-xl font-semibold">
                {(curveOdds[turn] * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">
                Hit at least {turn} land{turn === 1 ? "" : "s"}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <BudgetTuner deck={deck} />
    </div>
  );
}

