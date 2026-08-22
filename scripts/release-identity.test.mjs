import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { normalizeReleaseTag, resolveReleaseIdentity } from './lib/release-identity.mjs';

test('accepts immutable semantic release tags', () => {
  assert.equal(normalizeReleaseTag('v1.2.3'), 'v1.2.3');
  assert.equal(normalizeReleaseTag('v1.2.3-rc.1'), 'v1.2.3-rc.1');
});

test('rejects branches, floating tags, and raw SHAs', () => {
  for (const value of ['layout-fix', 'latest', '160bd12', '1.2.3', '']) {
    assert.throws(() => normalizeReleaseTag(value));
  }
});

test('resolves only a clean HEAD whose exact tag matches package version', () => {
  const repository = mkdtempSync(join(tmpdir(), 'ctxhub-release-identity-'));
  const runGit = (...args) => execFileSync('git', args, {
    cwd: repository,
    stdio: 'ignore',
  });
  try {
    writeFileSync(join(repository, 'package.json'), '{"version":"1.2.3"}\n');
    runGit('init', '-q');
    runGit('config', 'user.name', 'ContextHub Test');
    runGit('config', 'user.email', 'test@ctxhub.invalid');
    runGit('add', 'package.json');
    runGit('-c', 'commit.gpgsign=false', 'commit', '-qm', 'release');
    runGit('tag', 'v1.2.3');

    const identity = resolveReleaseIdentity(repository, 'v1.2.3');
    assert.equal(identity.tag, 'v1.2.3');
    assert.match(identity.releaseId, /^v1\.2\.3-[a-f0-9]{12}$/);

    writeFileSync(join(repository, 'package.json'), '{"version":"1.2.4"}\n');
    assert.throws(
      () => resolveReleaseIdentity(repository, 'v1.2.3'),
      /Working tree changes/,
    );
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});
