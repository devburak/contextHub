#!/usr/bin/env node

import { NodeSSH } from 'node-ssh';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(rootDirectory, '.env');
if (!existsSync(envPath)) throw new Error('.env was not found');
dotenv.config({ path: envPath });

const config = {
  host: process.env.adminDeployServer,
  username: process.env.adminUser,
  password: process.env.adminPassword,
  remotePath: process.env.adminDeployPath?.replace(/\/+$/, ''),
};
for (const [key, value] of Object.entries(config)) {
  if (!value) throw new Error(`Missing admin rollback configuration: ${key}`);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

const ssh = new NodeSSH();
try {
  await ssh.connect({
    host: config.host,
    username: config.username,
    password: config.password,
    port: 22,
    tryKeyboard: true,
  });
  const current = shellQuote(config.remotePath);
  const previous = shellQuote(`${config.remotePath}.previous`);
  const next = shellQuote(`${config.remotePath}.rollback-next`);
  const old = shellQuote(`${config.remotePath}.rollback-old`);
  const result = await ssh.execCommand([
    'set -eu',
    `test -L ${current}`,
    `test -L ${previous}`,
    `current_target=$(readlink ${current})`,
    `previous_target=$(readlink ${previous})`,
    'test -d "$current_target"',
    'test -d "$previous_target"',
    `ln -sfn "$previous_target" ${next}`,
    `mv -Tf ${next} ${current}`,
    `ln -sfn "$current_target" ${old}`,
    `mv -Tf ${old} ${previous}`,
    'printf "%s\\n" "$previous_target"',
  ].join('\n'));
  if (result.code !== 0) throw new Error(result.stderr || 'Admin rollback failed');
  console.log(`Admin rollback completed: ${result.stdout.trim()}`);
} finally {
  ssh.dispose();
}
