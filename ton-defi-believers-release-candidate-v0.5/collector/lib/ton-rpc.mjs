import { nowIso } from "./utils.mjs";

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
