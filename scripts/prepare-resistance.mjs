import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "public");
const target = path.join(root, "RESISTANCE_UPLOAD");

await fs.rm(target, { recursive: true, force: true });
await fs.mkdir(target, { recursive: true });
await fs.cp(source, target, { recursive: true });

console.log("Resistance package synchronized: RESISTANCE_UPLOAD/");
