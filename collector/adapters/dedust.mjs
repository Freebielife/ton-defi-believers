import { asArray, firstFinite, nowIso, readJson, writeJsonAtomic } from "../lib/utils.mjs";
import path from "node:path";

function address(pool) {
  return pool.address ?? pool.pool_address ?? pool.id ?? null;
}

function symbols(pool) {
  const assets = pool.assets ?? pool.tokens ?? [];
  return assets.map((asset) =>
    String(asset?.metadata?.symbol ?? asset?.symbol ?? asset?.type ?? "")
      .trim()
      .toUpperCase()
  ).filter(Boolean);
}

function candidate(pool) {
  return {
    address: address(pool),
    symbols: symbols(pool),
    poolType: pool.type ?? pool.pool_type ?? null,
    tvlUsd: firstFinite(pool.tvl, pool.tvl_usd, pool.tvlUsd, pool.reserves_usd),
    apr: firstFinite(pool.apr, pool.fee_apr, pool.total_apr),
    volume24hUsd: firstFinite(pool.volume_24h, pool.volume24h, pool.volume_usd_24h)
  };
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "TON-DeFi-Believers-Collector/0.3" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`DeDust API returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function collectDedust({ configPath, opportunities }) {
  const config = await readJson(configPath);
  if (!config.enabled) return { opportunities, report: { adapter: "dedust", status: "disabled" } };

  const payload = await fetchJson(config.endpoint, config.timeoutMs);
  const pools = asArray(payload).map(candidate).filter((item) => item.address);
  await writeJsonAtomic(path.join(process.cwd(), "data", "dedust-pools.json"), {
    generatedAt: nowIso(),
    pools
  });

  if (!config.trackedPools.length) {
    return {
      opportunities,
      report: {
        adapter: "dedust",
        status: "catalog-ready-no-tracked-opportunities",
        apiPoolsReceived: pools.length,
        updated: 0
      }
    };
  }

  let updated = 0;
  const byAddress = new Map(pools.map((pool) => [pool.address, pool]));
  const next = opportunities.map((item) => {
    const tracked = config.trackedPools.find((entry) => entry.opportunityId === item.id);
    if (!tracked) return item;
    const pool = byAddress.get(tracked.poolAddress);
    if (!pool) return { ...item, status: { ...item.status, stale: true, sourceError: true } };
    updated += 1;
    return {
      ...item,
      tvlUsd: pool.tvlUsd ?? item.tvlUsd,
      apy: { ...item.apy, current: pool.apr ?? item.apy?.current, metric: "apr" },
      externalId: pool.address,
      source: {
        type: "api",
        provider: "DeDust official API",
        url: config.endpoint,
        lastChecked: nowIso(),
        origin: "automatic collector"
      },
      status: { ...item.status, stale: false, sourceError: false, requiresDisambiguation: false }
    };
  });

  return { opportunities: next, report: { adapter: "dedust", status: "ok", updated, apiPoolsReceived: pools.length } };
}
