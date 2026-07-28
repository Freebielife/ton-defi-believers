import assert from "node:assert/strict";
import { parseStackInt, stackIntAt } from "../lib/ton-rpc.mjs";

assert.equal(parseStackInt(["num", "0x3e8"]), 1000n);
assert.equal(parseStackInt(["num", "2500"]), 2500n);
assert.equal(parseStackInt({ type: "num", value: "0x2a" }), 42n);
assert.equal(parseStackInt({ num: "17" }), 17n);
assert.equal(parseStackInt(["cell", { bytes: "" }]), null);
assert.equal(parseStackInt(null), null);

const toncenterPayload = {
  result: {
    stack: [
      ["num", "0x0"],
      ["slice", { bytes: "" }],
      ["num", "0x64"],
      ["num", "0x3b9aca00"],
      ["num", "0x1dcd6500"]
    ]
  }
};
assert.equal(stackIntAt(toncenterPayload, 3), 1000000000n);
assert.equal(stackIntAt(toncenterPayload, 4), 500000000n);

console.log("TON RPC stack parsing tests passed.");
