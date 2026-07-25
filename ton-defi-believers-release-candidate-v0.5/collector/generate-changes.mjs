import path from "node:path";
import { nowIso, readJson, writeJsonAtomic } from "./lib/utils.mjs";

const root = process.cwd();
const current = await readJson(path.join(root, "data", "opportunities.json"));

let previous;
try {
  previous = await readJson(path.join(root, "data", "opportunities.previous.json"));
} catch {
  previous = { opportunities: [] };
}

const oldById = new Map(previous.opportunities.map((item) => [item.id, item]));
const changes = [];

function numericChange(before, after) {
  const a = Number(before);
  const b = Number(after);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
  return {
    before: a,
    after: b,
    absolute: b - a,
    percent: a === 0 ? null : ((b - a) / Math.abs(a)) * 100
  };
}

for (const item of current.opportunities) {
  const old = oldById.get(item.id);
  if (!old) {
    changes.push({
      id: item.id,
      protocol: item.protocol,
      product: item.product,
      type: "added"
    });
    continue;
  }

  const apy = numericChange(old.apy?.current, item.apy?.current);
  const tvl = numericChange(old.tvlUsd, item.tvlUsd);

  if (apy || tvl) {
    changes.push({
      id: item.id,
      protocol: item.protocol,
      product: item.product,
      type: "updated",
      apy,
      tvl
    });
  }
}

const significant = changes.filter((item) => {
  if (item.type === "added") return true;
  const apyMove = Math.abs(item.apy?.absolute ?? 0);
  const tvlMove = Math.abs(item.tvl?.percent ?? 0);
  return apyMove >= 0.25 || tvlMove >= 2;
});

await writeJsonAtomic(path.join(root, "data", "changes.json"), {
  schemaVersion: "1.0",
  generatedAt: nowIso(),
  thresholds: {
    apyAbsolutePoints: 0.25,
    tvlPercent: 2
  },
  changes: significant.slice(0, 100)
});

console.log(`Значимых изменений: ${significant.length}`);
