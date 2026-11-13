/** One-off: write Call.territories / Call.beneficiaryTypes (CCR-5/6) into data/calls/calls.json. */
import fs from "node:fs";
import path from "node:path";
import { Call } from "@/contracts";
import { withCanonicalCallFields } from "@/features/normalize";

const file = path.resolve(process.cwd(), process.argv[2] ?? "data/calls/calls.json");
const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown[];
const out = raw.map((x) => withCanonicalCallFields(Call.parse(x)));
fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
console.log(`backfilled ${out.length} calls in ${path.relative(process.cwd(), file)}`);
