import { describe, expect, it } from 'vitest'

import {
  ADMIN_EXTENSION_API_REVISION,
  ADMIN_EXTENSION_API_VERSION,
  DOMAIN_EVENT_SCHEMA_VERSION,
  EXTENSION_API_REVISION,
  EXTENSION_API_VERSION,
  createExtensionContractDescriptor
} from './extensionContract'

describe('extension contract descriptor', () => {
  it('is generated from the same constants used by the runtime host', () => {
    expect(createExtensionContractDescriptor('0.1.0')).toEqual({
      schemaVersion: 1,
      coreVersion: '0.1.0',
      contracts: {
        extensionApiVersion: EXTENSION_API_VERSION,
        extensionApiRevision: EXTENSION_API_REVISION,
        adminApiVersion: ADMIN_EXTENSION_API_VERSION,
        adminApiRevision: ADMIN_EXTENSION_API_REVISION,
        eventSchemaVersion: DOMAIN_EVENT_SCHEMA_VERSION
      }
    })
  })
})
