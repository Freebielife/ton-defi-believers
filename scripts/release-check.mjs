import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const requiredPublic = [
  "public/index.html",
  "public/app.js",
  "public/styles.css",
  "public/assets/brand/favicon.png",
  "public/assets/brand/ton-defi-believers.png",
  "public/data/market-catalog.json"
];
const requiredResistance = requiredPublic.map((item) => item.replace(/^public\//, "RESISTANCE_UPLOAD/"));
const errors = [];

for (const relative of [...requiredPublic, ...requiredResistance]) {
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
const publicJson = JSON.stringify(marketCatalog);
if (/startapp=ref_|[?&]ref=|[?&]referral=/i.test(publicJson)) {
  errors.push("В публичном каталоге обнаружена реферальная ссылка");
}

async function listFiles(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(full));
    else result.push(full);
  }
  return result;
}

const resistanceFiles = await listFiles(path.join(root, "RESISTANCE_UPLOAD"));
if (resistanceFiles.length > 25) {
  errors.push(`Resistance-пакет содержит ${resistanceFiles.length} файлов; лимит — 25`);
}

for (const relative of ["public/app.js", "public/index.html"]) {
  const content = await fs.readFile(path.join(root, relative), "utf8");
  if (/startapp=ref_|[?&]ref=|[?&]referral=/i.test(content)) {
    errors.push(`Реферальная ссылка обнаружена в ${relative}`);
  }
}

if (errors.length) {
  console.error("Release check не пройден:");
  errors.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Release check пройден. Возможностей: ${marketCatalog.opportunities.length}. Resistance-файлов: ${resistanceFiles.length}.`);
