import assert from "node:assert/strict";
import {
  apyFromApr,
  aprFromFeeRevenue,
  calculateTvlUsd,
  confidenceScore,
  riskAssessment,
  enrichOpportunity
} from "../metrics/engine.mjs";

const approximate = (actual, expected, tolerance = 0.0001) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be close to ${expected}`
  );
};

approximate(apyFromApr(10, 365), 10.515578161626164);

approximate(
  aprFromFeeRevenue({
    volumeUsd: 1_000_000,
    feePercent: 0.3,
    providerSharePercent: 100,
    tvlUsd: 5_000_000,
    periodDays: 1
  }),
  21.9
);

assert.equal(
  calculateTvlUsd([
    { amount: 100, priceUsd: 2 },
    { amount: 50, priceUsd: 1 }
  ]),
  250
);

assert.equal(
  calculateTvlUsd([{ amount: 100, priceUsd: null }]),
  null
);

const now = new Date("2026-07-25T12:00:00.000Z");
const automatic = {
  id: "test",
  type: "liquidity-pool",
  tvlUsd: 2_000_000,
  apy: { current: 12, metric: "apr" },
  externalId: "EQ_POOL",
  source: {
    type: "api",
    lastChecked: "2026-07-25T10:00:00.000Z"
  },
  status: {
    active: true,
    stale: false,
    sourceError: false,
    requiresDisambiguation: false
  }
};

const confidence = confidenceScore(automatic, now);
assert.equal(confidence.grade, "A");
assert.ok(confidence.score >= 85);

const risk = riskAssessment(automatic);
assert.equal(risk.level, "medium");
assert.ok(risk.flags.includes("impermanent-loss-or-lp-risk"));

const enriched = enrichOpportunity(automatic, now);
assert.equal(enriched.metrics.yield.metric, "apr");
assert.ok(enriched.metrics.yield.apyEquivalent > 12);
assert.equal(enriched.metrics.confidence.grade, "A");

const unresolved = {
  ...automatic,
  status: {
    ...automatic.status,
    stale: true,
    requiresDisambiguation: true
  }
};

assert.ok(
  confidenceScore(unresolved, now).score <
  confidenceScore(automatic, now).score
);

console.log("Metrics Engine tests passed.");
