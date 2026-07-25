import { finiteNumber } from "../lib/utils.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

export function clamp(value, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function ageHours(isoDate, now = new Date()) {
  if (!isoDate) return null;
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, (now.getTime() - timestamp) / (60 * 60 * 1000));
}

export function apyFromApr(aprPercent, compoundsPerYear = 365) {
  const apr = finiteNumber(aprPercent);
  const periods = finiteNumber(compoundsPerYear);
  if (apr === null || periods === null || periods <= 0) return null;

  const rate = apr / 100;
  return ((1 + rate / periods) ** periods - 1) * 100;
}

export function aprFromFeeRevenue({
  volumeUsd,
  feePercent,
  providerSharePercent = 100,
  tvlUsd,
  periodDays = 1
}) {
  const volume = finiteNumber(volumeUsd);
  const fee = finiteNumber(feePercent);
  const providerShare = finiteNumber(providerSharePercent);
  const tvl = finiteNumber(tvlUsd);
  const days = finiteNumber(periodDays);

  if (
    volume === null ||
    fee === null ||
    providerShare === null ||
    tvl === null ||
    days === null ||
    volume < 0 ||
    fee < 0 ||
    providerShare < 0 ||
    providerShare > 100 ||
    tvl <= 0 ||
    days <= 0
  ) {
    return null;
  }

  const providerRevenue =
    volume * (fee / 100) * (providerShare / 100);

  return (providerRevenue / tvl) * (365 / days) * 100;
}

export function calculateTvlUsd(reserves = []) {
  if (!Array.isArray(reserves) || reserves.length === 0) return null;

  let total = 0;
  for (const reserve of reserves) {
    const amount = finiteNumber(reserve?.amount);
    const priceUsd = finiteNumber(reserve?.priceUsd);
    if (amount === null || priceUsd === null || amount < 0 || priceUsd < 0) {
      return null;
    }
    total += amount * priceUsd;
  }

  return total;
}

export function yieldOrigin(opportunity) {
  const sourceType = opportunity?.source?.type;
  const metric = opportunity?.apy?.metric;

  if (sourceType === "api" && metric === "apy") return "protocol-reported-apy";
  if (sourceType === "api" && metric === "apr") return "protocol-reported-apr";
  if (sourceType === "calculated") return "aggregator-calculated";
  if (sourceType === "manual") return "manual-snapshot";
  return "unknown";
}

export function confidenceScore(opportunity, now = new Date()) {
  let score = 20;
  const reasons = [];

  const sourceType = opportunity?.source?.type;
  if (sourceType === "api") {
    score += 35;
    reasons.push("automatic-source");
  } else if (sourceType === "calculated") {
    score += 30;
    reasons.push("calculated-from-machine-readable-data");
  } else if (sourceType === "manual") {
    score += 10;
    reasons.push("manual-source");
  }

  const checkedAt =
    opportunity?.source?.lastChecked ??
    opportunity?.source?.calculatedAt ??
    opportunity?.source?.importedAt;

  const hours = ageHours(checkedAt, now);
  if (hours !== null && hours <= 6) {
    score += 20;
    reasons.push("fresh-within-6h");
  } else if (hours !== null && hours <= 24) {
    score += 12;
    reasons.push("fresh-within-24h");
  } else if (hours !== null && hours <= 72) {
    score += 5;
    reasons.push("fresh-within-72h");
  } else {
    reasons.push("old-or-undated-source");
  }

  if (finiteNumber(opportunity?.tvlUsd) !== null) {
    score += 10;
    reasons.push("tvl-available");
  }

  if (finiteNumber(opportunity?.apy?.current) !== null) {
    score += 10;
    reasons.push("yield-available");
  }

  if (opportunity?.externalId) {
    score += 5;
    reasons.push("contract-or-pool-identified");
  }

  if (opportunity?.status?.sourceError) {
    score -= 35;
    reasons.push("source-error");
  }

  if (opportunity?.status?.stale) {
    score -= 20;
    reasons.push("marked-stale");
  }

  if (opportunity?.status?.requiresDisambiguation) {
    score -= 30;
    reasons.push("requires-disambiguation");
  }

  score = clamp(Math.round(score));

  return {
    score,
    grade:
      score >= 85 ? "A" :
      score >= 70 ? "B" :
      score >= 50 ? "C" :
      score >= 30 ? "D" : "E",
    reasons
  };
}

export function riskAssessment(opportunity) {
  const flags = [];
  let score = 0;

  const type = String(opportunity?.type ?? "").toLowerCase();
  if (type.includes("farm") || type.includes("liquidity")) {
    score += 25;
    flags.push("impermanent-loss-or-lp-risk");
  }

  if (type.includes("borrow") || type.includes("lending")) {
    score += 15;
    flags.push("liquidation-or-utilization-risk");
  }

  const tvl = finiteNumber(opportunity?.tvlUsd);
  if (tvl !== null && tvl < 100_000) {
    score += 25;
    flags.push("low-tvl");
  } else if (tvl !== null && tvl < 1_000_000) {
    score += 10;
    flags.push("moderate-tvl");
  } else if (tvl === null) {
    score += 10;
    flags.push("unknown-tvl");
  }

  const currentYield = finiteNumber(opportunity?.apy?.current);
  if (currentYield !== null && currentYield > 100) {
    score += 25;
    flags.push("very-high-yield");
  } else if (currentYield !== null && currentYield > 40) {
    score += 10;
    flags.push("high-yield");
  }

  if (opportunity?.status?.stale) {
    score += 15;
    flags.push("stale-data");
  }

  if (opportunity?.status?.requiresDisambiguation) {
    score += 30;
    flags.push("unverified-pool");
  }

  score = clamp(score);

  return {
    score,
    level:
      score >= 70 ? "very-high" :
      score >= 45 ? "high" :
      score >= 25 ? "medium" : "low",
    flags
  };
}

export function enrichOpportunity(opportunity, now = new Date()) {
  const confidence = confidenceScore(opportunity, now);
  const risk = riskAssessment(opportunity);
  const current = finiteNumber(opportunity?.apy?.current);
  const metric = opportunity?.apy?.metric ?? "apy";

  return {
    ...opportunity,
    metrics: {
      yield: {
        value: current,
        metric,
        origin: yieldOrigin(opportunity),
        apyEquivalent:
          current === null
            ? null
            : metric === "apr"
              ? apyFromApr(current)
              : current
      },
      tvlUsd: finiteNumber(opportunity?.tvlUsd),
      confidence,
      risk
    }
  };
}
