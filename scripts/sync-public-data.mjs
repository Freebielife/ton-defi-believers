import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "data");
const targetDir = path.join(root, "public", "data");
const files = [
  "protocols.json",
  "changes.json",
  "core-config.json",
  "collector-report.json",
  "health.json",
  "health-history.json",
  "stats.json",
  "history.json",
  "opportunities.json",
  "integration-status.json",
  "source-audit.json",
  "metrics.json",
  "rankings.json",
  "search-index.json",
  "stonfi-candidates.json",
  "dedust-pools.json",
  "dedust-candidates.json"
];

await fs.mkdir(targetDir, { recursive: true });
let copied = 0;
for (const filename of files) {
  try {
    await fs.copyFile(
      path.join(sourceDir, filename),
      path.join(targetDir, filename)
    );
    copied += 1;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function copyJsonDirectory(name) {
  const source = path.join(sourceDir, name);
  const target = path.join(targetDir, name);

  try {
    await fs.mkdir(target, { recursive: true });
    const filenames = await fs.readdir(source);
    let count = 0;
    for (const filename of filenames.filter((item) =>
      item.endsWith(".json")
    )) {
      await fs.copyFile(
        path.join(source, filename),
        path.join(target, filename)
      );
      count += 1;
    }

    console.log(`${name}: synchronized ${count} JSON files.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    console.warn(`${name}: no generated files yet.`);
  }
}

for (const directory of ["protocols", "normalized", "published"]) {
  await copyJsonDirectory(directory);
}

console.log(`Public data synchronized: ${copied} top-level files.`);
