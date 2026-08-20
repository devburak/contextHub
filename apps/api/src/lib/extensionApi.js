const {
  domainEventConsumerRegistry
} = require('./domainEventConsumerRegistry');
const {
  EXTENSION_API_REVISION,
  EXTENSION_API_VERSION
} = require('./extensionContract');
const { createExtensionSourceFacade } = require('./extensionSourceFacade');
const { createExtensionAuthFacade } = require('./extensionAuthFacade');
const { createExtensionSettingsFacade } = require('./extensionSettingsFacade');
const { createExtensionEntitlementFacade } = require('./extensionEntitlementFacade');
const { createExtensionSecretsFacade } = require('./extensionSecretsFacade');

class ExtensionApiError extends Error {
  constructor(message, code = 'EXTENSION_API_ERROR') {
    super(message);
    this.name = 'ExtensionApiError';
    this.code = code;
  }
}

function createEventFacade(manifest, eventRegistry) {
  const declaredTypes = new Set(manifest.consumesDomainEvents);
  const declaredConsumers = new Map(
    manifest.consumers.map((item) => [item.name, new Set(item.types)])
  );

  return Object.freeze({
    register(name, config) {
      const consumerTypes = declaredConsumers.get(name);
      if (!consumerTypes) {
        throw new ExtensionApiError(
          `consumer is not declared by plugin ${manifest.name}: ${name}`,
          'EXTENSION_CONSUMER_NOT_DECLARED'
        );
      }
      const undeclaredType = config?.types?.find((type) => !declaredTypes.has(type));
      if (undeclaredType) {
        throw new ExtensionApiError(
          `event type is not declared by plugin ${manifest.name}: ${undeclaredType}`,
          'EXTENSION_EVENT_NOT_DECLARED'
        );
      }
      if (
        !Array.isArray(config?.types) ||
        config.types.length !== consumerTypes.size ||
        config.types.some((type) => !consumerTypes.has(type))
      ) {
        throw new ExtensionApiError(
          `consumer event types do not match manifest declaration: ${name}`,
          'EXTENSION_CONSUMER_CONTRACT_MISMATCH'
        );
      }
      return eventRegistry.register(name, config);
    }
  });
}

function createLoggerFacade(logger) {
  const facade = {};
  for (const level of ['debug', 'info', 'warn', 'error']) {
    facade[level] = typeof logger[level] === 'function'
      ? logger[level].bind(logger)
      : () => {};
  }
  return Object.freeze(facade);
}

function createSourceFacade(sources, manifest) {
  if (
    !sources ||
    typeof sources.getContentSnapshot !== 'function' ||
    typeof sources.getCollectionEntrySnapshot !== 'function'
  ) {
    throw new ExtensionApiError(
      'extension source facade is incomplete',
      'EXTENSION_SOURCE_FACADE_INVALID'
    );
  }
  const facade = {
    getContentSnapshot: sources.getContentSnapshot.bind(sources),
    getCollectionEntrySnapshot: sources.getCollectionEntrySnapshot.bind(sources)
  };
  if (manifest.capabilities.includes('tenant.backup.export')) {
    for (const method of [
      'streamTenantBackupRecords',
      'listTenantBackupFiles',
      'openTenantBackupFile'
    ]) {
      if (typeof sources[method] !== 'function') {
        throw new ExtensionApiError(
          `extension backup source facade is missing ${method}`,
          'EXTENSION_BACKUP_SOURCE_FACADE_INVALID'
        );
      }
      facade[method] = sources[method].bind(sources);
    }
  }
  return Object.freeze(facade);
}

function createSettingsApi(settings, manifest) {
  if (!settings || typeof settings.get !== 'function' || typeof settings.set !== 'function') {
    throw new ExtensionApiError(
      'extension settings facade is incomplete',
      'EXTENSION_SETTINGS_FACADE_INVALID'
    );
  }
  const facade = {
    get: settings.get.bind(settings),
    set: settings.set.bind(settings)
  };
  if (manifest.capabilities.includes('tenant.settings.enumerate')) {
    if (typeof settings.listTenantIds !== 'function') {
      throw new ExtensionApiError(
        'extension settings facade cannot enumerate tenant settings',
        'EXTENSION_SETTINGS_FACADE_INVALID'
      );
    }
    facade.listTenantIds = settings.listTenantIds.bind(settings);
  }
  return Object.freeze(facade);
}

function createSecretsApi(secrets, manifest) {
  if (!manifest.capabilities.includes('tenant.secrets.manage')) return undefined;
  for (const method of ['metadata', 'get', 'set']) {
    if (typeof secrets?.[method] !== 'function') {
      throw new ExtensionApiError(
        `extension secrets facade is missing ${method}`,
        'EXTENSION_SECRETS_FACADE_INVALID'
      );
    }
  }
  return Object.freeze({
    metadata: secrets.metadata.bind(secrets),
    get: secrets.get.bind(secrets),
    set: secrets.set.bind(secrets)
  });
}

function createExtensionApi(options) {
  const manifest = options.manifest;
  const eventRegistry = options.eventRegistry || domainEventConsumerRegistry;
  const logger = options.logger || console;
  const sources = options.sources || createExtensionSourceFacade();
  const auth = options.auth || createExtensionAuthFacade(manifest);
  const settings = options.settings || createExtensionSettingsFacade({
    plugin: manifest.name
  });
  const entitlements = options.entitlements || createExtensionEntitlementFacade(manifest);
  const secrets = options.secrets || (
    manifest.capabilities.includes('tenant.secrets.manage')
      ? createExtensionSecretsFacade({ plugin: manifest.name })
      : null
  );

  const extension = {
    version: EXTENSION_API_VERSION,
    revision: EXTENSION_API_REVISION,
    plugin: Object.freeze({ name: manifest.name, version: manifest.version }),
    events: createEventFacade(manifest, eventRegistry),
    sources: createSourceFacade(sources, manifest),
    auth,
    entitlements,
    settings: createSettingsApi(settings, manifest),
    log: createLoggerFacade(logger)
  };
  const secretsApi = createSecretsApi(secrets, manifest);
  if (secretsApi) extension.secrets = secretsApi;
  return Object.freeze(extension);
}

module.exports = {
  EXTENSION_API_REVISION,
  EXTENSION_API_VERSION,
  ExtensionApiError,
  createExtensionApi,
  createLoggerFacade,
  createSecretsApi,
  createSettingsApi,
  createSourceFacade
};
