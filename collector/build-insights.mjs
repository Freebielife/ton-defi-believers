import path from "node:path";
import {
  nowIso,
  readJson,
  writeJsonAtomic
} from "./lib/utils.mjs";
import {
  calculateTrends,
  calculateYieldScore
} from "./metrics/score.mjs";

const root = process.cwd();
const opportunityPath = path.join(root, "data", "opportunities.json");
const historyPath = path.join(root, "data", "history.json");

const document = await readJson(opportunityPath);
let history = { snapshots: [] };
try {
  history = await readJson(historyPath);
} catch {
  // The first build can legitimately have no history yet.
}

const generatedAt = nowIso();
const now = new Date(generatedAt);

const enriched = document.opportunities.map((item) => {
  const yieldScore = calculateYieldScore(item);
  const trends = calculateTrends({
    opportunityId: item.id,
    currentApy: item.metrics?.yield?.apyEquivalent ?? item.apy?.current,
    currentTvlUsd: item.metrics?.tvlUsd ?? item.tvlUsd,
    snapshots: history.snapshots ?? [],
    now
  });

  return {
    ...item,
    metrics: {
      ...item.metrics,
      yieldScore,
      trends
    }
  };
});

const ranked = [...enriched]
  .filter((item) => item.status?.active !== false)
  .sort((a, b) =>
    b.metrics.yieldScore.score - a.metrics.yieldScore.score ||
    (b.metrics.tvlUsd ?? 0) - (a.metrics.tvlUsd ?? 0)
  );

const ranking = {
  schemaVersion: "1.0",
  generatedAt,
  methodology:
    "Yield Score combines diminishing-return yield attractiveness, confidence, TVL depth and inverse risk. It is informational, not investment advice.",
  opportunities: ranked.map((item, index) => ({
    rank: index + 1,
    id: item.id,
    protocol: item.protocol,
    product: item.product,
    score: item.metrics.yieldScore.score,
    grade: item.metrics.yieldScore.grade,
    apy: item.metrics.yield.apyEquivalent,
    tvlUsd: item.metrics.tvlUsd,
    confidence: item.metrics.confidence.score,
    risk: item.metrics.risk.level
  }))
};

const normalizedDocument = {
  ...document,
  schemaVersion: "1.2",
  insightsGeneratedAt: generatedAt,
  opportunities: enriched
};

const publishedDocument = {
  ...normalizedDocument,
  publishedAt: generatedAt,
  opportunities: enriched.filter((item) =>
    item.status?.active !== false &&
    item.status?.requiresDisambiguation !== true
  )
};

await writeJsonAtomic(
  path.join(root, "data", "rankings.json"),
  ranking
);
await writeJsonAtomic(
  path.join(root, "data", "normalized", "opportunities.json"),
  normalizedDocument
);
await writeJsonAtomic(
  path.join(root, "data", "published", "opportunities.json"),
  publishedDocument
);
await writeJsonAtomic(opportunityPath, normalizedDocument);

console.log(
  `Insights: ranked ${ranking.opportunities.length} opportunities.`
);
