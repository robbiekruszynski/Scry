"use client";

import * as React from "react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

import type { Deck } from "@/lib/deck";
import {
  colorIdentityCounts,
  manaCurveBuckets,
  typeDistribution,
} from "@/lib/analysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

export function CurveTab({ deck }: { deck: Deck }) {
  const curve = React.useMemo(() => manaCurveBuckets(deck), [deck]);
  const types = React.useMemo(() => typeDistribution(deck), [deck]);
  const colors = React.useMemo(() => colorIdentityCounts(deck), [deck]);

  const mono = [
    "oklch(0.87 0 0)",
    "oklch(0.556 0 0)",
    "oklch(0.439 0 0)",
    "oklch(0.371 0 0)",
    "oklch(0.269 0 0)",
    "oklch(0.72 0 0)",
    "oklch(0.62 0 0)",
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Mana curve (non-lands)</CardTitle>
        </CardHeader>
        <CardContent>
          <Bar
            data={{
              labels: curve.labels,
              datasets: [
                {
                  label: "Cards",
                  data: curve.values,
                  backgroundColor: "oklch(0.556 0 0)",
                },
              ],
            }}
            options={{ responsive: true, maintainAspectRatio: false }}
            height={240}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Card type distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <Doughnut
            data={{
              labels: types.labels,
              datasets: [{ data: types.values, backgroundColor: mono }],
            }}
            options={{ responsive: true, maintainAspectRatio: false }}
            height={240}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Color identity count</CardTitle>
        </CardHeader>
        <CardContent>
          <Bar
            data={{
              labels: ["W", "U", "B", "R", "G"],
              datasets: [
                {
                  label: "Symbols",
                  data: [colors.W, colors.U, colors.B, colors.R, colors.G],
                  backgroundColor: mono.slice(0, 5),
                },
              ],
            }}
            options={{ responsive: true, maintainAspectRatio: false }}
            height={240}
          />
        </CardContent>
      </Card>
    </div>
  );
}

