#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';

import { resolveHostedAdminBuild } from './lib/hosted-admin-build.mjs';

const coreRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(coreRoot, '.env') });

const hosted = resolveHostedAdminBuild({ coreRoot, env: process.env });
const childEnv = {
  ...process.env,
  CTXHUB_REQUIRE_ADMIN_PLUGINS: 'true',
  CTXHUB_ADMIN_PLUGIN_ENTRY: hosted.entry,
  CTXHUB_ADMIN_PLUGIN_SOURCE: JSON.stringify(hosted.sources),
  CTXHUB_ADMIN_PLUGIN_NAMES: hosted.plugins.join(','),
};

process.stdout.write(`Hosted Admin plugins: ${hosted.plugins.join(', ')}\n`);
const result = spawnSync('pnpm', ['--filter', '@contexthub/admin', 'build'], {
  cwd: coreRoot,
  env: childEnv,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
