import path from "node:path";
import {
  asArray,
  firstFinite,
  nowIso,
  readJson,
  writeJsonAtomic
} from "../lib/utils.mjs";

const TON_NATIVE = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

function normalizeSymbol(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^J?W?/, (prefix) => prefix)
    .replace(/[^A-Z0-9]/g, "");
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

function assetAddress(asset) {
  return normalizeAddress(
    asset?.contract_address ??
    asset?.contractAddress ??
    asset?.address ??
    asset?.jetton_address ??
    asset?.jettonAddress
  );
}

function assetSymbol(asset) {
  return normalizeSymbol(
    asset?.symbol ??
    asset?.ticker ??
    asset?.meta?.symbol ??
    asset?.metadata?.symbol ??
    asset?.display_name ??
    asset?.displayName ??
    asset?.name
  );
}

function poolAddress(pool) {
  return normalizeAddress(
    pool?.address ??
    pool?.pool_address ??
    pool?.poolAddress ??
    pool?.contract_address ??
    pool?.contractAddress
  );
}

function poolAssetAddresses(pool) {
  const direct = [
    pool?.token0_address,
    pool?.token1_address,
    pool?.token_0_address,
    pool?.token_1_address,
    pool?.asset0_address,
    pool?.asset1_address,
    pool?.asset_0_address,
    pool?.asset_1_address,
    pool?.jetton0_address,
    pool?.jetton1_address,
    pool?.jetton_0_address,
    pool?.jetton_1_address,
    pool?.token0?.address,
    pool?.token1?.address,
    pool?.asset0?.address,
    pool?.asset1?.address
  ];

  if (Array.isArray(pool?.assets)) {
    for (const asset of pool.assets) {
      direct.push(
        typeof asset === "string"
          ? asset
          : asset?.address ?? asset?.contract_address ?? asset?.jetton_address
      );
    }
  }

  return [...new Set(direct.map(normalizeAddress).filter(Boolean))];
}

function poolEmbeddedSymbols(pool) {
  const values = [
    pool?.token0_symbol,
    pool?.token1_symbol,
    pool?.asset0_symbol,
    pool?.asset1_symbol,
    pool?.token0?.symbol,
    pool?.token1?.symbol,
    pool?.asset0?.symbol,
    pool?.asset1?.symbol
  ];

  if (Array.isArray(pool?.assets)) {
    for (const asset of pool.assets) {
      if (typeof asset !== "string") {
        values.push(asset?.symbol, asset?.metadata?.symbol, asset?.meta?.symbol);
      }
    }
  }

  return [...new Set(values.map(normalizeSymbol).filter(Boolean))];
}

function poolType(pool) {
  return String(
    pool?.pool_type ??
    pool?.poolType ??
    pool?.type ??
    pool?.curve_type ??
    pool?.curveType ??
    pool?.dex_type ??
    ""
  ).toLowerCase();
}

function extractTvlUsd(pool) {
  return firstFinite(
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

  // Most APIs expose percent as 4.2, but some expose fraction as 0.042.
  if (number > 0 && number < 1) return number * 100;
  return number;
}

function extractYield(pool, farmByPool) {
  const poolAddr = poolAddress(pool);
  const farm = farmByPool.get(poolAddr);

  const apy = [
    pool?.apy,
    pool?.apy_1d,
    pool?.apy_7d,
    pool?.apy_annual,
    pool?.stats?.apy,
    farm?.apy,
    farm?.apy_1d,
    farm?.apy_7d
  ].map(normalizePercent).find((value) => value !== null);

  if (apy !== undefined) return { value: apy, metric: "apy" };

  const apr = [
    pool?.apr,
    pool?.apr_1d,
    pool?.apr_7d,
    pool?.fee_apr,
    pool?.total_apr,
    pool?.stats?.apr,
    farm?.apr,
    farm?.apr_1d,
    farm?.apr_7d
  ].map(normalizePercent).find((value) => value !== null);

  return apr === undefined
    ? { value: null, metric: null }
    : { value: apr, metric: "apr" };
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
    const address = normalizeAddress(
      farm?.pool_address ??
      farm?.poolAddress ??
      farm?.pool?.address
    );
    if (!address) continue;

    const existing = map.get(address);
    const currentValue = firstFinite(farm?.tvl_usd, farm?.tvlUsd, farm?.tvl) ?? 0;
    const existingValue = firstFinite(existing?.tvl_usd, existing?.tvlUsd, existing?.tvl) ?? -1;

    if (!existing || currentValue > existingValue) map.set(address, farm);
  }

  return map;
}

function makeCandidate(pool, assetMap, farmByPool, dexVersion) {
  const addresses = poolAssetAddresses(pool);
  const embedded = poolEmbeddedSymbols(pool);
  const resolved = addresses.map((address) => assetMap.get(address)).filter(Boolean);
  const symbols = [...new Set([...embedded, ...resolved])];
  const yieldData = extractYield(pool, farmByPool);

  return {
    address: poolAddress(pool),
    assetAddresses: addresses,
    symbols,
    poolType: poolType(pool) || null,
    dexVersion,
    tvlUsd: extractTvlUsd(pool),
    yieldRate: yieldData.value,
    yieldMetric: yieldData.metric,
    routerAddress:
      pool?.router_address ??
      pool?.routerAddress ??
      pool?.router?.address ??
      null
  };
}

function symbolEquivalent(expected, actual, aliases) {
  if (expected === actual) return true;

  const expectedAliases = new Set([
    expected,
    ...(aliases[expected] ?? []).map(normalizeSymbol)
  ]);
  const actualAliases = new Set([
    actual,
    ...(aliases[actual] ?? []).map(normalizeSymbol)
  ]);

  for (const item of expectedAliases) {
    if (actualAliases.has(item)) return true;
  }

  return false;
}

function matches(entry, candidate, aliases) {
  const expected = (entry.symbols ?? []).map(normalizeSymbol).filter(Boolean);
  if (!expected.length) return false;

  const found = candidate.symbols.map(normalizeSymbol).filter(Boolean);
  const allSymbolsMatch = expected.every((symbol) =>
    found.some((value) => symbolEquivalent(symbol, value, aliases))
  );
  if (!allSymbolsMatch) return false;

  if (
    entry.expectedPoolType &&
    candidate.poolType &&
    !candidate.poolType.includes(String(entry.expectedPoolType).toLowerCase())
  ) {
    return false;
  }

  if (entry.dexVersion && candidate.dexVersion !== entry.dexVersion) return false;
  return true;
}

function selectCandidate(entry, candidates, publishOnlyWhenUnique) {
  const ranked = [...candidates].sort(
    (a, b) => (b.tvlUsd ?? -1) - (a.tvlUsd ?? -1)
  );

  if (entry.rankByTvl) return ranked[entry.rankByTvl - 1] ?? null;
  if (ranked.length === 1) return ranked[0];
  return publishOnlyWhenUnique ? null : ranked[0] ?? null;
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "TON-DeFi-Believers-Collector/0.6"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`STON.fi API returned HTTP ${response.status}: ${url}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOptional(url, timeoutMs) {
  try {
    return await fetchJson(url, timeoutMs);
  } catch (error) {
    console.warn(`Optional STON.fi endpoint failed: ${error.message}`);
    return null;
  }
}

function dedupePools(items) {
  const map = new Map();

  for (const item of items) {
    const key = poolAddress(item.pool);
    if (!key) continue;
    const previous = map.get(key);

    // Prefer V2 copy when the same address somehow occurs twice.
    if (!previous || item.dexVersion === "v2") map.set(key, item);
  }

  return [...map.values()];
}

export async function collectStonfi({ configPath, opportunities }) {
  const config = await readJson(configPath);
  if (!config.enabled) {
    return { opportunities, report: { adapter: "stonfi", status: "disabled" } };
  }

  const checkedAt = nowIso();
  const apiBase = config.apiBaseUrl.replace(/\/$/, "");
  const timeoutMs = config.timeoutMs ?? 20000;

  const [assetsPayload, v1Payload, v2Payload, farmsPayload] = await Promise.all([
    fetchJson(`${apiBase}/v1/assets`, timeoutMs),
    fetchJson(`${apiBase}/v1/pools?dex_v2=false`, timeoutMs),
    fetchJson(`${apiBase}/v1/pools?dex_v2=true`, timeoutMs),
    fetchOptional(`${apiBase}/v1/farms?only_active=true`, timeoutMs)
  ]);

  const assets = unwrap(assetsPayload, ["assets", "asset_list"]);
  const v1Pools = unwrap(v1Payload, ["pools", "pool_list"])
    .map((pool) => ({ pool, dexVersion: "v1" }));
  const v2Pools = unwrap(v2Payload, ["pools", "pool_list"])
    .map((pool) => ({ pool, dexVersion: "v2" }));
  const farms = farmsPayload
    ? unwrap(farmsPayload, ["farms", "farm_list"])
    : [];

  const assetMap = buildAssetMap(assets);
  const farmByPool = buildFarmMap(farms);
  const rawPools = dedupePools([...v1Pools, ...v2Pools]);

  const candidates = rawPools
    .map(({ pool, dexVersion }) =>
      makeCandidate(pool, assetMap, farmByPool, dexVersion)
    )
    .filter((pool) => pool.address);

  const aliases = Object.fromEntries(
    Object.entries(config.symbolAliases ?? {}).map(([key, values]) => [
      normalizeSymbol(key),
      values
    ])
  );

  const discoveryReport = [];
  const selections = new Map();

  for (const entry of config.trackedPools) {
    if (entry.poolAddress) {
      const exact =
        candidates.find((pool) => pool.address === entry.poolAddress) ?? null;
      selections.set(entry.opportunityId, exact);
      discoveryReport.push({
        opportunityId: entry.opportunityId,
        mode: "configured-address",
        selected: exact?.address ?? null,
        candidates: exact ? [exact] : []
      });
      continue;
    }

    const matching = candidates
      .filter((pool) => matches(entry, pool, aliases))
      .sort((a, b) => (b.tvlUsd ?? -1) - (a.tvlUsd ?? -1))
      .slice(0, config.discovery?.candidateLimitPerOpportunity ?? 10);

    const selected = selectCandidate(
      entry,
      matching,
      config.discovery?.publishOnlyWhenUnique !== false
    );

    selections.set(entry.opportunityId, selected);
    discoveryReport.push({
      opportunityId: entry.opportunityId,
      mode: "automatic-discovery",
      expectedSymbols: entry.symbols,
      selected: selected?.address ?? null,
      candidates: matching
    });
  }

  let updated = 0;
  const next = opportunities.map((opportunity) => {
    if (!selections.has(opportunity.id)) return opportunity;
    const pool = selections.get(opportunity.id);

    if (!pool) {
      return {
        ...opportunity,
        status: {
          ...opportunity.status,
          stale: true,
          requiresDisambiguation: true
        }
      };
    }

    updated += 1;
    return {
      ...opportunity,
      tvlUsd: pool.tvlUsd ?? opportunity.tvlUsd,
      apy: {
        ...opportunity.apy,
        current: pool.yieldRate ?? opportunity.apy.current,
        metric: pool.yieldMetric ?? opportunity.apy.metric ?? "unknown"
      },
      links: {
        ...opportunity.links,
        app: `https://app.ston.fi/pools/${pool.address}`
      },
      source: {
        type: "api",
        provider: "STON.fi DEX API",
        url: `${apiBase}/v1/pools`,
        lastChecked: checkedAt,
        importedAt: opportunity.source?.importedAt ?? checkedAt,
        origin: "automatic collector"
      },
      status: {
        ...opportunity.status,
        stale: false,
        sourceError: false,
        requiresDisambiguation: false
      },
      externalId: pool.address,
      sourceDetails: {
        dexVersion: pool.dexVersion,
        assetAddresses: pool.assetAddresses,
        routerAddress: pool.routerAddress
      }
    };
  });

  await writeJsonAtomic(
    path.join(process.cwd(), "data", "stonfi-candidates.json"),
    {
      generatedAt: checkedAt,
      assetsReceived: assets.length,
      v1PoolsReceived: v1Pools.length,
      v2PoolsReceived: v2Pools.length,
      uniquePoolsReceived: candidates.length,
      farmsReceived: farms.length,
      resolvedPoolSymbols: candidates.filter((item) => item.symbols.length >= 2).length,
      opportunities: discoveryReport
    }
  );

  const unresolved = discoveryReport.filter((item) => !item.selected).length;
  return {
    opportunities: next,
    report: {
      adapter: "stonfi",
      status: unresolved ? (updated ? "partial" : "needs-review") : "ok",
      updated,
      unresolved,
      assetsReceived: assets.length,
      v1PoolsReceived: v1Pools.length,
      v2PoolsReceived: v2Pools.length,
      uniquePoolsReceived: candidates.length,
      farmsReceived: farms.length,
      candidatesFile: "data/stonfi-candidates.json"
    }
  };
}

export const __test = {
  normalizeSymbol,
  unwrap,
  assetAddress,
  assetSymbol,
  poolAddress,
  poolAssetAddresses,
  poolEmbeddedSymbols,
  buildAssetMap,
  makeCandidate,
  matches,
  selectCandidate
};
