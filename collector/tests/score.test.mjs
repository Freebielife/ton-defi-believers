import assert from "node:assert/strict";
import {
  calculateTrends,
  calculateYieldScore
} from "../metrics/score.mjs";

const strong = {
  apy: { current: 12 },
  tvlUsd: 10_000_000,
  metrics: {
    yield: { apyEquivalent: 12 },
    tvlUsd: 10_000_000,
    confidence: { score: 90 },
    risk: { score: 10 }
  }
};

const weak = {
  apy: { current: 3 },
  tvlUsd: 20_000,
  metrics: {
    yield: { apyEquivalent: 3 },
    tvlUsd: 20_000,
    confidence: { score: 40 },
    risk: { score: 70 }
  }
};

assert.ok(
  calculateYieldScore(strong).score >
  calculateYieldScore(weak).score
);
assert.ok(calculateYieldScore(strong).score <= 100);
assert.ok(calculateYieldScore(weak).score >= 0);

const trends = calculateTrends({
  opportunityId: "pool",
  currentApy: 12,
  currentTvlUsd: 1100,
  now: new Date("2026-07-25T12:00:00.000Z"),
  snapshots: [
    {
      date: "2026-07-24",
      capturedAt: "2026-07-24T12:00:00.000Z",
      opportunities: [{ id: "pool", apy: 10, tvlUsd: 1000 }]
    },
    {
      date: "2026-07-18",
      capturedAt: "2026-07-18T12:00:00.000Z",
      opportunities: [{ id: "pool", apy: 8, tvlUsd: 800 }]
    }
  ]
});

assert.equal(trends["1d"].apyChangePoints, 2);
assert.equal(Math.round(trends["1d"].tvlChangePercent), 10);
assert.equal(trends["7d"].apyChangePoints, 4);

console.log("Yield Score and trend tests passed.");
