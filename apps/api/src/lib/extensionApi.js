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

function createSourceFacade(sources) {
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
  return Object.freeze({
    getContentSnapshot: sources.getContentSnapshot.bind(sources),
    getCollectionEntrySnapshot: sources.getCollectionEntrySnapshot.bind(sources)
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

  return Object.freeze({
    version: EXTENSION_API_VERSION,
    revision: EXTENSION_API_REVISION,
    plugin: Object.freeze({ name: manifest.name, version: manifest.version }),
    events: createEventFacade(manifest, eventRegistry),
    sources: createSourceFacade(sources),
    auth,
    settings,
    log: createLoggerFacade(logger)
  });
}

module.exports = {
  EXTENSION_API_REVISION,
  EXTENSION_API_VERSION,
  ExtensionApiError,
  createExtensionApi,
  createLoggerFacade,
  createSourceFacade
};
