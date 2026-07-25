import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { __test } from "../adapters/dedust.mjs";

const root = process.cwd();
const payload = JSON.parse(
  await readFile(
    path.join(root, "collector/tests/fixtures/dedust-pools.json"),
    "utf8"
  )
);

const pools = __test.unwrap(payload);
assert.equal(pools.length, 2);

const stable = __test.candidate(pools[0]);
assert.equal(stable.address, "EQ_POOL_STABLE");
assert.deepEqual(stable.symbols.sort(), ["USDC", "USDT"]);
assert.deepEqual(stable.assetAddresses.sort(), ["EQ_USDC", "EQ_USDT"]);
assert.equal(stable.poolType, "stable");
assert.equal(stable.tvlUsd, 250000);
assert.equal(stable.yieldRate, 5.2);
assert.equal(stable.yieldMetric, "apy");

const volatile = __test.candidate(pools[1]);
assert.equal(volatile.poolType, "volatile");
assert.equal(volatile.yieldRate, 4.1);
assert.equal(volatile.yieldMetric, "apr");

assert.equal(
  __test.matches(
    {
      symbols: ["USDT", "USDC"],
      assetAddresses: ["EQ_USDT", "EQ_USDC"],
      poolType: "stable"
    },
    stable
  ),
  true
);

assert.equal(
  __test.matches(
    {
      symbols: ["USDT", "USDC"],
      assetAddresses: ["EQ_FAKE", "EQ_USDC"],
      poolType: "stable"
    },
    stable
  ),
  false
);

console.log("DeDust adapter fixture tests passed.");
