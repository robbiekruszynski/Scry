import type { CardTagMap, Deck, DeckArchetype } from "@/lib/deck";
import { expandDeck } from "@/lib/deck";
import type { ScryfallCard } from "@/lib/scryfall";
import {
  isArtifact,
  computeDeckStats,
  isInteraction,
  isLand,
  isRamp,
  isWinconHeuristic,
} from "@/lib/stats";

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function hasTag(
  card: ScryfallCard,
  tagMap: CardTagMap,
  tag: "ramp" | "interaction"
) {
  return (tagMap[card.id] ?? []).includes(tag);
}

export function countRampInCards(cards: ScryfallCard[], tagMap: CardTagMap) {
  return cards.filter((c) => hasTag(c, tagMap, "ramp") || isRamp(c)).length;
}

export function countInteractionInCards(cards: ScryfallCard[], tagMap: CardTagMap) {
  return cards.filter((c) => hasTag(c, tagMap, "interaction") || isInteraction(c))
    .length;
}

export function colorIdentityViolations(deck: Deck) {
  if (!deck.commanderName) return [];
  const commander = deck.entries.find(
    (e) => e.card.name.toLowerCase() === deck.commanderName!.toLowerCase()
  )?.card;
  if (!commander) return [];

  const commanderSet = new Set(commander.color_identity);
  return deck.entries
    .filter((e) => e.card.id !== commander.id)
    .filter((e) =>
      e.card.color_identity.some((c) => !commanderSet.has(c))
    )
    .map((e) => e.card.name);
}

/** concern = worth reviewing or updating; positive = strength; neutral = context */
export type HealthWarning = {
  tone: "concern" | "positive" | "neutral";
  text: string;
};

type BenchmarkProfile = {
  id: "precon" | "upgraded_precon" | "local_tournament" | "cedh";
  label: string;
  targets: {
    lands: number;
    ramp: number;
    interaction: number;
    avgCmc: number;
    fastMana: number;
    tutors: number;
    efficientInteraction: number;
    freeInteraction: number;
    wincons: number;
  };
};

const BENCHMARKS: BenchmarkProfile[] = [
  {
    id: "precon",
    label: "Precon decks",
    targets: {
      lands: 38,
      ramp: 8,
      interaction: 7,
      avgCmc: 3.7,
      fastMana: 1,
      tutors: 1,
      efficientInteraction: 2,
      freeInteraction: 0,
      wincons: 2,
    },
  },
  {
    id: "upgraded_precon",
    label: "Upgraded precons",
    targets: {
      lands: 37,
      ramp: 10,
      interaction: 10,
      avgCmc: 3.4,
      fastMana: 3,
      tutors: 3,
      efficientInteraction: 5,
      freeInteraction: 1,
      wincons: 3,
    },
  },
  {
    id: "local_tournament",
    label: "Local tournaments",
    targets: {
      lands: 36,
      ramp: 11,
      interaction: 12,
      avgCmc: 3.1,
      fastMana: 6,
      tutors: 6,
      efficientInteraction: 9,
      freeInteraction: 3,
      wincons: 4,
    },
  },
  {
    id: "cedh",
    label: "cEDH-style",
    targets: {
      lands: 31,
      ramp: 14,
      interaction: 18,
      avgCmc: 2.2,
      fastMana: 11,
      tutors: 10,
      efficientInteraction: 14,
      freeInteraction: 6,
      wincons: 4,
    },
  },
];

function closeness(actual: number, target: number, tolerance: number) {
  const diff = Math.abs(actual - target);
  const raw = 1 - diff / tolerance;
  return Math.max(0, Math.min(1, raw));
}

export function deckBenchmarkScores(deck: Deck) {
  const s = computeDeckStats(deck);
  const p = computePowerSignals(deck);
  return BENCHMARKS.map((b) => {
    const landScore = closeness(s.landCount, b.targets.lands, 10);
    const rampScore = closeness(s.rampCount, b.targets.ramp, 8);
    const interactionScore = closeness(s.interactionCount, b.targets.interaction, 10);
    const cmcScore = closeness(s.avgCmcNonLands, b.targets.avgCmc, 1.8);
    const fastManaScore = closeness(p.fastManaCount, b.targets.fastMana, 8);
    const tutorScore = closeness(p.tutorCount, b.targets.tutors, 8);
    const efficientInteractionScore = closeness(
      p.efficientInteractionCount,
      b.targets.efficientInteraction,
      10
    );
    const freeInteractionScore = closeness(
      p.freeInteractionCount,
      b.targets.freeInteraction,
      6
    );
    const winconScore = closeness(p.winconCount, b.targets.wincons, 4);

    const totalScore =
      landScore * 0.14 +
      rampScore * 0.14 +
      interactionScore * 0.12 +
      cmcScore * 0.14 +
      fastManaScore * 0.14 +
      tutorScore * 0.12 +
      efficientInteractionScore * 0.12 +
      freeInteractionScore * 0.05 +
      winconScore * 0.03;

    return {
      id: b.id,
      label: b.label,
      score: totalScore,
      targets: b.targets,
      deltas: {
        lands: s.landCount - b.targets.lands,
        ramp: s.rampCount - b.targets.ramp,
        interaction: s.interactionCount - b.targets.interaction,
        avgCmc: s.avgCmcNonLands - b.targets.avgCmc,
        fastMana: p.fastManaCount - b.targets.fastMana,
        tutors: p.tutorCount - b.targets.tutors,
        efficientInteraction:
          p.efficientInteractionCount - b.targets.efficientInteraction,
      },
    };
  });
}

export function deckHealthWarnings(deck: Deck): HealthWarning[] {
  const s = computeDeckStats(deck);
  const p = computePowerSignals(deck);
  const warnings: HealthWarning[] = [];
  if (s.totalCards !== 100) {
    warnings.push({
      tone: "concern",
      text: `Deck size is ${s.totalCards}; Commander decks are usually 100 cards.`,
    });
  }
  if (s.totalCards === 100) {
    warnings.push({
      tone: "positive",
      text: "Deck size is on target for Commander (100 cards).",
    });
  }

  const bestFit = deckBenchmarkScores(deck).sort((a, b) => b.score - a.score)[0];
  if (!bestFit) return warnings;

  warnings.push({
    tone: "neutral",
    text: `Closest benchmark profile: ${bestFit.label} (${Math.round(
      bestFit.score * 100
    )}% structural match).`,
  });

  if (bestFit.deltas.lands < -2) {
    warnings.push({
      tone: "concern",
      text: `Land count is below ${bestFit.label} by ${Math.abs(
        Math.round(bestFit.deltas.lands)
      )}. Consider +1 to +3 lands for smoother opening turns.`,
    });
  } else if (bestFit.deltas.lands > 3) {
    warnings.push({
      tone: "concern",
      text: `Land count is above ${bestFit.label} by ${Math.round(
        bestFit.deltas.lands
      )}. You can test trimming 1-2 lands for more action slots.`,
    });
  } else {
    warnings.push({
      tone: "positive",
      text: "Land count is in a stable range for this benchmark.",
    });
  }

  if (bestFit.deltas.ramp < -2) {
    warnings.push({
      tone: "concern",
      text: `Ramp is below ${bestFit.label} by ${Math.abs(
        Math.round(bestFit.deltas.ramp)
      )}. Add low-CMC ramp (1-2 mana rocks / land ramp) for faster development.`,
    });
  } else if (bestFit.deltas.ramp > 3) {
    warnings.push({
      tone: "concern",
      text: "Ramp density is high; this is good for speed but can reduce threat density if overdone.",
    });
  } else {
    warnings.push({
      tone: "positive",
      text: "Ramp density is close to target.",
    });
  }
  if (bestFit.deltas.interaction < -2) {
    warnings.push({
      tone: "concern",
      text: `Interaction is below ${bestFit.label} baseline by ${Math.abs(
        Math.round(bestFit.deltas.interaction)
      )}. Consider adding flexible removal/counter slots.`,
    });
  } else {
    warnings.push({
      tone: "positive",
      text: "Interaction density is in a healthy range for this profile.",
    });
  }
  if (bestFit.deltas.avgCmc > 0.35) {
    warnings.push({
      tone: "concern",
      text: `Average CMC is above ${bestFit.label} baseline by ${bestFit.deltas.avgCmc.toFixed(
        2
      )}. Trim high-end spells or add more low-cost setup pieces.`,
    });
  } else if (bestFit.deltas.avgCmc < -0.45) {
    warnings.push({
      tone: "concern",
      text: "Average CMC is very lean; make sure you still have enough late-game closers.",
    });
  } else {
    warnings.push({
      tone: "positive",
      text: "Curve looks aligned with this benchmark.",
    });
  }
  if (bestFit.deltas.fastMana < -3) {
    warnings.push({
      tone: "concern",
      text: `Fast mana is below ${bestFit.label} baseline by ${Math.abs(
        Math.round(bestFit.deltas.fastMana)
      )}. Upgrade with efficient accelerants if targeting faster pods.`,
    });
  } else if (p.fastManaCount >= bestFit.targets.fastMana) {
    warnings.push({
      tone: "positive",
      text: "Fast mana package is keeping pace with this benchmark.",
    });
  }
  if (bestFit.deltas.tutors < -2) {
    warnings.push({
      tone: "concern",
      text: `Tutor density is below ${bestFit.label} baseline by ${Math.abs(
        Math.round(bestFit.deltas.tutors)
      )}. Add tutor redundancy if consistency is a priority.`,
    });
  } else if (p.tutorCount >= bestFit.targets.tutors) {
    warnings.push({
      tone: "positive",
      text: "Tutor density supports consistent game plans.",
    });
  }
  if (bestFit.deltas.efficientInteraction < -2) {
    warnings.push({
      tone: "concern",
      text: `Low-cost interaction is below ${bestFit.label} baseline by ${Math.abs(
        Math.round(bestFit.deltas.efficientInteraction)
      )}. Prioritize 1-2 mana answers for faster tables.`,
    });
  } else if (p.efficientInteractionCount >= bestFit.targets.efficientInteraction) {
    warnings.push({
      tone: "positive",
      text: "Low-cost interaction suite is strong for stack/tempo fights.",
    });
  }
  if (p.winconCount < 2) {
    warnings.push({
      tone: "concern",
      text: "Win condition density looks low; consider adding redundant closes.",
    });
  } else {
    warnings.push({
      tone: "positive",
      text: "Win condition density looks sufficient for closing games.",
    });
  }
  return warnings;
}

const FAST_MANA_STAPLES = new Set([
  "mana crypt",
  "sol ring",
  "mana vault",
  "chrome mox",
  "mox diamond",
  "mox amber",
  "jeweled lotus",
  "lotus petal",
]);

function isTutor(card: ScryfallCard) {
  const t = (card.oracle_text ?? "").toLowerCase();
  return (
    t.includes("search your library") &&
    (t.includes("put it into your hand") ||
      t.includes("put that card into your hand") ||
      t.includes("reveal it") ||
      t.includes("onto the battlefield"))
  );
}

function isFastMana(card: ScryfallCard) {
  if (FAST_MANA_STAPLES.has(card.name.toLowerCase())) return true;
  if (!isRamp(card)) return false;
  if (isLand(card)) return false;
  return card.cmc <= 2 && (isArtifact(card) || /\badd\b/.test((card.oracle_text ?? "").toLowerCase()));
}

function isEfficientInteraction(card: ScryfallCard) {
  return isInteraction(card) && card.cmc <= 2;
}

function isFreeInteraction(card: ScryfallCard) {
  if (!isInteraction(card)) return false;
  const cost = card.mana_cost ?? "";
  if (cost.includes("{0}")) return true;
  const t = (card.oracle_text ?? "").toLowerCase();
  return t.includes("without paying its mana cost");
}

export function computePowerSignals(deck: Deck) {
  let fastManaCount = 0;
  let tutorCount = 0;
  let efficientInteractionCount = 0;
  let freeInteractionCount = 0;
  let winconCount = 0;

  for (const e of deck.entries) {
    if (isFastMana(e.card)) fastManaCount += e.count;
    if (isTutor(e.card)) tutorCount += e.count;
    if (isEfficientInteraction(e.card)) efficientInteractionCount += e.count;
    if (isFreeInteraction(e.card)) freeInteractionCount += e.count;
    if (isWinconHeuristic(e.card)) winconCount += e.count;
  }

  return {
    fastManaCount,
    tutorCount,
    efficientInteractionCount,
    freeInteractionCount,
    winconCount,
  };
}

export function mulliganAdvice(
  hand: ScryfallCard[],
  archetype: DeckArchetype,
  tagMap: CardTagMap
) {
  const lands = hand.filter(isLand).length;
  const ramp = countRampInCards(hand, tagMap);
  const interaction = countInteractionInCards(hand, tagMap);
  const lowCurve = hand.filter((c) => !isLand(c) && c.cmc <= 3).length;

  const reasons: string[] = [];
  let verdict: "Keep" | "Mulligan" | "Risky" = "Risky";

  if (lands >= 2 && lands <= 4) {
    verdict = "Keep";
    reasons.push("Solid land count for opening turns.");
  } else if (lands <= 1 || lands >= 6) {
    verdict = "Mulligan";
    reasons.push("Mana base in hand is too extreme.");
  }

  if (archetype === "ramp" && ramp === 0) {
    reasons.push("Ramp deck with no early ramp piece.");
    if (verdict === "Keep") verdict = "Risky";
  }
  if (archetype === "aggro" && lowCurve < 2) {
    reasons.push("Aggro hand lacks enough low-curve plays.");
    if (verdict === "Keep") verdict = "Risky";
  }
  if (archetype === "control" && interaction === 0) {
    reasons.push("Control hand has no interaction.");
    if (verdict === "Keep") verdict = "Risky";
  }
  if (archetype === "combo" && ramp + lowCurve < 2) {
    reasons.push("Combo hand may be too slow to assemble setup.");
    if (verdict === "Keep") verdict = "Risky";
  }

  if (reasons.length === 0) reasons.push("Hand is playable but context-dependent.");

  return { verdict, reasons, lands, ramp, interaction };
}

export function simulateCurveProbabilities(
  deck: Deck,
  iterations = 2000
): Record<1 | 2 | 3 | 4, number> {
  const expanded = expandDeck(deck);
  if (expanded.length === 0) return { 1: 0, 2: 0, 3: 0, 4: 0 };

  let hit1 = 0;
  let hit2 = 0;
  let hit3 = 0;
  let hit4 = 0;

  for (let i = 0; i < iterations; i++) {
    const cards = shuffle(expanded);
    let landsSeen = cards.slice(0, 7).filter(isLand).length;
    if (landsSeen >= 1) hit1++;
    if (landsSeen >= 2) hit2++;

    if (cards[7] && isLand(cards[7]!)) landsSeen++;
    if (landsSeen >= 3) hit3++;

    if (cards[8] && isLand(cards[8]!)) landsSeen++;
    if (landsSeen >= 4) hit4++;
  }
  return {
    1: hit1 / iterations,
    2: hit2 / iterations,
    3: hit3 / iterations,
    4: hit4 / iterations,
  };
}

