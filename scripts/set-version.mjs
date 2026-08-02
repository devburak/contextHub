#!/usr/bin/env node
/**
 * Keeps the core version in sync across the workspace.
 *
 * The deployable core (root, apps/*, packages/common) carries a single version
 * number, and that number is what a git tag points at. `@contexthub/promo-sdk`
 * is deliberately excluded: it is a separately published SDK with its own
 * release cadence, and forcing it to the core version would be a downgrade.
 *
 * Usage:
 *   node scripts/set-version.mjs 0.1.1     # write the version everywhere
 *   node scripts/set-version.mjs --check   # verify everything is in sync (CI)
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function packageManifestsUnder(relDir) {
  const absDir = join(rootDir, relDir);
  return readdirSync(absDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(relDir, entry.name, 'package.json'))
    .filter((relPath) => existsSync(join(rootDir, relPath)))
    .sort();
}

// The deployable core uses one version. New apps are discovered automatically;
// packages remain opt-in because some of them (such as promo-sdk) are published
// independently.
const TARGETS = ['package.json', ...packageManifestsUnder('apps'), 'packages/common/package.json'];

// Independently versioned and published; never touched by this script.
const EXCLUDED = ['packages/promo-sdk/package.json'];

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const VERSION_LINE = /("version"\s*:\s*")([^"]+)(")/;

const log = (message) => console.log(`[set-version] ${message}`);

function readTarget(relPath) {
  const absPath = join(rootDir, relPath);
  const raw = readFileSync(absPath, 'utf8');
  const match = raw.match(VERSION_LINE);
  if (!match) {
    throw new Error(`${relPath}: no "version" field found`);
  }
  return { relPath, absPath, raw, current: match[2] };
}

function check(targets) {
  const versions = new Map();
  for (const target of targets) {
    if (!versions.has(target.current)) {
      versions.set(target.current, []);
    }
    versions.get(target.current).push(target.relPath);
  }

  if (versions.size === 1) {
    const [version] = versions.keys();
    log(`OK — all ${targets.length} core manifests are at ${version}`);
    return 0;
  }

  log('MISMATCH — core manifests report different versions:');
  for (const [version, files] of versions) {
    console.log(`  ${version}  ${files.join(', ')}`);
  }
  log('Run: node scripts/set-version.mjs <version>');
  return 1;
}

function write(targets, nextVersion) {
  let changed = 0;
  for (const target of targets) {
    if (target.current === nextVersion) {
      log(`${target.relPath}: already ${nextVersion}`);
      continue;
    }
    const updated = target.raw.replace(VERSION_LINE, `$1${nextVersion}$3`);
    writeFileSync(target.absPath, updated);
    log(`${target.relPath}: ${target.current} -> ${nextVersion}`);
    changed += 1;
  }

  log(`${changed} file(s) updated. Untouched: ${EXCLUDED.join(', ')}`);
  if (changed > 0) {
    log('Next:');
    console.log(`  git commit -am "chore(release): v${nextVersion}"`);
    console.log(`  git tag -a v${nextVersion} -m "v${nextVersion}"`);
  }
  return 0;
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node scripts/set-version.mjs <version|--check>');
    process.exit(2);
  }

  const targets = TARGETS.map(readTarget);

  if (arg === '--check') {
    process.exit(check(targets));
  }

  const nextVersion = arg.replace(/^v/, '');
  if (!SEMVER.test(nextVersion)) {
    console.error(`[set-version] Invalid version: ${arg} (expected MAJOR.MINOR.PATCH)`);
    process.exit(2);
  }

  process.exit(write(targets, nextVersion));
}

try {
  main();
} catch (error) {
  console.error(`[set-version] ${error.message}`);
  console.error(`[set-version] Working directory: ${relative(process.cwd(), rootDir) || '.'}`);
  process.exit(1);
}
