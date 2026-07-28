import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const required = [
  "public/data/opportunities.json",
  "public/data/market-catalog.json",
  "public/data/protocols.json",
  "public/data/stats.json",
  "public/data/integration-status.json",
  "public/data/source-audit.json",
  ".github/workflows/update-data.yml"
];

const errors = [];
for (const relative of required) {
  try {
    await fs.access(path.join(root, relative));
  } catch {
    errors.push(`Отсутствует ${relative}`);
  }
}

const sourceAudit = JSON.parse(
  await fs.readFile(path.join(root, "public/data/source-audit.json"), "utf8")
);
if (!sourceAudit.policyPassed) {
  errors.push("Проверка независимости источников не пройдена");
}

const opportunities = JSON.parse(
  await fs.readFile(path.join(root, "public/data/opportunities.json"), "utf8")
);
if (!Array.isArray(opportunities.opportunities) || !opportunities.opportunities.length) {
  errors.push("Список opportunities пуст");
}


const marketCatalog = JSON.parse(
  await fs.readFile(path.join(root, "public/data/market-catalog.json"), "utf8")
);
if (!Array.isArray(marketCatalog.opportunities) || marketCatalog.opportunities.length < 20) {
  errors.push("Рыночный каталог содержит меньше 20 возможностей");
}
if (!marketCatalog.opportunities.every((item) => Number.isFinite(item.tvlUsd))) {
  errors.push("В рыночном каталоге есть возможности без TVL");
}

if (errors.length) {
  console.error("Release check не пройден:");
  errors.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log("Release check пройден. Пакет готов к загрузке в GitHub.");
