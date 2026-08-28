#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';

import { resolveHostedAdminBuild } from './lib/hosted-admin-build.mjs';

const coreRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(coreRoot, '.env') });
const hosted = resolveHostedAdminBuild({ coreRoot, env: process.env });

if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI is required to verify paid plugin entitlements');
}

const result = spawnSync('pnpm', ['entitlements:paid-plugins:verify'], {
  cwd: hosted.commercialRoot,
  env: process.env,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
