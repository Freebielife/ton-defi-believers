import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "data");
const targetDir = path.join(root, "public", "data");
const protocolSourceDir = path.join(root, "data", "protocols");
const protocolTargetDir = path.join(root, "public", "data", "protocols");

const publishedFiles = [
  "opportunities.json",
  "protocols.json",
  "core-config.json",
  "stats.json",
  "changes.json",
  "history.json",
  "collector-report.json",
  "integration-status.json",
  "source-audit.json",
  "stonfi-candidates.json",
  "dedust-pools.json",
  "dedust-candidates.json"
];

await fs.mkdir(targetDir, { recursive: true });

for (const filename of publishedFiles) {
  const source = path.join(sourceDir, filename);
  const target = path.join(targetDir, filename);
  try {
    await fs.copyFile(source, target);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    console.warn(`Пропущен отсутствующий файл: ${filename}`);
  }
}

console.log(`Данные синхронизированы в public/data: ${publishedFiles.length} файлов.`);


try {
  await fs.mkdir(protocolTargetDir, { recursive: true });
  const protocolFiles = await fs.readdir(protocolSourceDir);
  for (const filename of protocolFiles.filter((name) => name.endsWith(".json"))) {
    await fs.copyFile(
      path.join(protocolSourceDir, filename),
      path.join(protocolTargetDir, filename)
    );
  }
  console.log(`Protocol snapshots synchronized: ${protocolFiles.length}.`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  console.warn("No protocol snapshots found yet.");
}
