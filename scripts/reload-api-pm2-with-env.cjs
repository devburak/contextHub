#!/usr/bin/env node
// Check the running API env, or reload it from .env without exposing secret values.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");

const apiRoot = path.resolve(__dirname, "..");
const processName = "contexthub-api";
const mode = process.argv[2] || "--check";

function requireSuccess(result, action) {
  if (result.status !== 0) throw new Error(`${action} failed`);
}

function runPm2(args, env = process.env) {
  return spawnSync("pm2", args, {
    cwd: apiRoot,
    env,
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function listApiProcesses() {
  const result = runPm2(["jlist"]);
  requireSuccess(result, "PM2 list");
  const processes = JSON.parse(result.stdout).filter(
    (item) => item.name === processName,
  );
  if (!processes.length) throw new Error("API process missing");
  return processes;
}

function compare(processes, expected) {
  const driftKeys = [
    ...new Set(
      processes.flatMap(({ pm2_env: actual = {} }) =>
        Object.keys(expected).filter(
          (key) => String(actual[key] ?? "") !== expected[key],
        ),
      ),
    ),
  ].sort();
  const online = processes.filter(
    ({ pm2_env }) => pm2_env?.status === "online",
  ).length;
  return { processes: processes.length, online, driftKeys };
}

function restrictDumpFiles() {
  const pm2Home = process.env.PM2_HOME || path.join(os.homedir(), ".pm2");
  for (const name of ["dump.pm2", "dump.pm2.bak"]) {
    const filename = path.join(pm2Home, name);
    if (fs.existsSync(filename)) fs.chmodSync(filename, 0o600);
  }
}

function main() {
  if (!["--check", "--reload"].includes(mode) || process.argv.length > 3) {
    throw new Error("Usage: reload-api-pm2-with-env.cjs [--check|--reload]");
  }
  const expected = dotenv.parse(fs.readFileSync(path.join(apiRoot, ".env")));
  if (!expected.MONGODB_URI) throw new Error("MONGODB_URI missing from .env");

  if (mode === "--reload") {
    // Reloading by ecosystem file preserved inherited PM2 env on this host.
    // The process-name path with --update-env uses these explicit values.
    const result = runPm2(["reload", processName, "--update-env"], {
      ...process.env,
      ...expected,
    });
    requireSuccess(result, "PM2 reload");
  }

  const state = compare(listApiProcesses(), expected);
  console.log(JSON.stringify({ action: mode.slice(2), ...state }));
  if (state.driftKeys.length || state.online !== state.processes) {
    process.exitCode = 1;
    return;
  }
  if (mode === "--reload") {
    requireSuccess(runPm2(["save"]), "PM2 save");
    restrictDumpFiles();
    console.log(JSON.stringify({ action: "save", status: "ok" }));
  }
}

try {
  main();
} catch (error) {
  // PM2 and driver errors may contain an env value; never print the message.
  console.error(
    JSON.stringify({ action: mode.slice(2), errorType: error.name || "Error" }),
  );
  process.exitCode = 1;
}
