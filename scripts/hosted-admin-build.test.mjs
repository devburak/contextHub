import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  assertHostedAdminBuild,
  parseAdminBuildContract,
  resolveHostedAdminBuild,
  resolveHostedRequiredPlugins,
} from './lib/hosted-admin-build.mjs';

test('discovers hosted Admin plugins from commercial manifests', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'ctxhub-hosted-admin-'));
  const coreRoot = join(workspace, 'contextHub');
  const commercialRoot = join(workspace, 'ctxhub-commercial');
  const entry = join(commercialRoot, 'admin/src/index.jsx');
  try {
    mkdirSync(join(commercialRoot, 'admin/src'), { recursive: true });
    mkdirSync(join(commercialRoot, 'plugins/semantic-search'), { recursive: true });
    mkdirSync(join(commercialRoot, 'plugins/tenant-backup'), { recursive: true });
    mkdirSync(coreRoot, { recursive: true });
    writeFileSync(entry, 'export default () => []\n');
    writeFileSync(
      join(commercialRoot, 'plugins/semantic-search/plugin.manifest.json'),
      JSON.stringify({ name: 'semantic-search', entrypoints: { admin: './admin/src/index.jsx' } }),
    );
    writeFileSync(
      join(commercialRoot, 'plugins/tenant-backup/plugin.manifest.json'),
      JSON.stringify({ name: 'tenant-backup', entrypoints: { admin: './admin/src/index.jsx' } }),
    );

    const result = resolveHostedAdminBuild({ coreRoot, env: {} });
    assert.equal(result.entry, entry);
    assert.deepEqual(result.plugins, ['semantic-search', 'tenant-backup']);
    assert.deepEqual(result.requiredPlugins, ['semantic-search', 'tenant-backup']);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('requires the paid plugin baseline and merges configured requirements', () => {
  assert.deepEqual(
    resolveHostedRequiredPlugins({ CTXHUB_REQUIRED_PLUGINS: 'audit-log, semantic-search' }),
    ['audit-log', 'semantic-search', 'tenant-backup'],
  );
  assert.throws(
    () => resolveHostedRequiredPlugins({ CTXHUB_REQUIRED_PLUGINS: '../invalid' }),
    /invalid plugin names/,
  );
});

test('rejects a hosted plugin catalogue missing a required plugin', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'ctxhub-hosted-admin-missing-'));
  const coreRoot = join(workspace, 'contextHub');
  const commercialRoot = join(workspace, 'ctxhub-commercial');
  try {
    mkdirSync(join(commercialRoot, 'admin/src'), { recursive: true });
    mkdirSync(join(commercialRoot, 'plugins/semantic-search'), { recursive: true });
    mkdirSync(coreRoot, { recursive: true });
    writeFileSync(join(commercialRoot, 'admin/src/index.jsx'), 'export default () => []\n');
    writeFileSync(
      join(commercialRoot, 'plugins/semantic-search/plugin.manifest.json'),
      JSON.stringify({ name: 'semantic-search', entrypoints: { admin: './admin/src/index.jsx' } }),
    );

    assert.throws(() => resolveHostedAdminBuild({ coreRoot, env: {} }), /tenant-backup/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('rejects Community or incomplete Admin artifacts before deploy', () => {
  const dist = mkdtempSync(join(tmpdir(), 'ctxhub-admin-dist-'));
  try {
    writeFileSync(
      join(dist, 'ctxhub-build.json'),
      JSON.stringify({ schemaVersion: 1, variant: 'community', plugins: [] }),
    );
    assert.throws(() => assertHostedAdminBuild(parseAdminBuildContract(dist)), /Community Admin build/);

    writeFileSync(
      join(dist, 'ctxhub-build.json'),
      JSON.stringify({ schemaVersion: 1, variant: 'hosted', plugins: ['semantic-search'] }),
    );
    assert.throws(
      () => assertHostedAdminBuild(parseAdminBuildContract(dist), {
        requiredPlugins: ['semantic-search', 'tenant-backup'],
      }),
      /tenant-backup/,
    );
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});
