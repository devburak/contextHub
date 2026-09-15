import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const serverSource = readFileSync(new URL('../../../apps/api/src/server.js', import.meta.url), 'utf8');

function runStartup(initializeIndexes) {
  const module = { exports: {} };
  let finish;
  const completed = new Promise((resolve) => { finish = resolve; });
  const database = { connectDB: vi.fn(async () => {}), initializeIndexes };
  const roleService = {
    // Stop after the prerequisite calls; this keeps timers, services and network
    // listeners out of the test while exercising the actual server entry point.
    ensureSystemRoles: vi.fn(async () => { throw new Error('end of startup fixture'); }),
  };
  const createServer = vi.fn();
  const dependencies = {
    fastify: createServer,
    'fastify-plugin': (plugin) => plugin,
    dotenv: { config() {} },
    path,
    '@contexthub/common': { database },
    './services/roleService': roleService,
  };
  const require = (id) => dependencies[id] || {};
  require.main = module;
  const exit = vi.fn(() => finish());
  vm.runInNewContext(serverSource, {
    require, module, __dirname: '/test/api/src',
    process: { env: {}, exit },
    console: { error: vi.fn() },
  });
  return { database, roleService, createServer, exit, completed };
}

describe('API deployment index prerequisite', () => {
  it('awaits index completion before other startup work can run', async () => {
    let release;
    let started;
    const pending = new Promise((resolve) => { release = resolve; });
    const indexStarted = new Promise((resolve) => { started = resolve; });
    const initializeIndexes = vi.fn(() => { started(); return pending; });
    const startup = runStartup(initializeIndexes);
    await indexStarted;
    expect(startup.database.connectDB).toHaveBeenCalledOnce();
    expect(startup.roleService.ensureSystemRoles).not.toHaveBeenCalled();
    expect(startup.createServer).not.toHaveBeenCalled();
    release();
    await startup.completed;
    expect(startup.roleService.ensureSystemRoles).toHaveBeenCalledOnce();
  });

  it('exits with failure before serving if required index setup fails', async () => {
    const startup = runStartup(vi.fn(async () => { throw new Error('index verification failed'); }));
    await startup.completed;
    expect(startup.exit).toHaveBeenCalledWith(1);
    expect(startup.roleService.ensureSystemRoles).not.toHaveBeenCalled();
    expect(startup.createServer).not.toHaveBeenCalled();
  });
});
