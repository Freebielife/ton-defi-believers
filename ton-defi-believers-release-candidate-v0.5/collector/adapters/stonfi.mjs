import { asArray, firstFinite, nowIso, readJson, writeJsonAtomic } from "../lib/utils.mjs";
import path from "node:path";

function poolAddress(pool) {
  return pool.address ?? pool.pool_address ?? pool.poolAddress ?? pool.contract_address ?? null;
}

function normalizeSymbol(value) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function tokenObjects(pool) {
  const values = [
    pool.token0, pool.token1, pool.asset0, pool.asset1,
    pool.jetton0, pool.jetton1, pool.left_token, pool.right_token
  ].filter(Boolean);

  if (Array.isArray(pool.assets)) values.push(...pool.assets);
  if (Array.isArray(pool.tokens)) values.push(...pool.tokens);
  return values;
}

function tokenSymbols(pool) {
  const symbols = [];

  for (const token of tokenObjects(pool)) {
    if (typeof token === "string") {
      symbols.push(token);
      continue;
    }
    symbols.push(
      token.symbol,
      token.ticker,
      token.display_name,
      token.name,
      token.meta?.symbol
    );
  }

  symbols.push(
    pool.token0_symbol, pool.token1_symbol,
    pool.asset0_symbol, pool.asset1_symbol,
    pool.symbol, pool.name, pool.display_name
  );

  return [...new Set(symbols.filter(Boolean).map(normalizeSymbol).filter(Boolean))];
}

function poolType(pool) {
  return String(
    pool.pool_type ?? pool.poolType ?? pool.type ?? pool.curve_type ?? ""
  ).toLowerCase();
}

function extractTvlUsd(pool) {
  return firstFinite(
    pool.tvl_usd, pool.tvlUsd, pool.tvl, pool.lp_total_usd,
    pool.liquidity_usd, pool.liquidityUsd, pool.total_liquidity_usd
  );
}

function extractYield(pool) {
  const explicitApy = firstFinite(pool.apy, pool.apy_annual);
  if (explicitApy !== null) return { value: explicitApy, metric: "apy" };

  const apr = firstFinite(
    pool.apr, pool.apr_annual, pool.fee_apr, pool.feeApr,
    pool.total_apr, pool.totalApr
  );
  return apr === null ? { value: null, metric: null } : { value: apr, metric: "apr" };
}

function candidateFor(pool) {
  const yieldData = extractYield(pool);
  return {
    address: poolAddress(pool),
    symbols: tokenSymbols(pool),
    poolType: poolType(pool) || null,
    tvlUsd: extractTvlUsd(pool),
    yieldRate: yieldData.value,
    yieldMetric: yieldData.metric,
    routerAddress: pool.router_address ?? pool.routerAddress ?? null
  };
}

function matches(entry, candidate) {
  const expected = entry.symbols.map(normalizeSymbol);
  const found = candidate.symbols;
  const matched = expected.filter((symbol) =>
    found.some((value) => value === symbol || value.includes(symbol) || symbol.includes(value))
  ).length;

  if (matched < expected.length) return false;
  if (entry.expectedPoolType && candidate.poolType &&
      !candidate.poolType.includes(entry.expectedPoolType.toLowerCase())) {
    return false;
  }
  return true;
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "TON-DeFi-Believers-Collector/0.2"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`STON.fi API returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function selectCandidate(entry, candidates, publishOnlyWhenUnique) {
  const ranked = [...candidates].sort(
    (a, b) => (b.tvlUsd ?? -1) - (a.tvlUsd ?? -1)
  );

  if (entry.rankByTvl) return ranked[entry.rankByTvl - 1] ?? null;
  if (ranked.length === 1) return ranked[0];
  return publishOnlyWhenUnique ? null : ranked[0] ?? null;
}

export async function collectStonfi({ configPath, opportunities }) {
  const config = await readJson(configPath);
  if (!config.enabled) {
    return { opportunities, report: { adapter: "stonfi", status: "disabled" } };
  }

  const checkedAt = nowIso();
  const url = new URL(config.endpoint, config.apiBaseUrl).toString();
  const payload = await fetchJson(url, config.timeoutMs);
  const pools = asArray(payload);
  const compact = pools.map(candidateFor).filter((pool) => pool.address);

  const discoveryReport = [];
  const selections = new Map();

  for (const entry of config.trackedPools) {
    if (entry.poolAddress) {
      const exact = compact.find((pool) => pool.address === entry.poolAddress) ?? null;
      selections.set(entry.opportunityId, exact);
      discoveryReport.push({
        opportunityId: entry.opportunityId,
        mode: "configured-address",
        selected: exact?.address ?? null,
        candidates: exact ? [exact] : []
      });
      continue;
    }

    const candidates = compact
      .filter((pool) => matches(entry, pool))
      .sort((a, b) => (b.tvlUsd ?? -1) - (a.tvlUsd ?? -1))
      .slice(0, config.discovery?.candidateLimitPerOpportunity ?? 8);

    const selected = selectCandidate(
      entry,
      candidates,
      config.discovery?.publishOnlyWhenUnique !== false
    );

    selections.set(entry.opportunityId, selected);
    discoveryReport.push({
      opportunityId: entry.opportunityId,
      mode: "automatic-discovery",
      selected: selected?.address ?? null,
      candidates
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
        url,
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
      externalId: pool.address
    };
  });

  await writeJsonAtomic(
    path.join(process.cwd(), "data", "stonfi-candidates.json"),
    {
      generatedAt: checkedAt,
      apiPoolsReceived: pools.length,
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
      apiPoolsReceived: pools.length,
      candidatesFile: "data/stonfi-candidates.json"
    }
  };
}
