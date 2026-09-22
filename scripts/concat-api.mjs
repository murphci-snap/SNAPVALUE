import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const partsDir = join(root, "src/lib/dfs/api-parts");
const out = join(root, "src/lib/dfs/api.ts");

const names = readdirSync(partsDir);
const txtParts = names.filter((f) => /^\d+\.txt$/.test(f)).sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]));
const b64Parts = names.filter((f) => /^\d+-\d+\.b64$/.test(f)).sort((a, b) => {
  const [ai, aj] = a.replace(".b64", "").split("-").map(Number);
  const [bi, bj] = b.replace(".b64", "").split("-").map(Number);
  return ai - bi || aj - bj;
});

let body;
if (b64Parts.length) {
  const groups = new Map();
  for (const f of b64Parts) {
    const [i] = f.replace(".b64", "").split("-").map(Number);
    if (!groups.has(i)) groups.set(i, []);
    groups.get(i).push(f);
  }
  const indices = [...groups.keys()].sort((a, b) => a - b);
  body = indices
    .map((i) => {
      const b64 = groups.get(i).map((f) => readFileSync(join(partsDir, f), "utf8")).join("");
      return Buffer.from(b64, "base64").toString("utf8");
    })
    .join("");
} else if (txtParts.length) {
  body = txtParts.map((f) => readFileSync(join(partsDir, f), "utf8")).join("");
} else {
  console.error("concat-api: no parts in", partsDir);
  process.exit(1);
}
writeFileSync(out, body);
console.log("concat-api: wrote", out, body.length, "bytes");
