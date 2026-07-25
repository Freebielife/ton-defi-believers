import { nowIso, readJson } from "../lib/utils.mjs";

export async function collectProtocolPlaceholder({ adapter, configPath, opportunities, source }) {
  const config = await readJson(configPath);
  if (!config.enabled) return { opportunities, report: { adapter, status: "disabled" } };

  const tracked = new Set(config.trackedOpportunityIds ?? []);
  const retained = opportunities.filter((item) => tracked.has(item.id)).length;

  return {
    opportunities,
    report: {
      adapter,
      protocol: source.name,
      status: source.status,
      mode: source.mode,
      retainedExistingRecords: retained,
      automaticUpdates: 0,
      checkedAt: nowIso(),
      message: "Источник изолирован от других протоколов. Существующие данные сохранены до проверки официального endpoint или on-chain контракта."
    }
  };
}
