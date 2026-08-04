import { execFileSync } from 'node:child_process';

const git = (args, options = {}) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  });

try {
  git(['rev-parse', '--git-dir']);
  git(['config', '--local', 'core.hooksPath', '.githooks']);
  console.log('[git-hooks] core.hooksPath=.githooks');
} catch (error) {
  const message = error?.stderr?.trim() || error?.message || String(error);
  console.warn(`[git-hooks] Kurulum atlandı: ${message}`);
}
