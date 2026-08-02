import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const required = [
  "public/index.html",
  "public/app.js",
  "public/styles.css",
  "public/favicon.svg",
  "public/data/market-catalog.json"
];

const errors = [];
for (const relative of required) {
  try {
    await fs.access(path.join(root, relative));
  } catch {
    errors.push(`Отсутствует ${relative}`);
  }
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
if (JSON.stringify(marketCatalog).includes("startapp=ref_")) {
  errors.push("В публичном каталоге обнаружена реферальная ссылка");
}

if (errors.length) {
  console.error("Release check не пройден:");
  errors.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log("Release check пройден. Статический пакет готов к публикации.");
