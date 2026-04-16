"use client";

import * as React from "react";

import type { Deck } from "@/lib/deck";
import { computeProbabilities } from "@/lib/analysis";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ProbabilitiesTab({ deck }: { deck: Deck }) {
  const rows = React.useMemo(() => computeProbabilities(deck), [deck]);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Scenario</TableHead>
          <TableHead className="w-1/2">Probability</TableHead>
          <TableHead className="text-right">Percent</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const pct = Math.max(0, Math.min(100, r.probability * 100));
          return (
            <TableRow key={r.label}>
              <TableCell className="font-medium">{r.label}</TableCell>
              <TableCell>
                <div className="h-2 w-full rounded bg-muted">
                  <div
                    className="h-2 rounded bg-primary"
                    style={{ width: `${pct.toFixed(2)}%` }}
                  />
                </div>
              </TableCell>
              <TableCell className="text-right">{pct.toFixed(2)}%</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

