import path from "node:path";
import { readJson } from "./lib/utils.mjs";

const document = await readJson(path.join(process.cwd(), "data", "opportunities.json"));
const errors = [];
const warnings = [];
const ids = new Set();

for (const [index, item] of document.opportunities.entries()) {
  const label = item.id ?? `index:${index}`;

  if (!item.id) errors.push(`${label}: отсутствует id`);
  if (ids.has(item.id)) errors.push(`${label}: дублирующийся id`);
  ids.add(item.id);

  if (!item.protocol) errors.push(`${label}: отсутствует protocol`);
  if (!item.category) errors.push(`${label}: отсутствует category`);
  if (!item.type) errors.push(`${label}: отсутствует type`);

  if (item.tvlUsd !== null && item.tvlUsd !== undefined) {
    if (!Number.isFinite(Number(item.tvlUsd)) || Number(item.tvlUsd) < 0) {
      errors.push(`${label}: некорректный TVL`);
    }
  }

  const currentApy = item.apy?.current;
  if (currentApy !== null && currentApy !== undefined) {
    if (!Number.isFinite(Number(currentApy))) {
      errors.push(`${label}: некорректный APY`);
    } else if (Number(currentApy) < 0) {
      warnings.push(`${label}: отрицательная доходность`);
    } else if (Number(currentApy) > 1000) {
      warnings.push(`${label}: APY выше 1000%, требуется проверка`);
    }
  }

  if (!item.links?.official && !item.links?.app) {
    warnings.push(`${label}: отсутствует официальная ссылка`);
  }
}

if (warnings.length) {
  console.warn("Предупреждения:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length) {
  console.error("Ошибки:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Проверено возможностей: ${document.opportunities.length}. Критических ошибок нет.`);
