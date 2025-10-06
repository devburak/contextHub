#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");

const [tool, ...toolArgs] = process.argv.slice(2);
if (!tool) {
  console.error("Usage: node scripts/run-tool.mjs <binary> [...args]");
  process.exit(1);
}

const binName = process.platform === "win32" ? `${tool}.cmd` : tool;
const binPath = resolve(rootDir, "node_modules", ".bin", binName);

if (!existsSync(binPath)) {
  console.error(`Unable to find ${tool} at ${binPath}. Did you run pnpm install?`);
  process.exit(1);
}

const result = spawnSync(binPath, toolArgs, {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
