const EXTENSION_API_VERSION = 1;
const EXTENSION_API_REVISION = 2;
const ADMIN_EXTENSION_API_VERSION = 1;
const ADMIN_EXTENSION_API_REVISION = 1;
const DOMAIN_EVENT_SCHEMA_VERSION = 1;

function createExtensionContractDescriptor(coreVersion) {
  return Object.freeze({
    schemaVersion: 1,
    coreVersion,
    contracts: Object.freeze({
      extensionApiVersion: EXTENSION_API_VERSION,
      extensionApiRevision: EXTENSION_API_REVISION,
      adminApiVersion: ADMIN_EXTENSION_API_VERSION,
      adminApiRevision: ADMIN_EXTENSION_API_REVISION,
      eventSchemaVersion: DOMAIN_EVENT_SCHEMA_VERSION
    })
  });
}

module.exports = {
  ADMIN_EXTENSION_API_REVISION,
  ADMIN_EXTENSION_API_VERSION,
  DOMAIN_EVENT_SCHEMA_VERSION,
  EXTENSION_API_REVISION,
  EXTENSION_API_VERSION,
  createExtensionContractDescriptor
};
