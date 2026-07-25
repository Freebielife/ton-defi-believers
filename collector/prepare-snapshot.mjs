import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "data", "opportunities.json");
const target = path.join(root, "data", "opportunities.previous.json");

try {
  await fs.copyFile(source, target);
  console.log("Создан снимок предыдущих данных.");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  console.log("Предыдущих данных пока нет.");
}
