const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const semver = require('semver');
const { DOMAIN_EVENT_TYPES } = require('@contexthub/common');
const { createExtensionApi } = require('./extensionApi');
const {
  ADMIN_EXTENSION_API_REVISION,
  ADMIN_EXTENSION_API_VERSION,
  DOMAIN_EVENT_SCHEMA_VERSION,
  EXTENSION_API_REVISION,
  EXTENSION_API_VERSION
} = require('./extensionContract');
const { createExtensionRegistry } = require('./extensionRegistry');

const CORE_PACKAGE_PATH = path.resolve(__dirname, '../../../../package.json');
const PLUGIN_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ROUTE_PREFIX_PATTERN = /^\/api\/[a-z][a-z0-9-]*(?:\/[a-z0-9-]+)*$/;

class PluginHostError extends Error {
  constructor(message, code = 'PLUGIN_HOST_ERROR') {
    super(message);
    this.name = 'PluginHostError';
    this.code = code;
  }
}

function fail(message, code = 'PLUGIN_MANIFEST_INVALID') {
  throw new PluginHostError(message, code);
}

function requiredString(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) fail(`${label} is required`);
  return normalized;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(`${label} must be a positive integer`);
  }
  return value;
}

function uniqueStrings(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  const normalized = value.map((item) => requiredString(item, `${label} item`));
  if (new Set(normalized).size !== normalized.length) {
    fail(`${label} must not contain duplicates`);
  }
  return Object.freeze(normalized);
}

function validateConsumers(value, consumedTypes) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) fail('consumers must be an array');
  const names = new Set();
  return Object.freeze(
    value.map((consumer) => {
      const name = requiredString(consumer?.name, 'consumer.name');
      if (names.has(name)) fail(`duplicate consumer declaration: ${name}`);
      names.add(name);
      const types = uniqueStrings(consumer.types || [], `consumer ${name} types`);
      const undeclared = types.find((type) => !consumedTypes.includes(type));
      if (undeclared) {
        fail(`consumer ${name} uses undeclared event type: ${undeclared}`);
      }
      return Object.freeze({ name, types });
    })
  );
}

function validatePluginManifest(raw, options = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('plugin manifest must be an object');
  }
  const coreVersion = options.coreVersion || '0.0.0';
  const name = requiredString(raw.name, 'name');
  if (!PLUGIN_NAME_PATTERN.test(name)) fail(`invalid plugin name: ${name}`);
  const version = requiredString(raw.version, 'version');
  if (!semver.valid(version)) fail(`invalid plugin version: ${version}`);
  const coreVersionRange = requiredString(
    raw.coreVersionRange || raw.coreRange,
    'coreVersionRange'
  );
  if (!semver.validRange(coreVersionRange)) {
    fail(`invalid coreVersionRange: ${coreVersionRange}`);
  }
  if (!semver.satisfies(coreVersion, coreVersionRange)) {
    fail(
      `plugin ${name}@${version} does not support core ${coreVersion}`,
      'PLUGIN_CORE_VERSION_INCOMPATIBLE'
    );
  }

  const apiVersion = positiveInteger(raw.apiVersion, 'apiVersion');
  const apiRevision = positiveInteger(
    raw.apiRevision ?? raw.minApiRevision,
    'apiRevision'
  );
  if (apiVersion !== EXTENSION_API_VERSION || apiRevision > EXTENSION_API_REVISION) {
    fail(
      `plugin ${name} requires extension API ${apiVersion} revision ${apiRevision}`,
      'PLUGIN_API_VERSION_INCOMPATIBLE'
    );
  }

  const adminApiVersion = positiveInteger(raw.adminApiVersion, 'adminApiVersion');
  const adminApiRevision = positiveInteger(
    raw.adminApiRevision ?? raw.minAdminApiRevision,
    'adminApiRevision'
  );
  if (
    adminApiVersion !== ADMIN_EXTENSION_API_VERSION ||
    adminApiRevision > ADMIN_EXTENSION_API_REVISION
  ) {
    fail(
      `plugin ${name} requires admin extension API ${adminApiVersion} revision ${adminApiRevision}`,
      'PLUGIN_ADMIN_API_VERSION_INCOMPATIBLE'
    );
  }
  const eventSchemaVersion = positiveInteger(
    raw.eventSchemaVersion,
    'eventSchemaVersion'
  );
  if (eventSchemaVersion !== DOMAIN_EVENT_SCHEMA_VERSION) {
    fail(
      `plugin ${name} requires domain event schema ${eventSchemaVersion}`,
      'PLUGIN_EVENT_SCHEMA_INCOMPATIBLE'
    );
  }
  const routePrefix = requiredString(raw.routePrefix, 'routePrefix');
  if (!ROUTE_PREFIX_PATTERN.test(routePrefix)) {
    fail(`invalid routePrefix: ${routePrefix}`);
  }
  const permissions = uniqueStrings(raw.permissions || [], 'permissions');
  const featureKeys = uniqueStrings(raw.featureKeys || [], 'featureKeys');
  const consumesDomainEvents = uniqueStrings(
    raw.consumesDomainEvents || [],
    'consumesDomainEvents'
  );
  const unknownEvent = consumesDomainEvents.find(
    (type) => !DOMAIN_EVENT_TYPES.includes(type)
  );
  if (unknownEvent) fail(`unsupported domain event type: ${unknownEvent}`);

  const apiEntrypoint = requiredString(raw.entrypoints?.api, 'entrypoints.api');
  const consumers = validateConsumers(raw.consumers, consumesDomainEvents);

  return Object.freeze({
    schemaVersion: positiveInteger(raw.schemaVersion ?? 1, 'schemaVersion'),
    name,
    version,
    coreVersionRange,
    apiVersion,
    apiRevision,
    adminApiVersion,
    adminApiRevision,
    eventSchemaVersion,
    routePrefix,
    permissions,
    featureKeys,
    consumesDomainEvents,
    consumers,
    entrypoints: Object.freeze({ api: apiEntrypoint, admin: raw.entrypoints?.admin || null })
  });
}

function resolvePluginEntries(value = process.env.CTXHUB_PLUGINS || '') {
  if (Array.isArray(value)) return value.map((item) => path.resolve(item));
  const serialized = String(value).trim();
  if (!serialized) return [];
  if (serialized.startsWith('[')) {
    let parsed;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      fail('CTXHUB_PLUGINS must be a JSON array or a comma-separated list');
    }
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      fail('CTXHUB_PLUGINS JSON value must be an array of manifest paths');
    }
    return parsed.map((item) => path.resolve(item));
  }
  return serialized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(item));
}

async function getCoreVersion() {
  const payload = JSON.parse(await fs.readFile(CORE_PACKAGE_PATH, 'utf8'));
  if (!semver.valid(payload.version)) fail('core package version is invalid');
  return payload.version;
}

async function loadPlugin(entry, coreVersion) {
  const manifestPath = await fs.realpath(path.resolve(entry));
  const pluginRoot = await fs.realpath(path.dirname(manifestPath));
  const raw = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const manifest = validatePluginManifest(raw, { coreVersion });
  const modulePath = await fs.realpath(path.resolve(pluginRoot, manifest.entrypoints.api));
  const relative = path.relative(pluginRoot, modulePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(`plugin entrypoint escapes plugin root: ${manifest.name}`);
  }
  const loaded = await import(pathToFileURL(modulePath).href);
  const api = loaded.default && typeof loaded.default === 'object'
    ? { ...loaded.default, ...loaded }
    : loaded;
  validatePluginExports(api, manifest);
  return { api, manifest, manifestPath, modulePath };
}

function validatePluginExports(api, manifest) {
  if (typeof api.registerApi !== 'function') {
    fail(
      `plugin ${manifest.name} does not export registerApi`,
      'PLUGIN_ENTRYPOINT_INVALID'
    );
  }
  if (manifest.consumers.length && typeof api.registerConsumers !== 'function') {
    fail(
      `plugin ${manifest.name} declares consumers but does not export registerConsumers`,
      'PLUGIN_ENTRYPOINT_INVALID'
    );
  }
}

function hookForMode(plugin, mode) {
  const hook = mode === 'api' ? plugin.api.registerApi : plugin.api.registerConsumers;
  if (mode === 'consumer' && !plugin.manifest.consumers.length && !hook) {
    return async () => {};
  }
  if (typeof hook !== 'function') {
    fail(
      `plugin ${plugin.manifest.name} does not export ${mode === 'api' ? 'registerApi' : 'registerConsumers'}`,
      'PLUGIN_ENTRYPOINT_INVALID'
    );
  }
  return hook;
}

async function bootstrapExtensions(options = {}) {
  const mode = options.mode;
  if (!['api', 'consumer'].includes(mode)) {
    throw new PluginHostError('bootstrap mode must be api or consumer');
  }
  const entries = resolvePluginEntries(options.entries);
  const registry = options.registry || createExtensionRegistry();
  if (!entries.length) return Object.freeze({ registry, plugins: Object.freeze([]) });
  if (mode === 'api' && !options.app) {
    throw new PluginHostError('Fastify app is required in api mode');
  }

  const coreVersion = options.coreVersion || await getCoreVersion();
  const plugins = [];
  for (const entry of entries) {
    const plugin = await loadPlugin(entry, coreVersion);
    registry.registerManifest(plugin.manifest);
    plugins.push(plugin);
  }

  const preparedPlugins = plugins.map((plugin) => ({
    plugin,
    hook: hookForMode(plugin, mode)
  }));

  for (const { plugin, hook } of preparedPlugins) {
    if (mode === 'api') {
      await options.app.register(
        async function extensionFastifyScope(scopedApp) {
          const context = createExtensionApi({
            manifest: plugin.manifest,
            eventRegistry: options.eventRegistry,
            logger: scopedApp.log
          });
          await hook(scopedApp, context);
        },
        { prefix: plugin.manifest.routePrefix }
      );
    } else {
      const context = createExtensionApi({
        manifest: plugin.manifest,
        eventRegistry: options.eventRegistry,
        logger: options.logger || console
      });
      await hook(context);
    }
  }

  return Object.freeze({ registry, plugins: Object.freeze(plugins) });
}

module.exports = {
  PluginHostError,
  bootstrapExtensions,
  loadPlugin,
  resolvePluginEntries,
  validatePluginExports,
  validatePluginManifest
};
