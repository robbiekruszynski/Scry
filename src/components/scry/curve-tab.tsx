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

/** One color per CMC bucket (0 … 8+) for quick scanning */
const MANA_CURVE_COLORS = [
  "#94a3b8",
  "#38bdf8",
  "#34d399",
  "#fbbf24",
  "#fb923c",
  "#f87171",
  "#a78bfa",
  "#e879f9",
  "#dc2626",
];

/** Lands → Planeswalkers: distinct hues */
const TYPE_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#60a5fa",
  "#a855f7",
  "#78716c",
  "#ec4899",
  "#eab308",
];

/** Classic WUBRG (W uses warm gold so it reads on light + dark UI) */
const WUBRG_COLORS = ["#fcd34d", "#2563eb", "#57534e", "#ef4444", "#16a34a"];

const chartBorder = {
  borderColor: "rgba(15, 23, 42, 0.25)",
  borderWidth: 1,
};

export function CurveTab({ deck }: { deck: Deck }) {
  const curve = React.useMemo(() => manaCurveBuckets(deck), [deck]);
  const types = React.useMemo(() => typeDistribution(deck), [deck]);
  const colors = React.useMemo(() => colorIdentityCounts(deck), [deck]);

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        grid: { color: "rgba(148, 163, 184, 0.2)" },
        ticks: { color: "var(--muted-foreground)" },
      },
      y: {
        beginAtZero: true,
        grid: { color: "rgba(148, 163, 184, 0.2)" },
        ticks: { color: "var(--muted-foreground)", precision: 0 },
      },
    },
  } as const;

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right" as const,
        labels: {
          color: "var(--foreground)",
          padding: 12,
          usePointStyle: true,
        },
      },
    },
  };

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
                  backgroundColor: curve.labels.map(
                    (_, i) => MANA_CURVE_COLORS[i] ?? MANA_CURVE_COLORS[MANA_CURVE_COLORS.length - 1]!
                  ),
                  ...chartBorder,
                },
              ],
            }}
            options={barOptions}
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
              datasets: [
                {
                  data: types.values,
                  backgroundColor: types.labels.map(
                    (_, i) => TYPE_COLORS[i % TYPE_COLORS.length]!
                  ),
                  ...chartBorder,
                },
              ],
            }}
            options={doughnutOptions}
            height={260}
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
                  backgroundColor: WUBRG_COLORS,
                  ...chartBorder,
                },
              ],
            }}
            options={barOptions}
            height={240}
          />
        </CardContent>
      </Card>
    </div>
  );
}

