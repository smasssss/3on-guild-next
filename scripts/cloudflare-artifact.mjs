import { readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2] || "dist/client/legacy.html";
const before = "const SHARED_DB_URL='https://threeon-next-staging.alswlgns2.chatgpt.site';";
const after = "const SHARED_DB_URL='';";
const source = readFileSync(path, "utf8");
if (!source.includes(before)) throw new Error(`Expected legacy API origin was not found in ${path}`);
writeFileSync(path, source.replace(before, after));
