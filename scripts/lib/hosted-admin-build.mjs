import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export function resolveHostedAdminBuild({ coreRoot, env = process.env } = {}) {
  if (!coreRoot) throw new TypeError('coreRoot is required');

  const configuredEntry = String(env.CTXHUB_ADMIN_PLUGIN_ENTRY || '').trim();
  const candidates = configuredEntry
    ? [isAbsolute(configuredEntry) ? configuredEntry : resolve(coreRoot, configuredEntry)]
    : [
        resolve(coreRoot, '../ctxhub-commercial/admin/src/index.jsx'),
        resolve(coreRoot, '../commercial/admin/src/index.jsx'),
      ];
  const entry = candidates.find((candidate) => existsSync(candidate));
  if (!entry) {
    throw new Error(
      'Hosted Admin plugin entry was not found. Set CTXHUB_ADMIN_PLUGIN_ENTRY or keep the commercial checkout next to core.',
    );
  }

  const commercialRoot = resolve(dirname(entry), '../..');
  const plugins = discoverAdminPlugins(commercialRoot);
  if (plugins.length === 0) {
    throw new Error(`Hosted Admin plugin catalogue is empty: ${commercialRoot}`);
  }

  const configuredSource = String(env.CTXHUB_ADMIN_PLUGIN_SOURCE || '').trim();
  const sources = configuredSource
    ? parseSourcePatterns(configuredSource).map((item) => (
        isAbsolute(item) ? item : resolve(coreRoot, item)
      ))
    : [
        join(commercialRoot, 'admin/src/**/*.{js,jsx,mjs}'),
        join(commercialRoot, 'plugins/*/admin/src/**/*.{js,jsx,mjs}'),
      ];

  return Object.freeze({
    entry,
    sources: Object.freeze(sources),
    plugins: Object.freeze(plugins),
    commercialRoot,
  });
}

function parseSourcePatterns(value) {
  if (!value.startsWith('[')) return [value];
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`CTXHUB_ADMIN_PLUGIN_SOURCE must be a path or JSON array: ${error.message}`);
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error('CTXHUB_ADMIN_PLUGIN_SOURCE JSON value must contain non-empty strings');
  }
  return parsed.map((item) => item.trim());
}

export function discoverAdminPlugins(commercialRoot) {
  const pluginsRoot = join(commercialRoot, 'plugins');
  if (!existsSync(pluginsRoot)) return [];

  return readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const manifestPath = join(pluginsRoot, entry.name, 'plugin.manifest.json');
      if (!existsSync(manifestPath)) return [];
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      return manifest?.entrypoints?.admin && manifest?.name ? [String(manifest.name)] : [];
    })
    .sort();
}

export function parseAdminBuildContract(distDirectory) {
  const contractPath = join(distDirectory, 'ctxhub-build.json');
  if (!existsSync(contractPath)) {
    throw new Error(`Admin build contract is missing: ${contractPath}`);
  }
  let contract;
  try {
    contract = JSON.parse(readFileSync(contractPath, 'utf8'));
  } catch (error) {
    throw new Error(`Admin build contract is invalid: ${error.message}`);
  }
  if (contract?.schemaVersion !== 1 || !['community', 'hosted'].includes(contract?.variant)) {
    throw new Error('Admin build contract has an unsupported shape');
  }
  const plugins = Array.isArray(contract.plugins)
    ? [...new Set(contract.plugins.map((name) => String(name).trim()).filter(Boolean))].sort()
    : [];
  return Object.freeze({ schemaVersion: 1, variant: contract.variant, plugins: Object.freeze(plugins) });
}

export function assertHostedAdminBuild(contract, { requiredPlugins = [] } = {}) {
  if (contract.variant !== 'hosted') {
    throw new Error('Refusing to deploy a Community Admin build over the hosted service');
  }
  if (contract.plugins.length === 0) {
    throw new Error('Refusing to deploy a hosted Admin build without plugins');
  }
  const available = new Set(contract.plugins);
  const missing = requiredPlugins.filter((name) => !available.has(name));
  if (missing.length > 0) {
    throw new Error(`Hosted Admin build is missing required plugins: ${missing.join(', ')}`);
  }
  return contract;
}
