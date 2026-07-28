import path from "node:path";
import {
  asArray,
  firstFinite,
  nowIso,
  readJson,
  writeJsonAtomic
} from "../lib/utils.mjs";
import { writeProtocolSnapshot } from "../lib/protocol-output.mjs";
import { runGetMethod, stackIntAt, verifyPoolReserves } from "../lib/ton-rpc.mjs";

const TON_NATIVE = "native";

function normalizeSymbol(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeAddress(value) {
  return String(value ?? "").trim();
}

function unwrap(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["pools", "pool_list", "items", "data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  }
  return asArray(payload);
}

function unwrapTrades(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["trades", "items", "data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  }
  return [];
}

function poolAddress(pool) {
  return normalizeAddress(
    pool?.address ?? pool?.pool_address ?? pool?.poolAddress ??
    pool?.contract_address ?? pool?.contractAddress ?? pool?.id
  );
}

function assetType(asset) {
  return String(asset?.type ?? asset?.asset_type ?? asset?.assetType ?? "").toLowerCase();
}

function assetAddress(asset) {
  if (typeof asset === "string") return normalizeAddress(asset);
  return normalizeAddress(
    asset?.address ?? asset?.contract_address ?? asset?.contractAddress ??
    asset?.jetton_address ?? asset?.jettonAddress ?? asset?.metadata?.address
  );
}

function assetSymbol(asset) {
  if (typeof asset === "string") return "";
  if (["native", "ton"].includes(assetType(asset))) return "TON";
  return normalizeSymbol(
    asset?.symbol ?? asset?.ticker ?? asset?.metadata?.symbol ??
    asset?.meta?.symbol ?? asset?.name
  );
}

function poolAssets(pool) {
  const assets = [];
  if (Array.isArray(pool?.assets)) assets.push(...pool.assets);
  if (Array.isArray(pool?.tokens)) assets.push(...pool.tokens);
  for (const value of [pool?.asset0, pool?.asset1, pool?.token0, pool?.token1, pool?.left, pool?.right]) {
    if (value) assets.push(value);
  }
  return assets;
}

function poolAssetAddresses(pool) {
  const direct = [
    pool?.asset0_address, pool?.asset1_address, pool?.asset_0_address, pool?.asset_1_address,
    pool?.token0_address, pool?.token1_address, pool?.token_0_address, pool?.token_1_address
  ];
  for (const asset of poolAssets(pool)) {
    const address = assetAddress(asset);
    if (address) direct.push(address);
  }
  return [...new Set(direct.map(normalizeAddress).filter(Boolean))];
}

function poolSymbols(pool, fallback = []) {
  const symbols = [pool?.asset0_symbol, pool?.asset1_symbol, pool?.token0_symbol, pool?.token1_symbol];
  for (const asset of poolAssets(pool)) symbols.push(assetSymbol(asset));
  symbols.push(...fallback);
  return [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
}

function poolType(pool) {
  const raw = String(
    pool?.pool_type ?? pool?.poolType ?? pool?.type ??
    pool?.curve_type ?? pool?.curveType ?? ""
  ).toLowerCase();
  if (raw.includes("stable")) return "stable";
  if (raw.includes("volatile") || raw.includes("cpmm")) return "volatile";
  return raw || null;
}

function normalizePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number > 0 && number < 1) return number * 100;
  return number;
}

function extractYield(pool) {
  const apy = [pool?.apy_7d, pool?.apy, pool?.apy_1d, pool?.stats?.apy, pool?.yield?.apy]
    .map(normalizePercent).find((value) => value !== null);
  if (apy !== undefined) return { value: apy, metric: "apy" };
  const apr = [pool?.apr_7d, pool?.apr, pool?.apr_1d, pool?.fee_apr, pool?.feeApr, pool?.total_apr, pool?.stats?.apr, pool?.yield?.apr]
    .map(normalizePercent).find((value) => value !== null);
  return apr === undefined ? { value: null, metric: null } : { value: apr, metric: "apr" };
}

function rawReserves(pool) {
  if (Array.isArray(pool?.reserves)) return pool.reserves.slice(0, 2);
  return [pool?.reserve0 ?? pool?.reserve_0, pool?.reserve1 ?? pool?.reserve_1];
}

function candidate(pool, fallback = {}) {
  const yieldData = extractYield(pool);
  const reserves = rawReserves(pool);
  return {
    address: poolAddress(pool),
    symbols: poolSymbols(pool, fallback.symbols ?? []),
    assetAddresses: poolAssetAddresses(pool).length ? poolAssetAddresses(pool) : (fallback.assetAddresses ?? []),
    assets: poolAssets(pool),
    poolType: poolType(pool),
    tvlUsd: firstFinite(pool?.tvl, pool?.tvl_usd, pool?.tvlUsd, pool?.reserves_usd, pool?.reservesUsd, pool?.liquidity_usd, pool?.stats?.tvl),
    yieldRate: yieldData.value,
    yieldMetric: yieldData.metric,
    volume24hUsd: firstFinite(pool?.volume_24h, pool?.volume24h, pool?.volume_usd_24h, pool?.volume24hUsd, pool?.stats?.volume_24h),
    tradeFeeRaw: pool?.trade_fee ?? pool?.tradeFee ?? pool?.fee,
    statsFees: pool?.stats?.fees ?? [],
    statsVolume: pool?.stats?.volume ?? [],
    reserves,
    lastPrice: firstFinite(pool?.last_price, pool?.lastPrice),
    totalSupply: pool?.total_supply ?? pool?.totalSupply ?? null,
    lt: pool?.lt ?? null
  };
}

function matches(entry, pool) {
  if (entry.poolAddress && normalizeAddress(entry.poolAddress) !== pool.address) return false;
  const expectedAddresses = (entry.assetAddresses ?? []).map(normalizeAddress).filter(Boolean);
  if (expectedAddresses.length) {
    const actual = new Set(pool.assetAddresses);
    if (!expectedAddresses.every((address) => actual.has(address))) return false;
  }
  const expectedSymbols = (entry.symbols ?? []).map(normalizeSymbol).filter(Boolean);
  if (expectedSymbols.length && !expectedAddresses.length) {
    const actual = new Set(pool.symbols);
    if (!expectedSymbols.every((symbol) => actual.has(symbol))) return false;
  }
  if (entry.poolType && pool.poolType !== entry.poolType) return false;
  return Boolean(entry.poolAddress || expectedAddresses.length || expectedSymbols.length);
}

function decimalAmount(raw, decimals) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return value / (10 ** decimals);
}

function estimateTvlUsd(pool, entry) {
  if (Number.isFinite(pool.tvlUsd) && pool.tvlUsd > 0) {
    return { value: pool.tvlUsd, method: "official-api-tvl", approximate: false };
  }

  const reserves = pool.reserves.map((value, index) => decimalAmount(value, entry.assetDecimals?.[index] ?? 9));
  if (reserves.some((value) => value === null || value < 0)) return { value: null, method: null, approximate: false };
  const stableIndex = entry.stableAssetIndex;
  if (![0, 1].includes(stableIndex)) return { value: null, method: null, approximate: false };
  const otherIndex = stableIndex === 0 ? 1 : 0;
  const stableValue = reserves[stableIndex];
  const otherValue = reserves[otherIndex];

  if (Number.isFinite(pool.lastPrice) && pool.lastPrice > 0) {
    const otherUsdPrice = stableIndex === 1 ? pool.lastPrice : 1 / pool.lastPrice;
    return {
      value: stableValue + (otherValue * otherUsdPrice),
      method: "reserves-and-pool-last-price",
      approximate: false,
      assetUsdPrice: otherUsdPrice
    };
  }

  return {
    value: stableValue * 2,
    method: "balanced-pool-stable-side",
    approximate: true,
    assetUsdPrice: otherValue > 0 ? stableValue / otherValue : null
  };
}

function parseTradeFeeRate(raw, fallback = null) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  if (value <= 0.02) return value;
  if (value <= 10) return value / 100;
  return value / 10000;
}

async function fetchJson(url, timeoutMs, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "TON-DeFi-Believers-Collector/1.2" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`DeDust API returned HTTP ${response.status}: ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function tradeDate(trade) {
  const value = trade?.created_at ?? trade?.createdAt ?? trade?.timestamp;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function tradeAssetIsStable(asset, entry) {
  const address = assetAddress(asset);
  if (entry.stableAssetAddress && address === entry.stableAssetAddress) return true;
  return normalizeSymbol(assetSymbol(asset)) === normalizeSymbol(entry.stableAssetSymbol ?? "USDT");
}

function tradeStableAmountUsd(trade, entry) {
  const decimals = entry.assetDecimals?.[entry.stableAssetIndex] ?? 6;
  if (tradeAssetIsStable(trade?.asset_in ?? trade?.assetIn, entry)) {
    return decimalAmount(trade?.amount_in ?? trade?.amountIn, decimals);
  }
  if (tradeAssetIsStable(trade?.asset_out ?? trade?.assetOut, entry)) {
    return decimalAmount(trade?.amount_out ?? trade?.amountOut, decimals);
  }
  return null;
}

async function fetchTradesWindow({ baseUrl, poolAddress, timeoutMs, days = 7, pageSize = 1000, maxPages = 25 }) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const trades = [];
  let afterLt = null;
  let complete = false;

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`${baseUrl.replace(/\/$/, "")}/v2/pools/${poolAddress}/trades`);
    url.searchParams.set("page_size", String(pageSize));
    if (afterLt) url.searchParams.set("after_lt", afterLt);
    const payload = await fetchJson(url.toString(), timeoutMs);
    const pageTrades = unwrapTrades(payload);
    if (!pageTrades.length) { complete = true; break; }

    let reachedCutoff = false;
    for (const trade of pageTrades) {
      const date = tradeDate(trade);
      if (date && date < cutoff) { reachedCutoff = true; continue; }
      trades.push(trade);
    }

    if (reachedCutoff || pageTrades.length < pageSize) { complete = true; break; }
    const lastLt = pageTrades.at(-1)?.lt;
    if (!lastLt || lastLt === afterLt) break;
    afterLt = lastLt;
  }

  return {
    trades,
    complete,
    cutoff: cutoff.toISOString(),
    newestAt: trades.map(tradeDate).filter(Boolean).sort((a, b) => b - a)[0]?.toISOString() ?? null,
    oldestAt: trades.map(tradeDate).filter(Boolean).sort((a, b) => a - b)[0]?.toISOString() ?? null
  };
}

async function dedustOnchain(pool, entry, config) {
  if (config.onchain?.enabled === false) return { status: "disabled" };
  try {
    const reserveCheck = await verifyPoolReserves({
      address: pool.address,
      method: "get_reserves",
      reserveIndexes: [0, 1],
      apiReserves: pool.reserves,
      timeoutMs: config.onchain?.timeoutMs ?? 20000,
      tolerancePercent: config.onchain?.tolerancePercent ?? 2
    });

    let feeRate = null;
    try {
      const feeResponse = await runGetMethod({
        address: pool.address,
        method: "get_trade_fee",
        timeoutMs: config.onchain?.timeoutMs ?? 20000
      });
      const numerator = stackIntAt(feeResponse, 0);
      const denominator = stackIntAt(feeResponse, 1);
      if (numerator !== null && denominator !== null && denominator > 0n) {
        feeRate = Number(numerator) / Number(denominator);
      }
    } catch {
      // Reserve verification remains useful even if this optional getter is unavailable.
    }

    return {
      status: reserveCheck.passed ? "verified" : "mismatch",
      reserveCheck,
      tradeFeeRate: feeRate
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : String(error) };
  }
}

function calculateFeeApr({ volume7dUsd, tvlUsd, tradeFeeRate, lpShare = 0.8, complete }) {
  if (!complete || !Number.isFinite(volume7dUsd) || volume7dUsd < 0 || !Number.isFinite(tvlUsd) || tvlUsd <= 0 || !Number.isFinite(tradeFeeRate) || tradeFeeRate <= 0) {
    return null;
  }
  const lpFees7dUsd = volume7dUsd * tradeFeeRate * lpShare;
  return {
    apr: (lpFees7dUsd / tvlUsd) * (365 / 7) * 100,
    lpFees7dUsd
  };
}

export async function collectDedust({ configPath, opportunities }) {
  const config = await readJson(configPath);
  if (!config.enabled) return { opportunities, report: { adapter: "dedust", status: "disabled" } };

  const checkedAt = nowIso();
  const payload = await fetchJson(config.endpoint, config.timeoutMs ?? 20000);
  const rawPools = unwrap(payload);
  const trackedPools = (config.trackedPools ?? []).filter((entry) => entry.enabled !== false);
  if (!trackedPools.length) throw new Error("DeDust has no tracked pools configured");

  const normalized = rawPools.map((pool) => candidate(pool)).filter((pool) => pool.address);
  const selections = [];

  for (const entry of trackedPools) {
    const raw = rawPools.find((pool) => poolAddress(pool) === entry.poolAddress);
    if (!raw) throw new Error(`DeDust tracked pool not found: ${entry.poolAddress}`);
    const pool = candidate(raw, entry);
    if (!matches(entry, pool)) throw new Error(`DeDust pool assets do not match configuration: ${entry.poolAddress}`);

    const onchain = await dedustOnchain(pool, entry, config);
    const tvl = estimateTvlUsd(pool, entry);
    const tradesWindow = await fetchTradesWindow({
      baseUrl: config.apiBaseUrl ?? "https://api.dedust.io",
      poolAddress: pool.address,
      timeoutMs: config.timeoutMs ?? 20000,
      days: entry.aprWindowDays ?? 7,
      pageSize: config.trades?.pageSize ?? 1000,
      maxPages: config.trades?.maxPages ?? 25
    });
    const volume7dUsd = tradesWindow.trades.reduce((sum, trade) => sum + (tradeStableAmountUsd(trade, entry) ?? 0), 0);
    const tradeFeeRate = onchain.tradeFeeRate ?? parseTradeFeeRate(pool.tradeFeeRaw, entry.fallbackTradeFeeRate ?? null);
    const feeApr = calculateFeeApr({
      volume7dUsd,
      tvlUsd: tvl.value,
      tradeFeeRate,
      lpShare: entry.lpFeeShare ?? 0.8,
      complete: tradesWindow.complete
    });

    selections.push({ entry, pool, onchain, tvl, tradesWindow, volume7dUsd, tradeFeeRate, feeApr });
  }

  const selectionMap = new Map(selections.map((selection) => [selection.entry.opportunityId, selection]));
  const next = opportunities.map((item) => {
    const selection = selectionMap.get(item.id);
    if (!selection) return item;
    const { entry, pool, onchain, tvl, tradesWindow, volume7dUsd, tradeFeeRate, feeApr } = selection;
    const hasFreshApr = feeApr !== null;

    return {
      ...item,
      asset: entry.displayAsset ?? item.asset,
      product: entry.displayProduct ?? item.product,
      tvlUsd: tvl.value ?? item.tvlUsd,
      apy: {
        ...item.apy,
        current: hasFreshApr ? feeApr.apr : item.apy?.current,
        metric: "apr",
        qualifier: hasFreshApr ? "calculated-fee-apr-7d" : "last-successful-fee-apr",
        observedAt: hasFreshApr ? checkedAt : item.apy?.observedAt,
        display: hasFreshApr ? undefined : item.apy?.display,
        note: hasFreshApr
          ? { ru: "Расчётный fee APR за 7 дней", en: "Calculated 7-day fee APR" }
          : { ru: "Последний успешный расчёт", en: "Last successful calculation" },
        isApproximate: tvl.approximate
      },
      externalId: pool.address,
      links: {
        ...item.links,
        app: `https://app.dedust.io/pools/${pool.address}`
      },
      source: {
        type: "api",
        provider: "DeDust official API + TON blockchain",
        url: `${config.apiBaseUrl ?? "https://api.dedust.io"}/v2/pools/${pool.address}/trades`,
        lastChecked: checkedAt,
        origin: "automatic collector"
      },
      sourceDetails: {
        metricPeriod: "7d",
        calculation: "trade-volume × pool-fee × 80% LP share ÷ TVL × annualization",
        volume7dUsd,
        lpFees7dUsd: feeApr?.lpFees7dUsd ?? null,
        tradeFeeRate,
        lpFeeShare: entry.lpFeeShare ?? 0.8,
        tradesCount: tradesWindow.trades.length,
        tradesWindow,
        poolType: pool.poolType,
        assetAddresses: pool.assetAddresses,
        reserves: pool.reserves,
        tvlMethod: tvl.method,
        tvlApproximate: tvl.approximate,
        onchain
      },
      verification: {
        verifiedAt: checkedAt,
        note: {
          ru: `Пул TON/USDT закреплён по адресу. APR рассчитан по фактическим сделкам за 7 дней и доле LP 80%. TVL рассчитан по резервам пула${tvl.approximate ? " (приближённо)" : ""}. Резервы: ${onchain.status === "verified" ? "проверены в блокчейне" : "on-chain проверка временно недоступна"}.`,
          en: `The TON/USDT pool is locked by address. APR is calculated from actual 7-day trades and the 80% LP fee share. TVL is calculated from pool reserves${tvl.approximate ? " (approximate)" : ""}. Reserves: ${onchain.status === "verified" ? "verified on-chain" : "on-chain check temporarily unavailable"}.`
        }
      },
      status: {
        ...item.status,
        stale: !hasFreshApr,
        sourceError: false,
        requiresDisambiguation: false
      }
    };
  });

  const snapshotFile = await writeProtocolSnapshot("dedust", {
    schemaVersion: "1.1",
    generatedAt: checkedAt,
    source: { provider: "DeDust official API + TON blockchain", url: config.endpoint },
    trackedPools: selections
  });
  await writeJsonAtomic(path.join(process.cwd(), "data", "dedust-pools.json"), {
    generatedAt: checkedAt,
    pools: normalized
  });
  await writeJsonAtomic(path.join(process.cwd(), "data", "dedust-candidates.json"), {
    generatedAt: checkedAt,
    mode: "configured-address",
    opportunities: selections.map(({ entry, pool, onchain, tvl, tradesWindow, volume7dUsd, tradeFeeRate, feeApr }) => ({
      opportunityId: entry.opportunityId,
      selected: pool.address,
      tvl,
      volume7dUsd,
      tradeFeeRate,
      feeApr,
      tradesWindow,
      onchain
    }))
  });

  return {
    opportunities: next,
    report: {
      adapter: "dedust",
      status: selections.every((item) => item.feeApr) ? "ok" : "partial",
      apiPoolsReceived: rawPools.length,
      trackedPools: selections.length,
      updated: selections.filter((item) => item.feeApr).length,
      onchainVerified: selections.filter((item) => item.onchain.status === "verified").length,
      snapshotFile,
      candidatesFile: "data/dedust-candidates.json"
    }
  };
}

export const __test = {
  normalizeSymbol,
  unwrap,
  unwrapTrades,
  poolAddress,
  poolAssetAddresses,
  poolSymbols,
  poolType,
  extractYield,
  candidate,
  matches,
  estimateTvlUsd,
  parseTradeFeeRate,
  tradeStableAmountUsd,
  fetchTradesWindow,
  calculateFeeApr
};
