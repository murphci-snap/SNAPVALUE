import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const partsDir = join(root, "src/lib/dfs/api-parts");
const out = join(root, "src/lib/dfs/api.ts");
const files = readdirSync(partsDir)
  .filter((f) => /^\d+\.txt$/.test(f))
  .sort((a, b) => Number(a.split(".")[0]) - Number(b.split(".")[0]));
if (!files.length) {
  console.error("concat-api: no parts in", partsDir);
  process.exit(1);
}
const body = files.map((f) => readFileSync(join(partsDir, f), "utf8")).join("");
writeFileSync(out, body);
console.log("concat-api: wrote", out, "from", files.length, "parts,", body.length, "bytes");
