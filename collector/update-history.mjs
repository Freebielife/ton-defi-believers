import path from "node:path";
import { nowIso, readJson, writeJsonAtomic } from "./lib/utils.mjs";

const root = process.cwd();
const opportunities = await readJson(path.join(root, "data", "opportunities.json"));
const historyPath = path.join(root, "data", "history.json");

let history;
try {
  history = await readJson(historyPath);
} catch {
  history = { schemaVersion: "1.0", snapshots: [] };
}

const now = new Date();
const date = now.toISOString().slice(0, 10);
const snapshot = {
  date,
  capturedAt: nowIso(),
  opportunities: opportunities.opportunities.map((item) => ({
    id: item.id,
    apy: Number.isFinite(Number(item.apy?.current)) ? Number(item.apy.current) : null,
    tvlUsd: Number.isFinite(Number(item.tvlUsd)) ? Number(item.tvlUsd) : null
  }))
};

history.snapshots = history.snapshots.filter((item) => item.date !== date);
history.snapshots.push(snapshot);
history.snapshots.sort((a, b) => a.date.localeCompare(b.date));

// Keep one compact daily snapshot for the latest 180 days.
history.snapshots = history.snapshots.slice(-180);
history.updatedAt = nowIso();

await writeJsonAtomic(historyPath, history);
console.log(`История: ${history.snapshots.length} дневных снимков.`);
