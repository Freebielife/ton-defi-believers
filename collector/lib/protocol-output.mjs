import path from "node:path";
import { writeJsonAtomic } from "./utils.mjs";

export async function writeProtocolSnapshot(protocolId, payload) {
  const file = path.join(
    process.cwd(),
    "data",
    "protocols",
    `${protocolId}.json`
  );

  await writeJsonAtomic(file, payload);
  return `data/protocols/${protocolId}.json`;
}
