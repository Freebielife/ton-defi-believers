import { finiteNumber } from "../lib/utils.mjs";
import { clamp } from "./engine.mjs";

function logTvlScore(tvlUsd) {
  const tvl = finiteNumber(tvlUsd);
  if (tvl === null || tvl <= 0) return 0;

  // $10k => 0, $10m => 15, $1b+ => 20.
  return clamp(((Math.log10(tvl) - 4) / 5) * 20, 0, 20);
}

function yieldAttractiveness(apy) {
  const value = finiteNumber(apy);
  if (value === null || value <= 0) return 0;

  // Diminishing returns prevent extreme APY from dominating the ranking.
  return clamp(35 * (1 - Math.exp(-value / 12)), 0, 35);
}

export function calculateYieldScore(opportunity) {
  const apy =
    finiteNumber(opportunity?.metrics?.yield?.apyEquivalent) ??
    finiteNumber(opportunity?.apy?.current);

  const confidence =
    finiteNumber(opportunity?.metrics?.confidence?.score) ?? 0;

  const risk =
    finiteNumber(opportunity?.metrics?.risk?.score) ?? 100;

  const components = {
    yield: yieldAttractiveness(apy),
    confidence: clamp(confidence, 0, 100) * 0.30,
    tvl: logTvlScore(
      opportunity?.metrics?.tvlUsd ?? opportunity?.tvlUsd
    ),
    risk: (100 - clamp(risk, 0, 100)) * 0.15
  };

  const score = Math.round(
    components.yield +
    components.confidence +
    components.tvl +
    components.risk
  );

  return {
    score: clamp(score),
    grade:
      score >= 85 ? "A+" :
      score >= 75 ? "A" :
      score >= 65 ? "B" :
      score >= 50 ? "C" :
      score >= 35 ? "D" : "E",
    components: Object.fromEntries(
      Object.entries(components).map(([key, value]) => [
        key,
        Math.round(value * 100) / 100
      ])
    )
  };
}

function percentChange(current, previous) {
  const a = finiteNumber(current);
  const b = finiteNumber(previous);
  if (a === null || b === null || b === 0) return null;
  return ((a - b) / Math.abs(b)) * 100;
}

function absoluteChange(current, previous) {
  const a = finiteNumber(current);
  const b = finiteNumber(previous);
  if (a === null || b === null) return null;
  return a - b;
}

function nearestSnapshot(snapshots, targetTimestamp) {
  if (!snapshots.length) return null;

  return snapshots.reduce((best, snapshot) => {
    const timestamp = Date.parse(
      snapshot.capturedAt ?? `${snapshot.date}T00:00:00.000Z`
    );
    if (!Number.isFinite(timestamp)) return best;

    const distance = Math.abs(timestamp - targetTimestamp);
    if (!best || distance < best.distance) {
      return { snapshot, distance, timestamp };
    }
    return best;
  }, null)?.snapshot ?? null;
}

export function calculateTrends({
  opportunityId,
  currentApy,
  currentTvlUsd,
  snapshots = [],
  now = new Date()
}) {
  const windows = {};
  const validSnapshots = snapshots
    .filter((snapshot) =>
      Array.isArray(snapshot?.opportunities)
    )
    .sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );

  for (const days of [1, 7, 30]) {
    const target =
      now.getTime() - days * 24 * 60 * 60 * 1000;
    const snapshot = nearestSnapshot(validSnapshots, target);
    const previous = snapshot?.opportunities?.find(
      (item) => item.id === opportunityId
    );

    windows[`${days}d`] = {
      available: Boolean(previous),
      referenceDate: snapshot?.date ?? null,
      apyChangePoints: previous
        ? absoluteChange(currentApy, previous.apy)
        : null,
      tvlChangePercent: previous
        ? percentChange(currentTvlUsd, previous.tvlUsd)
        : null
    };
  }

  return windows;
}
