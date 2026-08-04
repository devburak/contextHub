import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import fastify from 'fastify'

import { createDomainEventConsumerRegistry } from './domainEventConsumerRegistry'
import { createExtensionRegistry } from './extensionRegistry'
import {
  bootstrapExtensions,
  validatePluginExports,
  validatePluginManifest
} from './pluginHost'

const dummyManifest = path.resolve(
  process.cwd(),
  'src/lib/__fixtures__/dummy-plugin/plugin.manifest.json'
)

function validManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    name: 'test-plugin',
    version: '0.1.0',
    coreVersionRange: '>=0.1.0 <0.2.0',
    apiVersion: 1,
    apiRevision: 1,
    adminApiVersion: 1,
    adminApiRevision: 1,
    eventSchemaVersion: 1,
    routePrefix: '/api/test-plugin',
    permissions: ['test.read'],
    featureKeys: ['test.enabled'],
    consumesDomainEvents: ['content.updated'],
    consumers: [{ name: 'test-consumer', types: ['content.updated'] }],
    entrypoints: { api: './index.js' },
    ...overrides
  }
}

describe('plugin host', () => {
  it('boots a plugin in an isolated Fastify prefix', async () => {
    const app = fastify({ logger: false })
    const result = await bootstrapExtensions({
      mode: 'api',
      app,
      entries: [dummyManifest],
      coreVersion: '0.1.0'
    })

    const response = await app.inject({ method: 'GET', url: '/api/dummy/ping' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      ok: true,
      plugin: 'dummy',
      apiVersion: 1,
      apiRevision: 2
    })
    expect(result.registry.inventory()).toEqual([
      expect.objectContaining({ name: 'dummy', routePrefix: '/api/dummy' })
    ])
    await app.close()
  })

  it('registers declared consumers in consumer mode', async () => {
    const eventRegistry = createDomainEventConsumerRegistry()

    await bootstrapExtensions({
      mode: 'consumer',
      entries: [dummyManifest],
      eventRegistry,
      coreVersion: '0.1.0',
      logger: { info: vi.fn(), error: vi.fn() }
    })

    expect(eventRegistry.get('dummy-consumer')).toMatchObject({
      types: ['content.updated'],
      initialPosition: 'earliest'
    })
  })

  it('is a no-op when no plugins are configured', async () => {
    const app = fastify({ logger: false })
    const result = await bootstrapExtensions({
      mode: 'api',
      app,
      entries: [],
      coreVersion: '0.1.0'
    })

    expect(result.plugins).toEqual([])
    expect(result.registry.inventory()).toEqual([])
    await app.close()
  })

  it('rejects incompatible core and facade revisions', () => {
    expect(() =>
      validatePluginManifest(validManifest({ coreVersionRange: '>=1.0.0' }), {
        coreVersion: '0.1.0'
      })
    ).toThrowError(expect.objectContaining({
      code: 'PLUGIN_CORE_VERSION_INCOMPATIBLE'
    }))
    expect(() =>
      validatePluginManifest(validManifest({ apiRevision: 3 }), {
        coreVersion: '0.1.0'
      })
    ).toThrowError(expect.objectContaining({
      code: 'PLUGIN_API_VERSION_INCOMPATIBLE'
    }))
    expect(() =>
      validatePluginManifest(validManifest({ adminApiRevision: 2 }), {
        coreVersion: '0.1.0'
      })
    ).toThrowError(expect.objectContaining({
      code: 'PLUGIN_ADMIN_API_VERSION_INCOMPATIBLE'
    }))
    expect(() =>
      validatePluginManifest(validManifest({ eventSchemaVersion: 2 }), {
        coreVersion: '0.1.0'
      })
    ).toThrowError(expect.objectContaining({
      code: 'PLUGIN_EVENT_SCHEMA_INCOMPATIBLE'
    }))
  })

  it('requires numeric contract versions and parses JSON manifest path lists', async () => {
    expect(() =>
      validatePluginManifest(validManifest({ apiVersion: '1' }), {
        coreVersion: '0.1.0'
      })
    ).toThrow('apiVersion must be a positive integer')

    const { resolvePluginEntries } = await import('./pluginHost.js')
    expect(resolvePluginEntries(JSON.stringify([dummyManifest]))).toEqual([dummyManifest])
  })

  it('requires consumer hooks whenever the manifest declares a consumer', () => {
    const manifest = validatePluginManifest(validManifest(), { coreVersion: '0.1.0' })
    expect(() => validatePluginExports({ registerApi() {} }, manifest)).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_ENTRYPOINT_INVALID' })
    )
  })

  it('fails before registration hooks when declarations collide', async () => {
    const app = fastify({ logger: false })

    await expect(
      bootstrapExtensions({
        mode: 'api',
        app,
        entries: [dummyManifest, dummyManifest],
        registry: createExtensionRegistry(),
        coreVersion: '0.1.0'
      })
    ).rejects.toMatchObject({ code: 'EXTENSION_PLUGIN_COLLISION' })
    await app.close()
  })

  it('rejects core route subpaths and overlapping plugin prefixes', () => {
    const registry = createExtensionRegistry()
    const first = validatePluginManifest(validManifest(), { coreVersion: '0.1.0' })
    registry.registerManifest(first)

    expect(() => registry.registerManifest(
      validatePluginManifest(validManifest({
        name: 'nested-plugin',
        routePrefix: '/api/test-plugin/nested',
        permissions: ['nested.read'],
        featureKeys: ['nested.enabled'],
        consumers: [{ name: 'nested-consumer', types: ['content.updated'] }]
      }), { coreVersion: '0.1.0' })
    )).toThrowError(expect.objectContaining({ code: 'EXTENSION_DECLARATION_COLLISION' }))

    expect(() => createExtensionRegistry().registerManifest(
      validatePluginManifest(validManifest({ routePrefix: '/api/auth/plugin' }), {
        coreVersion: '0.1.0'
      })
    )).toThrowError(expect.objectContaining({ code: 'EXTENSION_ROUTE_RESERVED' }))
  })

  it('rejects unsupported or undeclared event contracts', () => {
    expect(() =>
      validatePluginManifest(
        validManifest({ consumesDomainEvents: ['content.not-real'] }),
        { coreVersion: '0.1.0' }
      )
    ).toThrow('unsupported domain event type')
    expect(() =>
      validatePluginManifest(
        validManifest({
          consumers: [{ name: 'test-consumer', types: ['content.deleted'] }]
        }),
        { coreVersion: '0.1.0' }
      )
    ).toThrow('uses undeclared event type')
  })

  it('enforces the consumer-specific event declaration at registration time', async () => {
    const eventRegistry = createDomainEventConsumerRegistry()
    const manifest = validatePluginManifest(validManifest(), { coreVersion: '0.1.0' })
    const { createExtensionApi } = await import('./extensionApi.js')
    const context = createExtensionApi({ manifest, eventRegistry, logger: {} })

    expect(() => context.events.register('not-declared', {})).toThrowError(
      expect.objectContaining({ code: 'EXTENSION_CONSUMER_NOT_DECLARED' })
    )
    expect(() => context.events.register('test-consumer', {
      types: ['content.created']
    })).toThrowError(
      expect.objectContaining({ code: 'EXTENSION_EVENT_NOT_DECLARED' })
    )
  })

  it('exposes only the frozen, tenant-scoped source facade contract', async () => {
    const manifest = validatePluginManifest(validManifest(), { coreVersion: '0.1.0' })
    const { createExtensionApi } = await import('./extensionApi.js')
    const getContentSnapshot = vi.fn()
    const getCollectionEntrySnapshot = vi.fn()
    const context = createExtensionApi({
      manifest,
      logger: {},
      sources: {
        getContentSnapshot,
        getCollectionEntrySnapshot,
        unsafeRawDatabase: {}
      }
    })

    expect(context.revision).toBe(2)
    expect(Object.isFrozen(context.sources)).toBe(true)
    expect(context.sources).toEqual({
      getContentSnapshot: expect.any(Function),
      getCollectionEntrySnapshot: expect.any(Function)
    })
    expect(context.sources).not.toHaveProperty('unsafeRawDatabase')
  })
})
