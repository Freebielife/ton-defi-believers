import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "data", "market-catalog.json");
const targetDir = path.join(root, "public", "data");
const target = path.join(targetDir, "market-catalog.json");

await fs.rm(targetDir, { recursive: true, force: true });
await fs.mkdir(targetDir, { recursive: true });
await fs.copyFile(source, target);

console.log("Public data synchronized: market-catalog.json only.");
