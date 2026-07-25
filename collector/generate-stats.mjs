import path from "node:path";
import { nowIso, readJson, writeJsonAtomic } from "./lib/utils.mjs";

const root = process.cwd();
const opportunitiesDocument = await readJson(path.join(root, "data", "opportunities.json"));
const protocolsDocument = await readJson(path.join(root, "data", "protocols.json"));

const coreNames = new Set(
  protocolsDocument.protocols
    .filter((protocol) => protocol.tier === "core" && protocol.active)
    .map((protocol) => protocol.name)
);

const active = opportunitiesDocument.opportunities.filter(
  (item) => item.status?.active !== false
);
const core = active.filter((item) => coreNames.has(item.protocol));

const tvlValues = core
  .map((item) => Number(item.tvlUsd))
  .filter((value) => Number.isFinite(value) && value >= 0);

const apyValues = core
  .map((item) => Number(item.apy?.current))
  .filter((value) => Number.isFinite(value));

const byTvl = [...core]
  .filter((item) => Number.isFinite(Number(item.tvlUsd)))
  .sort((a, b) => Number(b.tvlUsd) - Number(a.tvlUsd));

const byApy = [...core]
  .filter((item) => Number.isFinite(Number(item.apy?.current)))
  .sort((a, b) => Number(b.apy.current) - Number(a.apy.current));

const stats = {
  schemaVersion: "1.0",
  generatedAt: nowIso(),
  scope: "core",
  metrics: {
    protocolsTracked: new Set(core.map((item) => item.protocol)).size,
    opportunitiesTracked: core.length,
    coveredTvlUsd: tvlValues.reduce((sum, value) => sum + value, 0),
    averageApy: apyValues.length
      ? apyValues.reduce((sum, value) => sum + value, 0) / apyValues.length
      : null
  },
  leaders: {
    largestOpportunity: byTvl[0]
      ? {
          id: byTvl[0].id,
          protocol: byTvl[0].protocol,
          product: byTvl[0].product,
          tvlUsd: Number(byTvl[0].tvlUsd)
        }
      : null,
    highestDisplayedApy: byApy[0]
      ? {
          id: byApy[0].id,
          protocol: byApy[0].protocol,
          product: byApy[0].product,
          apy: Number(byApy[0].apy.current)
        }
      : null
  },
  disclosure: {
    en: "TVL and yield figures are informational and do not guarantee safety or future returns.",
    ru: "TVL и доходность приведены в информационных целях и не гарантируют безопасность или будущий результат."
  }
};

await writeJsonAtomic(path.join(root, "data", "stats.json"), stats);
console.log(JSON.stringify(stats, null, 2));
