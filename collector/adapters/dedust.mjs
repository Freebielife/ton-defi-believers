import path from "node:path";
import {
  asArray,
  firstFinite,
  nowIso,
  readJson,
  writeJsonAtomic
} from "../lib/utils.mjs";
import { writeProtocolSnapshot } from "../lib/protocol-output.mjs";

function normalizeSymbol(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
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

function poolAddress(pool) {
  return normalizeAddress(
    pool?.address ??
    pool?.pool_address ??
    pool?.poolAddress ??
    pool?.contract_address ??
    pool?.contractAddress ??
    pool?.id
  );
}

function assetAddress(asset) {
  if (typeof asset === "string") return normalizeAddress(asset);
  return normalizeAddress(
    asset?.address ??
    asset?.contract_address ??
    asset?.contractAddress ??
    asset?.jetton_address ??
    asset?.jettonAddress ??
    asset?.metadata?.address
  );
}

function assetSymbol(asset) {
  if (typeof asset === "string") return "";
  return normalizeSymbol(
    asset?.symbol ??
    asset?.ticker ??
    asset?.metadata?.symbol ??
    asset?.meta?.symbol ??
    asset?.name ??
    asset?.type
  );
}

function poolAssets(pool) {
  const assets = [];

  if (Array.isArray(pool?.assets)) assets.push(...pool.assets);
  if (Array.isArray(pool?.tokens)) assets.push(...pool.tokens);

  for (const value of [
    pool?.asset0, pool?.asset1,
    pool?.token0, pool?.token1,
    pool?.left, pool?.right
  ]) {
    if (value) assets.push(value);
  }

  return assets;
}

function poolAssetAddresses(pool) {
  const direct = [
    pool?.asset0_address,
    pool?.asset1_address,
    pool?.asset_0_address,
    pool?.asset_1_address,
    pool?.token0_address,
    pool?.token1_address,
    pool?.token_0_address,
    pool?.token_1_address
  ];

  for (const asset of poolAssets(pool)) direct.push(assetAddress(asset));
  return [...new Set(direct.map(normalizeAddress).filter(Boolean))];
}

function poolSymbols(pool) {
  const symbols = [
    pool?.asset0_symbol,
    pool?.asset1_symbol,
    pool?.token0_symbol,
    pool?.token1_symbol
  ];

  for (const asset of poolAssets(pool)) symbols.push(assetSymbol(asset));
  return [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
}

function poolType(pool) {
  const raw = String(
    pool?.type ??
    pool?.pool_type ??
    pool?.poolType ??
    pool?.curve_type ??
    pool?.curveType ??
    ""
  ).toLowerCase();

  if (raw.includes("stable")) return "stable";
  if (raw.includes("volatile")) return "volatile";
  if (raw.includes("cpmm")) return "volatile";
  return raw || null;
}

function normalizePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number > 0 && number < 1) return number * 100;
  return number;
}

function extractYield(pool) {
  const apy = [
    pool?.apy,
    pool?.apy_1d,
    pool?.apy_7d,
    pool?.stats?.apy,
    pool?.yield?.apy
  ].map(normalizePercent).find((value) => value !== null);

  if (apy !== undefined) return { value: apy, metric: "apy" };

  const apr = [
    pool?.apr,
    pool?.apr_1d,
    pool?.apr_7d,
    pool?.fee_apr,
    pool?.feeApr,
    pool?.total_apr,
    pool?.stats?.apr,
    pool?.yield?.apr
  ].map(normalizePercent).find((value) => value !== null);

  return apr === undefined
    ? { value: null, metric: null }
    : { value: apr, metric: "apr" };
}

function candidate(pool) {
  const yieldData = extractYield(pool);

  return {
    address: poolAddress(pool),
    symbols: poolSymbols(pool),
    assetAddresses: poolAssetAddresses(pool),
    poolType: poolType(pool),
    tvlUsd: firstFinite(
      pool?.tvl,
      pool?.tvl_usd,
      pool?.tvlUsd,
      pool?.reserves_usd,
      pool?.reservesUsd,
      pool?.liquidity_usd,
      pool?.stats?.tvl
    ),
    yieldRate: yieldData.value,
    yieldMetric: yieldData.metric,
    volume24hUsd: firstFinite(
      pool?.volume_24h,
      pool?.volume24h,
      pool?.volume_usd_24h,
      pool?.volume24hUsd,
      pool?.stats?.volume_24h
    ),
    feeBps: firstFinite(
      pool?.fee_bps,
      pool?.feeBps,
      pool?.trade_fee_bps,
      pool?.tradeFeeBps
    )
  };
}

function matches(entry, pool) {
  const expectedAddresses = (entry.assetAddresses ?? [])
    .map(normalizeAddress)
    .filter(Boolean);

  if (expectedAddresses.length) {
    const actual = new Set(pool.assetAddresses);
    if (!expectedAddresses.every((address) => actual.has(address))) return false;
  }

  const expectedSymbols = (entry.symbols ?? [])
    .map(normalizeSymbol)
    .filter(Boolean);

  if (expectedSymbols.length && !expectedAddresses.length) {
    const actual = new Set(pool.symbols);
    if (!expectedSymbols.every((symbol) => actual.has(symbol))) return false;
  }

  if (entry.poolType && pool.poolType !== entry.poolType) return false;
  return expectedAddresses.length > 0 || expectedSymbols.length > 0;
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "TON-DeFi-Believers-Collector/0.8"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`DeDust API returned HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function collectDedust({ configPath, opportunities }) {
  const config = await readJson(configPath);
  if (!config.enabled) {
    return {
      opportunities,
      report: { adapter: "dedust", status: "disabled" }
    };
  }

  const checkedAt = nowIso();
  const payload = await fetchJson(config.endpoint, config.timeoutMs ?? 20000);
  const rawPools = unwrap(payload);
  const pools = rawPools.map(candidate).filter((item) => item.address);

  const snapshotFile = await writeProtocolSnapshot("dedust", {
    schemaVersion: "1.0",
    generatedAt: checkedAt,
    source: {
      provider: "DeDust official API",
      url: config.endpoint
    },
    summary: {
      received: rawPools.length,
      normalized: pools.length,
      withSymbols: pools.filter((item) => item.symbols.length >= 2).length,
      withTvl: pools.filter((item) => item.tvlUsd !== null).length,
      withYield: pools.filter((item) => item.yieldRate !== null).length,
      stablePools: pools.filter((item) => item.poolType === "stable").length,
      volatilePools: pools.filter((item) => item.poolType === "volatile").length
    },
    pools
  });

  // Keep old compatibility file during the transition.
  await writeJsonAtomic(
    path.join(process.cwd(), "data", "dedust-pools.json"),
    { generatedAt: checkedAt, pools }
  );

  const trackedPools = (config.trackedPools ?? []).filter(
    (entry) => entry.enabled !== false
  );

  if (!trackedPools.length) {
    return {
      opportunities,
      report: {
        adapter: "dedust",
        status: "catalog-ready-no-tracked-opportunities",
        apiPoolsReceived: rawPools.length,
        normalizedPools: pools.length,
        poolsWithTvl: pools.filter((item) => item.tvlUsd !== null).length,
        poolsWithYield: pools.filter((item) => item.yieldRate !== null).length,
        updated: 0,
        snapshotFile
      }
    };
  }

  const selections = new Map();
  const discovery = [];

  for (const entry of trackedPools) {
    let found = [];

    if (entry.poolAddress) {
      found = pools.filter((pool) => pool.address === entry.poolAddress);
    } else {
      found = pools.filter((pool) => matches(entry, pool));
    }

    found.sort((a, b) => (b.tvlUsd ?? -1) - (a.tvlUsd ?? -1));

    const selected =
      entry.rankByTvl
        ? found[entry.rankByTvl - 1] ?? null
        : found.length === 1
          ? found[0]
          : null;

    selections.set(entry.opportunityId, selected);
    discovery.push({
      opportunityId: entry.opportunityId,
      selected: selected?.address ?? null,
      candidates: found.slice(0, 10)
    });
  }

  let updated = 0;
  const next = opportunities.map((item) => {
    if (!selections.has(item.id)) return item;
    const pool = selections.get(item.id);

    if (!pool) {
      return {
        ...item,
        status: {
          ...item.status,
          stale: true,
          requiresDisambiguation: true
        }
      };
    }

    updated += 1;
    return {
      ...item,
      tvlUsd: pool.tvlUsd ?? item.tvlUsd,
      apy: {
        ...item.apy,
        current: pool.yieldRate ?? item.apy?.current,
        metric: pool.yieldMetric ?? item.apy?.metric ?? "unknown"
      },
      externalId: pool.address,
      source: {
        type: "api",
        provider: "DeDust official API",
        url: config.endpoint,
        lastChecked: checkedAt,
        origin: "automatic collector"
      },
      sourceDetails: {
        poolType: pool.poolType,
        assetAddresses: pool.assetAddresses,
        volume24hUsd: pool.volume24hUsd,
        feeBps: pool.feeBps
      },
      status: {
        ...item.status,
        stale: false,
        sourceError: false,
        requiresDisambiguation: false
      }
    };
  });

  await writeJsonAtomic(
    path.join(process.cwd(), "data", "dedust-candidates.json"),
    { generatedAt: checkedAt, opportunities: discovery }
  );

  const unresolved = discovery.filter((item) => !item.selected).length;
  return {
    opportunities: next,
    report: {
      adapter: "dedust",
      status: unresolved ? (updated ? "partial" : "needs-review") : "ok",
      apiPoolsReceived: rawPools.length,
      normalizedPools: pools.length,
      poolsWithTvl: pools.filter((item) => item.tvlUsd !== null).length,
      poolsWithYield: pools.filter((item) => item.yieldRate !== null).length,
      updated,
      unresolved,
      snapshotFile,
      candidatesFile: "data/dedust-candidates.json"
    }
  };
}

export const __test = {
  normalizeSymbol,
  unwrap,
  poolAddress,
  poolAssetAddresses,
  poolSymbols,
  poolType,
  extractYield,
  candidate,
  matches
};
