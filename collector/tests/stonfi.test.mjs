import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { __test } from "../adapters/stonfi.mjs";

const root = process.cwd();
const assetsPayload = JSON.parse(
  await readFile(path.join(root, "collector/tests/fixtures/ston-assets.json"), "utf8")
);
const poolsPayload = JSON.parse(
  await readFile(path.join(root, "collector/tests/fixtures/ston-pools.json"), "utf8")
);

const assets = __test.unwrap(assetsPayload, ["assets", "asset_list"]);
const pools = __test.unwrap(poolsPayload, ["pools", "pool_list"]);
const assetMap = __test.buildAssetMap(assets);
const farmMap = new Map();

const candidate = __test.makeCandidate(pools[0], assetMap, farmMap, "v2");
assert.equal(candidate.address, "EQ_POOL_1");
assert.deepEqual(candidate.symbols.sort(), ["GRAM", "TSTON"]);
assert.equal(candidate.tvlUsd, 125000);
assert.equal(candidate.yieldRate, 4.2);
assert.equal(candidate.yieldMetric, "apy");
assert.equal(candidate.yieldPeriod, "7d");
assert.equal(candidate.yieldPeriods.apy7d, 4.2);

const exactPoolShape = __test.makeCandidate({
  address: "EQ_EXACT",
  token0_address: "EQ_USDE",
  token1_address: "EQ_TSUSDE",
  lp_total_supply_usd: "456789.12",
  apy_1d: "0.08",
  apy_7d: "0.05",
  apy_30d: "0.03",
  underlying_apr: "0.02",
  reserve0: "1000000",
  reserve1: "2000000",
  volume_24h_usd: "12345"
}, new Map(), new Map(), "v2");
assert.equal(exactPoolShape.tvlUsd, 456789.12);
assert.equal(exactPoolShape.yieldRate, 5);
assert.equal(exactPoolShape.yieldPeriod, "7d");
assert.equal(exactPoolShape.yieldPeriods.apy1d, 8);
assert.equal(exactPoolShape.yieldPeriods.apy30d, 3);
assert.equal(exactPoolShape.yieldPeriods.underlyingApr, 2);
assert.equal(exactPoolShape.volume24hUsd, 12345);
assert.deepEqual(exactPoolShape.rawReserves, ["1000000", "2000000"]);

const aliases = { TSTON: ["tsTON"] };
assert.equal(
  __test.matches({ symbols: ["GRAM", "tsTON"] }, candidate, aliases),
  true
);

const ranked = pools.map((pool) =>
  __test.makeCandidate(pool, assetMap, farmMap, "v2")
);
assert.equal(
  __test.selectCandidate({ rankByTvl: 1 }, ranked, true).address,
  "EQ_POOL_2"
);

console.log("STON.fi adapter fixture tests passed.");


const addressLockedEntry = {
  symbols: ["USDT", "GRAM"],
  assetAddresses: ["EQ_USDT", "EQ_GRAM"]
};
const validAddressCandidate = {
  symbols: ["USD", "GRAM"],
  assetAddresses: ["EQ_USDT", "EQ_GRAM"],
  poolType: null,
  dexVersion: "v2"
};
const counterfeitCandidate = {
  symbols: ["USDT", "GRAM"],
  assetAddresses: ["EQ_FAKE_USDT", "EQ_GRAM"],
  poolType: null,
  dexVersion: "v2"
};
assert.equal(__test.matches(addressLockedEntry, validAddressCandidate, {}), true);
assert.equal(__test.matches(addressLockedEntry, counterfeitCandidate, {}), false);
console.log("STON.fi exact asset-address tests passed.");
