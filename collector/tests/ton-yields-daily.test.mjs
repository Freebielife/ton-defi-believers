import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { parseTonYieldsDailyHtml } from "../import-ton-yields-daily.mjs";

const html = await fs.readFile(new URL("./fixtures/ton-yields-daily-post.html", import.meta.url), "utf8");
const document = parseTonYieldsDailyHtml(html);

assert.equal(document.snapshot.post, 229);
assert.equal(document.snapshot.marketTvlUsd, 69_000_000);
assert.equal(document.snapshot.declaredOpportunityCount, 30);
assert.equal(document.opportunities.length, 30);
assert.equal(document.protocols.length, 14);

const euler = document.opportunities.find((item) => item.protocol === "Euler");
assert.equal(euler.apy.current, 44.9);
assert.equal(euler.tvlUsd, 2_600);
assert.equal(euler.status.lowTvl, true);

const gtc = document.opportunities.find((item) => item.protocol === "GTC" && item.asset === "USDT");
assert.equal(gtc.utilizationRate, 92.8);
assert.equal(gtc.apy.average7d, 18.4);

const btc = document.opportunities.find((item) => item.asset === "cbBTC");
assert.equal(btc.apy.current, 3.6);
assert.equal(btc.apy.base, 0);
assert.equal(btc.apy.rewards, 3.6);

console.log("TON Yields Daily parser: PASSED");
