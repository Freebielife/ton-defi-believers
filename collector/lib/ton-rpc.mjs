import { nowIso } from "./utils.mjs";

function stackEntries(payload) {
  return payload?.result?.stack ?? payload?.stack ?? [];
}

function stackValue(entry) {
  if (Array.isArray(entry)) return entry[1];
  return entry?.value ?? entry?.num ?? entry;
}

export function parseStackInt(entry) {
  const value = stackValue(entry);
  const raw = typeof value === "object"
    ? value?.value ?? value?.num ?? value?.hex ?? null
    : value;

  if (typeof raw === "number" && Number.isFinite(raw)) return BigInt(Math.trunc(raw));
  if (typeof raw !== "string") return null;

  const normalized = raw.trim();
  if (!normalized) return null;

  try {
    if (/^-?0x[0-9a-f]+$/i.test(normalized)) return BigInt(normalized);
    if (/^-?\d+$/.test(normalized)) return BigInt(normalized);
  } catch {
    return null;
  }

  return null;
}

export function stackIntAt(rpcResponse, index) {
  return parseStackInt(stackEntries(rpcResponse?.result ?? rpcResponse)[index]);
}

export async function runGetMethod({
  endpoint = process.env.TON_RPC_URL || "https://toncenter.com/api/v2/runGetMethod",
  apiKey = process.env.TONCENTER_API_KEY || "",
  address,
  method,
  stack = [],
  timeoutMs = 20000
}) {
  if (!address || !method) throw new Error("address and method are required");

  const url = new URL(endpoint);
  url.searchParams.set("address", address);
  url.searchParams.set("method", method);
  url.searchParams.set("stack", JSON.stringify(stack));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { accept: "application/json" };
    if (apiKey) headers["X-API-Key"] = apiKey;

    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`TON RPC returned HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.ok === false) {
      throw new Error(payload.error || "TON RPC get-method failed");
    }
    return {
      checkedAt: nowIso(),
      endpoint: url.origin,
      result: payload.result ?? payload
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyPoolReserves({
  address,
  method,
  reserveIndexes,
  apiReserves = [],
  timeoutMs = 20000,
  tolerancePercent = 2
}) {
  const rpc = await runGetMethod({ address, method, timeoutMs });
  const reserves = reserveIndexes.map((index) => stackIntAt(rpc, index));

  if (reserves.some((value) => value === null || value <= 0n)) {
    throw new Error(`${method} returned invalid reserves`);
  }

  const comparisons = reserves.map((onchain, index) => {
    const apiRaw = apiReserves[index];
    if (apiRaw === null || apiRaw === undefined || apiRaw === "") {
      return { comparable: false, withinTolerance: null, differencePercent: null };
    }

    let api;
    try {
      api = BigInt(String(apiRaw));
    } catch {
      return { comparable: false, withinTolerance: null, differencePercent: null };
    }

    if (api <= 0n) return { comparable: false, withinTolerance: null, differencePercent: null };
    const difference = onchain > api ? onchain - api : api - onchain;
    const basisPoints = Number((difference * 10000n) / api);
    const differencePercent = basisPoints / 100;
    return {
      comparable: true,
      withinTolerance: differencePercent <= tolerancePercent,
      differencePercent
    };
  });

  return {
    checkedAt: rpc.checkedAt,
    endpoint: rpc.endpoint,
    method,
    reserves: reserves.map(String),
    comparisons,
    passed: comparisons.every((item) => !item.comparable || item.withinTolerance)
  };
}
