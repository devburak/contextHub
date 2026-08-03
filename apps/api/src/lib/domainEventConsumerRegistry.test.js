import { describe, expect, it, vi } from 'vitest'

import {
  DomainEventConsumerRegistryError,
  createDomainEventConsumerRegistry
} from './domainEventConsumerRegistry'

function validConfig(overrides = {}) {
  return {
    types: ['content.published', 'content.updated'],
    batchSize: 100,
    maxAttempts: 8,
    retry: {
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      multiplier: 2
    },
    initialPosition: 'backfill',
    handle: vi.fn(),
    ...overrides
  }
}

describe('domain event consumer registry', () => {
  it('registers and freezes a validated consumer contract', () => {
    const registry = createDomainEventConsumerRegistry()
    const registration = registry.register(
      'semantic-search-indexer',
      validConfig()
    )

    expect(registry.get('semantic-search-indexer')).toBe(registration)
    expect(registry.list()).toEqual([registration])
    expect(Object.isFrozen(registration)).toBe(true)
    expect(Object.isFrozen(registration.types)).toBe(true)
    expect(Object.isFrozen(registration.retry)).toBe(true)
  })

  it('fails fast on name collisions', () => {
    const registry = createDomainEventConsumerRegistry()
    registry.register('semantic-search-indexer', validConfig())

    expect(() =>
      registry.register('semantic-search-indexer', validConfig())
    ).toThrowError(
      expect.objectContaining({
        name: 'DomainEventConsumerRegistryError',
        code: 'DOMAIN_EVENT_CONSUMER_COLLISION'
      })
    )
  })

  it.each([
    ['invalid name', 'Semantic Search', validConfig()],
    [
      'unknown event type',
      'semantic-search',
      validConfig({ types: ['content.unknown'] })
    ],
    [
      'duplicate event type',
      'semantic-search',
      validConfig({ types: ['content.updated', 'content.updated'] })
    ],
    ['empty event types', 'semantic-search', validConfig({ types: [] })],
    ['zero batch size', 'semantic-search', validConfig({ batchSize: 0 })],
    ['zero attempts', 'semantic-search', validConfig({ maxAttempts: 0 })],
    [
      'invalid initial position',
      'semantic-search',
      validConfig({ initialPosition: 'silent-latest' })
    ],
    [
      'invalid retry range',
      'semantic-search',
      validConfig({
        retry: { baseDelayMs: 10000, maxDelayMs: 1000, multiplier: 2 }
      })
    ],
    ['missing handler', 'semantic-search', validConfig({ handle: null })]
  ])('rejects %s', (_label, name, config) => {
    const registry = createDomainEventConsumerRegistry()

    expect(() => registry.register(name, config)).toThrow(
      DomainEventConsumerRegistryError
    )
  })

  it('accepts the explicit earliest and latest start policies', () => {
    const registry = createDomainEventConsumerRegistry()

    expect(
      registry.register('earliest-consumer',
        validConfig({ initialPosition: 'earliest' })
      ).initialPosition
    ).toBe('earliest')
    expect(
      registry.register('latest-consumer',
        validConfig({ initialPosition: 'latest' })
      ).initialPosition
    ).toBe('latest')
  })
})
