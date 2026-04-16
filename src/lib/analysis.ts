import type { Deck } from "@/lib/deck";
import type { ScryfallCard } from "@/lib/scryfall";
import {
  isArtifact,
  isCreature,
  isEnchantment,
  isInstant,
  isInteraction,
  isLand,
  isPlaneswalker,
  isRamp,
  isSorcery,
} from "@/lib/stats";

export function countCards(deck: Deck, pred: (card: ScryfallCard) => boolean) {
  return deck.entries.reduce((sum, e) => sum + (pred(e.card) ? e.count : 0), 0);
}

export function manaCurveBuckets(deck: Deck) {
  const labels = ["0", "1", "2", "3", "4", "5", "6", "7", "8+"];
  const values = new Array<number>(labels.length).fill(0);

  for (const e of deck.entries) {
    if (isLand(e.card)) continue;
    const cmc = Math.floor(e.card.cmc);
    const idx = cmc >= 8 ? 8 : Math.max(0, cmc);
    values[idx] += e.count;
  }

  return { labels, values };
}

export function typeDistribution(deck: Deck) {
  const labels = [
    "Lands",
    "Creatures",
    "Instants",
    "Sorceries",
    "Artifacts",
    "Enchantments",
    "Planeswalkers",
  ];
  const values = [
    countCards(deck, isLand),
    countCards(deck, isCreature),
    countCards(deck, isInstant),
    countCards(deck, isSorcery),
    countCards(deck, isArtifact),
    countCards(deck, isEnchantment),
    countCards(deck, isPlaneswalker),
  ];
  return { labels, values };
}

export function colorIdentityCounts(deck: Deck) {
  const counts: Record<"W" | "U" | "B" | "R" | "G", number> = {
    W: 0,
    U: 0,
    B: 0,
    R: 0,
    G: 0,
  };
  for (const e of deck.entries) {
    for (const c of e.card.color_identity) {
      if (c in counts) counts[c as keyof typeof counts] += e.count;
    }
  }
  return counts;
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const kk = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= kk; i++) {
    result = (result * (n - kk + i)) / i;
  }
  return result;
}

function hypergeometricExactly(
  populationSize: number,
  successInPopulation: number,
  draws: number,
  successDrawn: number
) {
  const numerator =
    choose(successInPopulation, successDrawn) *
    choose(populationSize - successInPopulation, draws - successDrawn);
  const denominator = choose(populationSize, draws);
  return denominator === 0 ? 0 : numerator / denominator;
}

export function hypergeometricAtLeast(
  populationSize: number,
  successInPopulation: number,
  draws: number,
  atLeast: number
) {
  let p = 0;
  const max = Math.min(draws, successInPopulation);
  for (let k = atLeast; k <= max; k++) {
    p += hypergeometricExactly(populationSize, successInPopulation, draws, k);
  }
  return p;
}

export function hypergeometricBetweenInclusive(
  populationSize: number,
  successInPopulation: number,
  draws: number,
  min: number,
  max: number
) {
  let p = 0;
  const start = Math.max(0, min);
  const end = Math.min(draws, successInPopulation, max);
  for (let k = start; k <= end; k++) {
    p += hypergeometricExactly(populationSize, successInPopulation, draws, k);
  }
  return p;
}

export type ProbabilityRow = {
  label: string;
  probability: number;
};

export function computeProbabilities(deck: Deck): ProbabilityRow[] {
  const n = deck.entries.reduce((sum, e) => sum + e.count, 0);
  const hand = 7;
  const lands = countCards(deck, isLand);
  const ramps = countCards(deck, isRamp);
  const interactions = countCards(deck, isInteraction);
  const commanderCopies = deck.commanderName
    ? deck.entries.reduce(
        (sum, e) =>
          sum +
          (e.card.name.toLowerCase() === deck.commanderName!.toLowerCase()
            ? e.count
            : 0),
        0
      )
    : 0;

  return [
    {
      label: "At least 2 lands in opening 7",
      probability: hypergeometricAtLeast(n, lands, hand, 2),
    },
    {
      label: "At least 3 lands in opening 7",
      probability: hypergeometricAtLeast(n, lands, hand, 3),
    },
    {
      label: "Ideal hand (2-4 lands)",
      probability: hypergeometricBetweenInclusive(n, lands, hand, 2, 4),
    },
    {
      label: "At least 1 ramp card in 7",
      probability: hypergeometricAtLeast(n, ramps, hand, 1),
    },
    {
      label: "Commander in opening 7",
      probability: hypergeometricAtLeast(n, commanderCopies, hand, 1),
    },
    {
      label: "At least 1 piece of interaction in 7",
      probability: hypergeometricAtLeast(n, interactions, hand, 1),
    },
  ];
}

