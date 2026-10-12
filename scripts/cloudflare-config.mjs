import { writeFileSync } from "node:fs";

const [output, workerName, databaseName, databaseId] = process.argv.slice(2);
if (!output || !workerName || !databaseName || !/^[0-9a-f-]{36}$/i.test(databaseId || "")) {
  throw new Error("Usage: cloudflare-config.mjs <output> <worker> <database> <database-id>");
}

const config = {
  $schema: "./node_modules/wrangler/config-schema.json",
  name: workerName,
  main: "dist/server/index.js",
  compatibility_date: "2026-05-15",
  compatibility_flags: ["nodejs_compat"],
  no_bundle: true,
  rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
  assets: { directory: "dist/client" },
  d1_databases: [{
    binding: "DB",
    database_name: databaseName,
    database_id: databaseId,
    migrations_dir: "drizzle",
  }],
  observability: { enabled: true },
};

writeFileSync(output, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
