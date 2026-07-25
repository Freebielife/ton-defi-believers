import path from "node:path";
import {
  nowIso,
  readJson,
  writeJsonAtomic
} from "./lib/utils.mjs";

const root = process.cwd();
const published = await readJson(
  path.join(root, "data", "published", "opportunities.json")
);

const normalize = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const unique = (items) => [...new Set(items.filter(Boolean))];

const records = published.opportunities.map((item) => {
  const terms = unique([
    item.id,
    item.protocol,
    item.product,
    item.asset,
    item.category,
    item.type,
    item.metrics?.risk?.level,
    item.metrics?.confidence?.grade,
    ...(item.metrics?.risk?.flags ?? [])
  ].map(normalize));

  return {
    id: item.id,
    protocol: item.protocol,
    product: item.product,
    asset: item.asset,
    category: item.category,
    type: item.type,
    apy: item.metrics?.yield?.apyEquivalent ?? null,
    tvlUsd: item.metrics?.tvlUsd ?? null,
    yieldScore: item.metrics?.yieldScore?.score ?? null,
    confidence: item.metrics?.confidence?.score ?? null,
    risk: item.metrics?.risk?.level ?? null,
    links: item.links,
    searchText: terms.join(" "),
    terms
  };
});

const facets = {
  protocols: unique(records.map((item) => item.protocol)).sort(),
  assets: unique(records.map((item) => item.asset)).sort(),
  categories: unique(records.map((item) => item.category)).sort(),
  types: unique(records.map((item) => item.type)).sort(),
  risks: unique(records.map((item) => item.risk)).sort()
};

await writeJsonAtomic(
  path.join(root, "data", "search-index.json"),
  {
    schemaVersion: "1.0",
    generatedAt: nowIso(),
    count: records.length,
    facets,
    records
  }
);

console.log(`Search index: ${records.length} records.`);
