import assert from "node:assert/strict";
import { buildHealthDocument } from "../lib/health-monitor.mjs";

const health = buildHealthDocument({
  startedAt: "2026-07-26T10:00:00.000Z",
  finishedAt: "2026-07-26T10:00:02.000Z",
  publishedFreshData: true,
  previousSnapshotUpdatedAt: "2026-07-26T09:00:00.000Z",
  reports: [
    {
      adapter: "stonfi",
      status: "ok",
      durationMs: 800,
      updated: 12,
      uniquePoolsReceived: 100
    },
    {
      adapter: "dedust",
      status: "partial",
      durationMs: 1200,
      updated: 4,
      unresolved: 2
    },
    {
      adapter: "evaa",
      protocol: "EVAA",
      status: "integration-ready",
      durationMs: 0,
      retainedExistingRecords: 3
    }
  ]
});

assert.equal(health.status, "degraded");
assert.equal(health.buildQuality, 73);
assert.equal(health.run.durationMs, 2000);
assert.equal(health.summary.averageDurationMs, 667);
assert.equal(health.summary.healthy, 1);
assert.equal(health.summary.partial, 1);
assert.equal(health.summary.degraded, 1);
assert.equal(health.protocols[0].items, 12);
assert.equal(health.protocols[1].unresolved, 2);

const down = buildHealthDocument({
  startedAt: "2026-07-26T10:00:00.000Z",
  finishedAt: "2026-07-26T10:00:01.000Z",
  publishedFreshData: false,
  reports: [
    { adapter: "stonfi", status: "error", durationMs: 500 },
    { adapter: "dedust", status: "error", durationMs: 500 }
  ]
});

assert.equal(down.status, "down");
assert.equal(down.buildQuality, 0);
assert.equal(down.run.publishedFreshData, false);
assert.equal(down.summary.errors, 2);

console.log("Health Monitor tests passed.");
