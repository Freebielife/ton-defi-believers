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
