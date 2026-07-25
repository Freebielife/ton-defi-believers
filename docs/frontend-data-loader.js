export async function loadDefiData(base = "/data") {
  const files = [
    "opportunities",
    "stats",
    "integration-status",
    "changes"
  ];

  const entries = await Promise.all(
    files.map(async (name) => {
      const response = await fetch(`${base}/${name}.json`, {
        headers: { accept: "application/json" }
      });
      if (!response.ok) {
        throw new Error(`Не удалось загрузить ${name}.json: HTTP ${response.status}`);
      }
      return [name, await response.json()];
    })
  );

  return Object.fromEntries(entries);
}

export function dataFreshness(isoDate, staleAfterHours = 3) {
  const time = Date.parse(isoDate);
  if (!Number.isFinite(time)) return "unknown";
  return Date.now() - time > staleAfterHours * 60 * 60 * 1000
    ? "stale"
    : "fresh";
}
