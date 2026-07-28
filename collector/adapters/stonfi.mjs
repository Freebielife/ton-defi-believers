import path from "node:path";
import {
  asArray,
  firstFinite,
  nowIso,
  readJson,
  writeJsonAtomic
} from "../lib/utils.mjs";
import { writeProtocolSnapshot } from "../lib/protocol-output.mjs";
import { verifyPoolReserves } from "../lib/ton-rpc.mjs";

const TON_NATIVE = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

function normalizeSymbol(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeAddress(value) {
  return String(value ?? "").trim();
}

function unwrap(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  }
  return asArray(payload);
}

function unwrapPool(payload) {
  return payload?.pool ?? payload?.data?.pool ?? payload?.data ?? payload;
}

function assetAddress(asset) {
  return normalizeAddress(
    asset?.contract_address ?? asset?.contractAddress ?? asset?.address ??
    asset?.jetton_address ?? asset?.jettonAddress
  );
}

function assetSymbol(asset) {
  return normalizeSymbol(
    asset?.symbol ?? asset?.ticker ?? asset?.meta?.symbol ??
    asset?.metadata?.symbol ?? asset?.display_name ?? asset?.displayName ?? asset?.name
  );
}

function poolAddress(pool) {
  return normalizeAddress(
    pool?.address ?? pool?.pool_address ?? pool?.poolAddress ??
    pool?.contract_address ?? pool?.contractAddress
  );
}

function poolAssetAddresses(pool) {
  const values = [
    pool?.token0_address, pool?.token1_address, pool?.token_0_address, pool?.token_1_address,
    pool?.asset0_address, pool?.asset1_address, pool?.asset_0_address, pool?.asset_1_address,
    pool?.jetton0_address, pool?.jetton1_address, pool?.jetton_0_address, pool?.jetton_1_address,
    pool?.token0?.address, pool?.token1?.address, pool?.asset0?.address, pool?.asset1?.address
  ];
  if (Array.isArray(pool?.assets)) {
    for (const asset of pool.assets) {
      values.push(typeof asset === "string" ? asset : assetAddress(asset));
    }
  }
  return [...new Set(values.map(normalizeAddress).filter(Boolean))];
}

function poolEmbeddedSymbols(pool) {
  const values = [
    pool?.token0_symbol, pool?.token1_symbol, pool?.asset0_symbol, pool?.asset1_symbol,
    pool?.token0?.symbol, pool?.token1?.symbol, pool?.asset0?.symbol, pool?.asset1?.symbol
  ];
  if (Array.isArray(pool?.assets)) {
    for (const asset of pool.assets) if (typeof asset !== "string") values.push(assetSymbol(asset));
  }
  return [...new Set(values.map(normalizeSymbol).filter(Boolean))];
}

function poolType(pool) {
  return String(
    pool?.pool_type ?? pool?.poolType ?? pool?.type ?? pool?.curve_type ??
    pool?.curveType ?? pool?.dex_type ?? ""
  ).toLowerCase();
}

function extractTvlUsd(pool) {
  return firstFinite(
    pool?.lp_total_supply_usd,
    pool?.lpTotalSupplyUsd,
    pool?.tvl_usd,
    pool?.tvlUsd,
    pool?.tvl,
    pool?.liquidity_usd,
    pool?.liquidityUsd,
    pool?.lp_total_usd,
    pool?.total_liquidity_usd,
    pool?.stats?.tvl_usd,
    pool?.stats?.tvlUsd
  );
}

function normalizePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number > 0 && number < 1) return number * 100;
  return number;
}

function extractYieldPeriods(pool, farm = null) {
  const periods = {
    apy1d: normalizePercent(pool?.apy_1d ?? farm?.apy_1d),
    apy7d: normalizePercent(pool?.apy_7d ?? farm?.apy_7d),
    apy30d: normalizePercent(pool?.apy_30d ?? farm?.apy_30d),
    underlyingApr: normalizePercent(pool?.underlying_apr ?? farm?.underlying_apr)
  };

  const primary = [
    [periods.apy7d, "7d"],
    [periods.apy30d, "30d"],
    [periods.apy1d, "1d"],
    [normalizePercent(pool?.apy ?? farm?.apy), "reported"]
  ].find(([value]) => value !== null);

  return {
    value: primary?.[0] ?? null,
    metric: primary ? "apy" : null,
    period: primary?.[1] ?? null,
    ...periods
  };
}

function buildAssetMap(assets) {
  const map = new Map();
  for (const asset of assets) {
    const address = assetAddress(asset);
    const symbol = assetSymbol(asset);
    if (address && symbol) map.set(address, symbol);
  }
  map.set(TON_NATIVE, "TON");
  return map;
}

function buildFarmMap(farms) {
  const map = new Map();
  for (const farm of farms) {
    const address = normalizeAddress(farm?.pool_address ?? farm?.poolAddress ?? farm?.pool?.address);
    if (address) map.set(address, farm);
  }
  return map;
}

function makeCandidate(pool, assetMap = new Map(), farmByPool = new Map(), dexVersion = null, fallback = {}) {
  const addresses = poolAssetAddresses(pool);
  const embedded = poolEmbeddedSymbols(pool);
  const resolved = addresses.map((address) => assetMap.get(address)).filter(Boolean);
  const symbols = [...new Set([...embedded, ...resolved, ...(fallback.symbols ?? []).map(normalizeSymbol)])];
  const yieldData = extractYieldPeriods(pool, farmByPool.get(poolAddress(pool)));

  return {
    address: poolAddress(pool),
    assetAddresses: addresses.length ? addresses : (fallback.assetAddresses ?? []),
    symbols,
    poolType: poolType(pool) || fallback.poolType || null,
    dexVersion: dexVersion ?? fallback.dexVersion ?? null,
    tvlUsd: extractTvlUsd(pool),
    yieldRate: yieldData.value,
    yieldMetric: yieldData.metric,
    yieldPeriod: yieldData.period,
    yieldPeriods: {
      apy1d: yieldData.apy1d,
      apy7d: yieldData.apy7d,
      apy30d: yieldData.apy30d,
      underlyingApr: yieldData.underlyingApr
    },
    volume24hUsd: firstFinite(pool?.volume_24h_usd, pool?.volume24hUsd),
    rawReserves: [pool?.reserve0, pool?.reserve1],
    routerAddress: pool?.router_address ?? pool?.routerAddress ?? pool?.router?.address ?? null
  };
}

function symbolEquivalent(expected, actual, aliases) {
  if (expected === actual) return true;
  const expectedAliases = new Set([expected, ...(aliases[expected] ?? []).map(normalizeSymbol)]);
  const actualAliases = new Set([actual, ...(aliases[actual] ?? []).map(normalizeSymbol)]);
  return [...expectedAliases].some((item) => actualAliases.has(item));
}

function matches(entry, candidate, aliases = {}) {
  const expectedAddresses = (entry.assetAddresses ?? []).map(normalizeAddress).filter(Boolean);
  if (expectedAddresses.length) {
    const actual = new Set(candidate.assetAddresses.map(normalizeAddress));
    if (!expectedAddresses.every((address) => actual.has(address))) return false;
  }

  const expectedSymbols = (entry.symbols ?? []).map(normalizeSymbol).filter(Boolean);
  if (expectedSymbols.length && expectedAddresses.length < 2) {
    const actual = candidate.symbols.map(normalizeSymbol);
    if (!expectedSymbols.every((symbol) => actual.some((value) => symbolEquivalent(symbol, value, aliases)))) {
      return false;
    }
  }

  if (!expectedAddresses.length && !expectedSymbols.length) return false;
  if (entry.expectedPoolType && candidate.poolType && !candidate.poolType.includes(String(entry.expectedPoolType).toLowerCase())) return false;
  if (entry.dexVersion && candidate.dexVersion && candidate.dexVersion !== entry.dexVersion) return false;
  return true;
}

function selectCandidate(entry, candidates, publishOnlyWhenUnique) {
  const ranked = [...candidates].sort((a, b) => (b.tvlUsd ?? -1) - (a.tvlUsd ?? -1));
  if (entry.rankByTvl) return ranked[entry.rankByTvl - 1] ?? null;
  if (ranked.length === 1) return ranked[0];
  return publishOnlyWhenUnique ? null : ranked[0] ?? null;
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
      if (!response.ok) throw new Error(`STON.fi API returned HTTP ${response.status}: ${url}`);
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

async function fetchOptional(url, timeoutMs) {
  try { return await fetchJson(url, timeoutMs, 2); }
  catch (error) { console.warn(`Optional STON.fi endpoint failed: ${error.message}`); return null; }
}

async function onchainCheck(entry, pool, config) {
  if (config.onchain?.enabled === false) return { status: "disabled" };
  try {
    const dexVersion = entry.dexVersion ?? pool.dexVersion;
    const reserveIndexes = dexVersion === "v1" ? [0, 1] : [3, 4];
    const result = await verifyPoolReserves({
      address: pool.address,
      method: "get_pool_data",
      reserveIndexes,
      apiReserves: pool.rawReserves,
      timeoutMs: config.onchain?.timeoutMs ?? 20000,
      tolerancePercent: config.onchain?.tolerancePercent ?? 2
    });
    return { status: result.passed ? "verified" : "mismatch", ...result };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : String(error) };
  }
}

function yieldNote(period) {
  const labels = {
    "7d": { ru: "APY за последние 7 дней", en: "APY over the last 7 days" },
    "30d": { ru: "APY за последние 30 дней", en: "APY over the last 30 days" },
    "1d": { ru: "APY за последние 24 часа", en: "APY over the last 24 hours" },
    reported: { ru: "APY из официального API", en: "APY from the official API" }
  };
  return labels[period] ?? labels.reported;
}

export async function collectStonfi({ configPath, opportunities }) {
  const config = await readJson(configPath);
  if (!config.enabled) return { opportunities, report: { adapter: "stonfi", status: "disabled" } };

  const checkedAt = nowIso();
  const apiBase = config.apiBaseUrl.replace(/\/$/, "");
  const timeoutMs = config.timeoutMs ?? 20000;
  const aliases = Object.fromEntries(Object.entries(config.symbolAliases ?? {}).map(([key, values]) => [normalizeSymbol(key), values]));
  const selections = new Map();
  const discovery = [];

  for (const entry of (config.trackedPools ?? []).filter((item) => item.enabled !== false)) {
    let candidate = null;
    let endpoint = null;

    if (entry.poolAddress) {
      endpoint = `${apiBase}/v1/pools/${entry.poolAddress}`;
      const payload = await fetchJson(endpoint, timeoutMs);
      const raw = unwrapPool(payload);
      candidate = makeCandidate(raw, new Map(), new Map(), entry.dexVersion, entry);
      if (!candidate.address) candidate.address = entry.poolAddress;
      if (!matches(entry, candidate, aliases)) candidate = null;
    } else {
      endpoint = `${apiBase}/v1/pools?dex_v2=${entry.dexVersion !== "v1"}`;
      const payload = await fetchJson(endpoint, timeoutMs);
      const candidates = unwrap(payload, ["pools", "pool_list"])
        .map((pool) => makeCandidate(pool, new Map(), new Map(), entry.dexVersion, entry))
        .filter((pool) => pool.address && matches(entry, pool, aliases));
      candidate = selectCandidate(entry, candidates, config.discovery?.publishOnlyWhenUnique !== false);
    }

    const chain = candidate ? await onchainCheck(entry, candidate, config) : { status: "not-run" };
    if (candidate) candidate.onchain = chain;
    selections.set(entry.opportunityId, candidate);
    discovery.push({ opportunityId: entry.opportunityId, endpoint, selected: candidate?.address ?? null, candidate });
  }

  const next = opportunities.map((opportunity) => {
    if (!selections.has(opportunity.id)) return opportunity;
    const pool = selections.get(opportunity.id);
    if (!pool) return opportunity;

    return {
      ...opportunity,
      tvlUsd: pool.tvlUsd ?? opportunity.tvlUsd,
      apy: {
        ...opportunity.apy,
        current: pool.yieldRate ?? opportunity.apy?.current,
        average7d: pool.yieldPeriods.apy7d,
        metric: pool.yieldMetric ?? "apy",
        qualifier: `official-api-${pool.yieldPeriod ?? "reported"}`,
        observedAt: checkedAt,
        note: yieldNote(pool.yieldPeriod),
        isApproximate: false
      },
      links: { ...opportunity.links, app: `https://app.ston.fi/pools/${pool.address}` },
      source: {
        type: "api",
        provider: "STON.fi official API",
        url: `${apiBase}/v1/pools/${pool.address}`,
        lastChecked: checkedAt,
        origin: "automatic collector"
      },
      externalId: pool.address,
      sourceDetails: {
        metricPeriod: pool.yieldPeriod,
        apy1d: pool.yieldPeriods.apy1d,
        apy7d: pool.yieldPeriods.apy7d,
        apy30d: pool.yieldPeriods.apy30d,
        underlyingApr: pool.yieldPeriods.underlyingApr,
        volume24hUsd: pool.volume24hUsd,
        dexVersion: pool.dexVersion,
        assetAddresses: pool.assetAddresses,
        routerAddress: pool.routerAddress,
        onchain: pool.onchain
      },
      verification: {
        verifiedAt: checkedAt,
        note: {
          ru: `Доходность взята из официального API STON.fi (${pool.yieldPeriod ?? "текущий"} период). TVL — поле lp_total_supply_usd. Резервы: ${pool.onchain?.status === "verified" ? "проверены в блокчейне" : "on-chain проверка временно недоступна"}.`,
          en: `Yield comes from the official STON.fi API (${pool.yieldPeriod ?? "current"} period). TVL uses lp_total_supply_usd. Reserves: ${pool.onchain?.status === "verified" ? "verified on-chain" : "on-chain check temporarily unavailable"}.`
        }
      },
      status: {
        ...opportunity.status,
        stale: false,
        sourceError: false,
        requiresDisambiguation: false
      }
    };
  });

  const snapshotFile = await writeProtocolSnapshot("stonfi", {
    schemaVersion: "1.1",
    generatedAt: checkedAt,
    source: { provider: "STON.fi official API", mode: "exact-pool-endpoint" },
    pools: discovery
  });
  await writeJsonAtomic(path.join(process.cwd(), "data", "stonfi-candidates.json"), {
    generatedAt: checkedAt,
    mode: "exact-pool-endpoint",
    opportunities: discovery
  });

  const updated = discovery.filter((item) => item.selected).length;
  return {
    opportunities: next,
    report: {
      adapter: "stonfi",
      status: updated === discovery.length ? "ok" : updated ? "partial" : "needs-review",
      requestedPools: discovery.length,
      exactPoolRequests: discovery.filter((item) => item.endpoint?.includes("/v1/pools/EQ")).length,
      updated,
      onchainVerified: discovery.filter((item) => item.candidate?.onchain?.status === "verified").length,
      snapshotFile,
      candidatesFile: "data/stonfi-candidates.json"
    }
  };
}

export const __test = {
  normalizeSymbol,
  unwrap,
  poolAddress,
  poolAssetAddresses,
  poolEmbeddedSymbols,
  extractTvlUsd,
  extractYieldPeriods,
  buildAssetMap,
  buildFarmMap,
  makeCandidate,
  matches,
  selectCandidate
};
