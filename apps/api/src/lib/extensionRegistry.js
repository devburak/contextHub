const RESERVED_ROUTE_PREFIXES = Object.freeze([
  '/api/auth',
  '/api/activities',
  '/api/admin',
  '/api/api-tokens',
  '/api/api-usage-sync',
  '/api/categories',
  '/api/cron',
  '/api/custom-field-definitions',
  '/api/dashboard',
  '/api/documentation',
  '/api/feature-flags',
  '/api/galleries',
  '/api/mail',
  '/api/public',
  '/api/subscription-plans',
  '/api/tags',
  '/api/tenant',
  '/api/tenant-settings',
  '/api/users',
  '/api/tenants',
  '/api/contents',
  '/api/collections',
  '/api/forms',
  '/api/media',
  '/api/menus',
  '/api/placements',
  '/api/webhooks',
  '/api/roles'
]);

class ExtensionRegistryError extends Error {
  constructor(message, code = 'EXTENSION_REGISTRY_ERROR') {
    super(message);
    this.name = 'ExtensionRegistryError';
    this.code = code;
  }
}

function createExtensionRegistry(options = {}) {
  const plugins = new Map();
  const routePrefixes = new Map();
  const permissions = new Map();
  const featureKeys = new Map();
  const consumers = new Map();
  const reserved = new Set(options.reservedRoutePrefixes || RESERVED_ROUTE_PREFIXES);

  const assertAvailable = (registry, value, pluginName, kind) => {
    const owner = registry.get(value);
    if (owner) {
      throw new ExtensionRegistryError(
        `${kind} collision: ${value} is declared by ${owner} and ${pluginName}`,
        'EXTENSION_DECLARATION_COLLISION'
      );
    }
  };

  const assertRouteAvailable = (routePrefix, pluginName) => {
    for (const [registeredPrefix, owner] of routePrefixes) {
      if (
        routePrefix === registeredPrefix ||
        routePrefix.startsWith(`${registeredPrefix}/`) ||
        registeredPrefix.startsWith(`${routePrefix}/`)
      ) {
        throw new ExtensionRegistryError(
          `route prefix collision: ${routePrefix} overlaps ${registeredPrefix} declared by ${owner} and ${pluginName}`,
          'EXTENSION_DECLARATION_COLLISION'
        );
      }
    }
  };

  return Object.freeze({
    registerManifest(manifest) {
      if (plugins.has(manifest.name)) {
        throw new ExtensionRegistryError(
          `plugin name collision: ${manifest.name}`,
          'EXTENSION_PLUGIN_COLLISION'
        );
      }
      const reservedOwner = Array.from(reserved).find(
        (prefix) =>
          manifest.routePrefix === prefix || manifest.routePrefix.startsWith(`${prefix}/`)
      );
      if (reservedOwner) {
        throw new ExtensionRegistryError(
          `plugin route prefix is reserved by core (${reservedOwner}): ${manifest.routePrefix}`,
          'EXTENSION_ROUTE_RESERVED'
        );
      }

      assertRouteAvailable(manifest.routePrefix, manifest.name);
      for (const permission of manifest.permissions) {
        assertAvailable(permissions, permission, manifest.name, 'permission');
      }
      for (const featureKey of manifest.featureKeys) {
        assertAvailable(featureKeys, featureKey, manifest.name, 'feature key');
      }
      for (const consumer of manifest.consumers) {
        assertAvailable(consumers, consumer.name, manifest.name, 'consumer');
      }

      routePrefixes.set(manifest.routePrefix, manifest.name);
      for (const permission of manifest.permissions) permissions.set(permission, manifest.name);
      for (const featureKey of manifest.featureKeys) featureKeys.set(featureKey, manifest.name);
      for (const consumer of manifest.consumers) consumers.set(consumer.name, manifest.name);
      plugins.set(manifest.name, manifest);
      return manifest;
    },

    getPlugin(name) {
      return plugins.get(name) || null;
    },

    listPlugins() {
      return Object.freeze(Array.from(plugins.values()));
    },

    inventory() {
      return Object.freeze(
        Array.from(plugins.values()).map((manifest) =>
          Object.freeze({
            name: manifest.name,
            version: manifest.version,
            routePrefix: manifest.routePrefix,
            apiVersion: manifest.apiVersion,
            apiRevision: manifest.apiRevision
          })
        )
      );
    }
  });
}

module.exports = {
  ExtensionRegistryError,
  RESERVED_ROUTE_PREFIXES,
  createExtensionRegistry
};
