import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function git(rootDirectory, args) {
  return execFileSync('git', args, {
    cwd: rootDirectory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function normalizeReleaseTag(value) {
  const tag = String(value || '').trim();
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(tag)) {
    throw new Error('Production deploy requires an explicit immutable semver tag such as v0.1.6');
  }
  return tag;
}

export function resolveReleaseIdentity(rootDirectory, requestedTag) {
  const tag = normalizeReleaseTag(requestedTag);
  const head = git(rootDirectory, ['rev-parse', 'HEAD']);
  const taggedCommit = git(rootDirectory, ['rev-list', '-n', '1', tag]);
  if (!taggedCommit || taggedCommit !== head) {
    throw new Error(`Release tag ${tag} does not resolve to current HEAD ${head}`);
  }
  const exactTags = git(rootDirectory, ['tag', '--points-at', 'HEAD']).split('\n').filter(Boolean);
  if (!exactTags.includes(tag)) {
    throw new Error(`Release tag ${tag} is not attached to current HEAD`);
  }
  const dirty = git(rootDirectory, ['status', '--porcelain', '--untracked-files=normal']);
  if (dirty) throw new Error('Working tree changes must be committed before production deploy');

  const packageJson = JSON.parse(readFileSync(path.join(rootDirectory, 'package.json'), 'utf8'));
  if (tag !== `v${packageJson.version}`) {
    throw new Error(`Release tag ${tag} does not match package version ${packageJson.version}`);
  }
  return {
    tag,
    commit: head,
    releaseId: `${tag}-${head.slice(0, 12)}`,
  };
}
