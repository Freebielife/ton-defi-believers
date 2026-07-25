import path from "node:path";
import {
  nowIso,
  readJson,
  writeJsonAtomic
} from "./lib/utils.mjs";
import { enrichOpportunity } from "./metrics/engine.mjs";

const root = process.cwd();
const sourcePath = path.join(root, "data", "opportunities.json");
const document = await readJson(sourcePath);
const generatedAt = nowIso();
const now = new Date(generatedAt);

const enriched = document.opportunities.map((item) =>
  enrichOpportunity(item, now)
);

const confidence = enriched.map((item) => item.metrics.confidence.score);
const riskLevels = enriched.reduce((accumulator, item) => {
  const level = item.metrics.risk.level;
  accumulator[level] = (accumulator[level] ?? 0) + 1;
  return accumulator;
}, {});

const metricsDocument = {
  schemaVersion: "1.0",
  generatedAt,
  methodology: {
    confidence:
      "Score from source automation, freshness, metric availability, contract identification and error flags.",
    risk:
      "Heuristic information-quality and product-structure indicator; not investment advice.",
    apyEquivalent:
      "APR is converted with daily compounding only for consistent comparison."
  },
  summary: {
    opportunities: enriched.length,
    averageConfidence:
      confidence.length
        ? Math.round(
            confidence.reduce((sum, value) => sum + value, 0) /
            confidence.length
          )
        : null,
    riskLevels,
    automaticSources: enriched.filter((item) =>
      ["api", "calculated"].includes(item.source?.type)
    ).length,
    manualSources: enriched.filter((item) =>
      item.source?.type === "manual"
    ).length
  },
  opportunities: enriched.map((item) => ({
    id: item.id,
    protocol: item.protocol,
    metrics: item.metrics
  }))
};

const normalizedDocument = {
  ...document,
  schemaVersion: "1.1",
  normalizedAt: generatedAt,
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
  path.join(root, "data", "metrics.json"),
  metricsDocument
);

await writeJsonAtomic(
  path.join(root, "data", "normalized", "opportunities.json"),
  normalizedDocument
);

await writeJsonAtomic(
  path.join(root, "data", "published", "opportunities.json"),
  publishedDocument
);

// Compatibility: the website continues to read data/opportunities.json.
await writeJsonAtomic(sourcePath, normalizedDocument);

console.log(
  `Metrics Engine: ${enriched.length} opportunities, ` +
  `average confidence ${metricsDocument.summary.averageConfidence}.`
);
