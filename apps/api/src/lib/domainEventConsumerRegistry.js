const { DOMAIN_EVENT_TYPES } = require('@contexthub/common');

const CONSUMER_NAME_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const INITIAL_POSITIONS = Object.freeze(['earliest', 'latest', 'backfill']);
const DEFAULT_RETRY_POLICY = Object.freeze({
  baseDelayMs: 1000,
  maxDelayMs: 5 * 60 * 1000,
  multiplier: 2
});
const MAX_BATCH_SIZE = 500;
const MAX_ATTEMPTS = 100;

class DomainEventConsumerRegistryError extends Error {
  constructor(message, code = 'DOMAIN_EVENT_CONSUMER_INVALID') {
    super(message);
    this.name = 'DomainEventConsumerRegistryError';
    this.code = code;
  }
}

function invalid(message) {
  throw new DomainEventConsumerRegistryError(message);
}

function requireInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    invalid(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function normalizeName(name) {
  const normalized = typeof name === 'string' ? name.trim() : '';
  if (!normalized || normalized.length > 80 || !CONSUMER_NAME_PATTERN.test(normalized)) {
    invalid(
      'consumer name must be 1-80 lowercase characters using letters, numbers, dots or hyphens'
    );
  }
  return normalized;
}

function normalizeTypes(types) {
  if (!Array.isArray(types) || types.length === 0) {
    invalid('consumer types must be a non-empty array');
  }

  const normalized = types.map((type) =>
    typeof type === 'string' ? type.trim() : ''
  );
  if (normalized.some((type) => !DOMAIN_EVENT_TYPES.includes(type))) {
    const unknown = normalized.find((type) => !DOMAIN_EVENT_TYPES.includes(type));
    invalid(`consumer event type is not supported: ${unknown || '<empty>'}`);
  }
  if (new Set(normalized).size !== normalized.length) {
    invalid('consumer event types must not contain duplicates');
  }

  return Object.freeze(normalized);
}

function normalizeRetry(retry) {
  if (retry === undefined) {
    return DEFAULT_RETRY_POLICY;
  }
  if (!retry || typeof retry !== 'object' || Array.isArray(retry)) {
    invalid('consumer retry must be an object');
  }

  const baseDelayMs = requireInteger(
    retry.baseDelayMs,
    'consumer retry.baseDelayMs',
    0,
    24 * 60 * 60 * 1000
  );
  const maxDelayMs = requireInteger(
    retry.maxDelayMs,
    'consumer retry.maxDelayMs',
    baseDelayMs,
    7 * 24 * 60 * 60 * 1000
  );
  const multiplier = retry.multiplier;
  if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 10) {
    invalid('consumer retry.multiplier must be between 1 and 10');
  }

  return Object.freeze({ baseDelayMs, maxDelayMs, multiplier });
}

function normalizeRegistration(name, config) {
  const normalizedName = normalizeName(name);
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    invalid(`consumer config must be an object: ${normalizedName}`);
  }
  if (config.name !== undefined && normalizeName(config.name) !== normalizedName) {
    invalid(`consumer config name does not match registration name: ${normalizedName}`);
  }
  if (!INITIAL_POSITIONS.includes(config.initialPosition)) {
    invalid(
      `consumer initialPosition must be one of: ${INITIAL_POSITIONS.join(', ')}`
    );
  }
  if (typeof config.handle !== 'function') {
    invalid(`consumer handle must be a function: ${normalizedName}`);
  }

  return Object.freeze({
    name: normalizedName,
    types: normalizeTypes(config.types),
    batchSize: requireInteger(
      config.batchSize,
      'consumer batchSize',
      1,
      MAX_BATCH_SIZE
    ),
    maxAttempts: requireInteger(
      config.maxAttempts,
      'consumer maxAttempts',
      1,
      MAX_ATTEMPTS
    ),
    retry: normalizeRetry(config.retry),
    initialPosition: config.initialPosition,
    handle: config.handle
  });
}

function createDomainEventConsumerRegistry() {
  const registrations = new Map();

  return Object.freeze({
    register(name, config) {
      const registration = normalizeRegistration(name, config);
      if (registrations.has(registration.name)) {
        throw new DomainEventConsumerRegistryError(
          `domain event consumer is already registered: ${registration.name}`,
          'DOMAIN_EVENT_CONSUMER_COLLISION'
        );
      }
      registrations.set(registration.name, registration);
      return registration;
    },

    get(name) {
      return registrations.get(normalizeName(name)) || null;
    },

    has(name) {
      return registrations.has(normalizeName(name));
    },

    list() {
      return Object.freeze(Array.from(registrations.values()));
    }
  });
}

const domainEventConsumerRegistry = createDomainEventConsumerRegistry();

module.exports = {
  DEFAULT_RETRY_POLICY,
  INITIAL_POSITIONS,
  DomainEventConsumerRegistryError,
  createDomainEventConsumerRegistry,
  domainEventConsumerRegistry,
  __testables: {
    normalizeName,
    normalizeRegistration,
    normalizeRetry,
    normalizeTypes
  }
};
