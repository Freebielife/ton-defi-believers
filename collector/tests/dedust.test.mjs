import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { __test } from "../adapters/dedust.mjs";

const root = process.cwd();
const payload = JSON.parse(
  await readFile(path.join(root, "collector/tests/fixtures/dedust-pools.json"), "utf8")
);

const pools = __test.unwrap(payload);
assert.equal(pools.length, 3);

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

const tonUsdt = __test.candidate(pools[2], { symbols: ["TON", "USDT"] });
assert.deepEqual(tonUsdt.symbols.sort(), ["TON", "USDT"]);
assert.deepEqual(tonUsdt.assetAddresses, ["EQ_USDT"]);
assert.deepEqual(tonUsdt.reserves, ["100000000000", "500000000"]);
assert.equal(tonUsdt.tradeFeeRaw, "0.25");

const entry = {
  poolAddress: "EQ_TON_USDT",
  symbols: ["TON", "USDT"],
  assetAddresses: ["EQ_USDT"],
  poolType: "volatile",
  assetDecimals: [9, 6],
  stableAssetIndex: 1,
  stableAssetSymbol: "USDT",
  stableAssetAddress: "EQ_USDT"
};
assert.equal(__test.matches(entry, tonUsdt), true);
const tvl = __test.estimateTvlUsd(tonUsdt, entry);
assert.equal(tvl.value, 1000);
assert.equal(tvl.approximate, false);
assert.equal(__test.parseTradeFeeRate("0.25"), 0.0025);

const trade = {
  asset_in: { asset_type: "native" },
  asset_out: { asset_type: "jetton", address: "EQ_USDT" },
  amount_in: "1000000000",
  amount_out: "5000000"
};
assert.equal(__test.tradeStableAmountUsd(trade, entry), 5);

const feeApr = __test.calculateFeeApr({
  volume7dUsd: 10000,
  tvlUsd: 100000,
  tradeFeeRate: 0.0025,
  lpShare: 0.8,
  complete: true
});
assert.ok(feeApr);
assert.equal(Number(feeApr.apr.toFixed(6)), Number((((10000 * 0.0025 * 0.8) / 100000) * (365 / 7) * 100).toFixed(6)));

assert.equal(
  __test.matches(
    { symbols: ["USDT", "USDC"], assetAddresses: ["EQ_USDT", "EQ_USDC"], poolType: "stable" },
    stable
  ),
  true
);
assert.equal(
  __test.matches(
    { symbols: ["USDT", "USDC"], assetAddresses: ["EQ_FAKE", "EQ_USDC"], poolType: "stable" },
    stable
  ),
  false
);

const realFetch = globalThis.fetch;
const now = Date.now();
const pages = [
  [
    { lt: "300", created_at: new Date(now - 1 * 86400000).toISOString() },
    { lt: "200", created_at: new Date(now - 2 * 86400000).toISOString() }
  ],
  [
    { lt: "100", created_at: new Date(now - 8 * 86400000).toISOString() }
  ]
];
const requestedUrls = [];
globalThis.fetch = async (url) => {
  requestedUrls.push(String(url));
  const page = pages.shift() ?? [];
  return { ok: true, json: async () => page };
};
try {
  const window = await __test.fetchTradesWindow({
    baseUrl: "https://api.dedust.io",
    poolAddress: "EQ_TON_USDT",
    timeoutMs: 1000,
    days: 7,
    pageSize: 2,
    maxPages: 3
  });
  assert.equal(window.complete, true);
  assert.equal(window.trades.length, 2);
  assert.match(requestedUrls[1], /after_lt=200/);
} finally {
  globalThis.fetch = realFetch;
}

assert.equal(__test.calculateFeeApr({
  volume7dUsd: 10000,
  tvlUsd: 100000,
  tradeFeeRate: 0.0025,
  lpShare: 0.8,
  complete: false
}), null);

console.log("DeDust adapter fixture tests passed.");
