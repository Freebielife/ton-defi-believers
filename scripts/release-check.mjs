import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const required = [
  "public/data/opportunities.json",
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

if (errors.length) {
  console.error("Release check не пройден:");
  errors.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log("Release check пройден. Пакет готов к загрузке в GitHub.");
