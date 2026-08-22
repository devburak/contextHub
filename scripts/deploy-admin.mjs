#!/usr/bin/env node

import { NodeSSH } from 'node-ssh';
import { dirname, join } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';

import { resolveReleaseIdentity } from './lib/release-identity.mjs';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(rootDirectory, '.env');
if (!existsSync(envPath)) throw new Error('.env was not found');
dotenv.config({ path: envPath });

function cliValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function verifyProductionBuild(localPath) {
  const assetsPath = join(localPath, 'assets');
  if (!existsSync(join(localPath, 'index.html')) || !existsSync(assetsPath)) {
    throw new Error(`Production admin build is incomplete: ${localPath}`);
  }
  const forbiddenApiUrls = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  for (const asset of readdirSync(assetsPath).filter((file) => file.endsWith('.js'))) {
    const contents = readFileSync(join(assetsPath, asset), 'utf8');
    const forbiddenUrl = forbiddenApiUrls.find((url) => contents.includes(url));
    if (forbiddenUrl) {
      throw new Error(`${asset} contains a non-production API URL: ${forbiddenUrl}`);
    }
  }
}

const identity = resolveReleaseIdentity(rootDirectory, cliValue('--release'));
const config = {
  host: process.env.adminDeployServer,
  username: process.env.adminUser,
  password: process.env.adminPassword,
  remotePath: process.env.adminDeployPath?.replace(/\/+$/, ''),
  localPath: join(rootDirectory, 'apps/admin/dist'),
};
for (const [key, value] of Object.entries(config)) {
  if (!value) throw new Error(`Missing admin deploy configuration: ${key}`);
}
verifyProductionBuild(config.localPath);

const releaseRoot = process.env.adminDeployReleaseRoot?.replace(/\/+$/, '')
  || `${config.remotePath}.releases`;
const releasePath = `${releaseRoot}/${identity.releaseId}`;
const previousPath = `${config.remotePath}.previous`;
const nextPath = `${config.remotePath}.next-${identity.releaseId}`;
const previousNextPath = `${config.remotePath}.previous-next-${identity.releaseId}`;

console.log(`Admin release: ${identity.tag} (${identity.commit})`);
console.log(`Upload target: ${config.username}@${config.host}:${releasePath}`);

const ssh = new NodeSSH();
try {
  await ssh.connect({
    host: config.host,
    username: config.username,
    password: config.password,
    port: 22,
    tryKeyboard: true,
  });

  const prepare = await ssh.execCommand([
    'set -eu',
    `mkdir -p ${shellQuote(releaseRoot)}`,
    `test ! -e ${shellQuote(releasePath)}`,
    `mkdir ${shellQuote(releasePath)}`,
  ].join('\n'));
  if (prepare.code !== 0) {
    throw new Error(prepare.stderr || `Immutable release already exists: ${releasePath}`);
  }

  const uploaded = await ssh.putDirectory(config.localPath, releasePath, {
    recursive: true,
    concurrency: 10,
    validate: (itemPath) => {
      const baseName = itemPath.split('/').pop();
      return baseName !== '.DS_Store' && !baseName.startsWith('.');
    },
  });
  if (!uploaded) throw new Error('Admin artifact upload failed');

  const legacyPath = `${releaseRoot}/legacy-${Date.now()}`;
  const cutover = await ssh.execCommand([
    'set -eu',
    `test -f ${shellQuote(`${releasePath}/index.html`)}`,
    `chmod -R a=rX,u+w ${shellQuote(releasePath)}`,
    'old_target=""',
    `if [ -L ${shellQuote(config.remotePath)} ]; then`,
    `  old_target=$(readlink ${shellQuote(config.remotePath)})`,
    `elif [ -e ${shellQuote(config.remotePath)} ]; then`,
    `  mv ${shellQuote(config.remotePath)} ${shellQuote(legacyPath)}`,
    `  old_target=${shellQuote(legacyPath)}`,
    'fi',
    `ln -s ${shellQuote(releasePath)} ${shellQuote(nextPath)}`,
    `mv -Tf ${shellQuote(nextPath)} ${shellQuote(config.remotePath)}`,
    'if [ -n "$old_target" ]; then',
    `  ln -s "$old_target" ${shellQuote(previousNextPath)}`,
    `  mv -Tf ${shellQuote(previousNextPath)} ${shellQuote(previousPath)}`,
    'fi',
    `readlink ${shellQuote(config.remotePath)}`,
  ].join('\n'));
  if (cutover.code !== 0) throw new Error(cutover.stderr || 'Atomic admin cutover failed');

  console.log(`Admin cutover completed: ${cutover.stdout.trim()}`);
  console.log('Rollback: pnpm rollback:admin');
} finally {
  ssh.dispose();
}
