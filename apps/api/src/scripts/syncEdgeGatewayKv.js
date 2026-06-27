const path = require('path');
const dotenv = require('dotenv');
const { database, Tenant, ApiToken } = require('@contexthub/common');
const edgeGatewaySyncService = require('../services/edgeGatewaySyncService');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const STAGING_KV_NAMESPACE_ID = 'ba74ff058f2249a892ad6c8bb71933bb';
const PRODUCTION_KV_NAMESPACE_ID = '3bd0f3b9cd7b4a768c3d4cc44abf117b';

function parseArgs(argv = []) {
  const args = {
    env: null,
    tenant: null,
    namespaceId: null,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--env') {
      args.env = next;
      index += 1;
    } else if (arg === '--tenant') {
      args.tenant = next;
      index += 1;
    } else if (arg === '--namespace-id') {
      args.namespaceId = next;
      index += 1;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    }
  }

  return args;
}

function resolveNamespaceId(args) {
  if (args.namespaceId) {
    return args.namespaceId;
  }

  if (args.env === 'staging') {
    return STAGING_KV_NAMESPACE_ID;
  }

  if (args.env === 'production') {
    return PRODUCTION_KV_NAMESPACE_ID;
  }

  return process.env.CF_KV_NAMESPACE_ID;
}

function ensureCloudflareEnv(args) {
  const namespaceId = resolveNamespaceId(args);
  if (!namespaceId) {
    throw new Error('CF_KV_NAMESPACE_ID veya --env staging|production gerekli');
  }

  process.env.CF_EDGE_GATEWAY_ENABLED = 'true';
  process.env.CF_KV_NAMESPACE_ID = namespaceId;

  const missing = ['CF_ACCOUNT_ID', 'CF_API_TOKEN'].filter((key) => !process.env[key]);
  if (!args.dryRun && missing.length > 0) {
    throw new Error(`Eksik Cloudflare env: ${missing.join(', ')}`);
  }

  return namespaceId;
}

function buildTenantQuery(tenantFilter) {
  if (!tenantFilter) {
    return {};
  }

  return {
    $or: [
      { _id: tenantFilter },
      { slug: tenantFilter },
      { name: tenantFilter },
    ],
  };
}

async function syncTenantAndTokens(tenant, options) {
  const tenantId = tenant._id.toString();
  const tokens = await ApiToken.find({ tenantId: tenant._id }).lean();

  if (options.dryRun) {
    return {
      tenantId,
      slug: tenant.slug,
      tenantKey: `tenant:${tenantId}`,
      tokenKeys: tokens.map((token) => `apikey:${token.hash}`),
      dryRun: true,
    };
  }

  const tenantResult = await edgeGatewaySyncService.syncTenantConfig({ tenantId, tenant });
  const tokenResults = [];

  for (const token of tokens) {
    tokenResults.push(await edgeGatewaySyncService.syncApiTokenConfig({ apiToken: token, tenant }));
  }

  return {
    tenantId,
    slug: tenant.slug,
    tenantKey: tenantResult.key,
    tokenKeys: tokenResults.map((result) => result.key).filter(Boolean),
    dryRun: false,
  };
}

async function syncEdgeGatewayKv(options = {}) {
  const args = {
    ...parseArgs(process.argv.slice(2)),
    ...options,
  };

  const namespaceId = ensureCloudflareEnv(args);
  await database.connectDB();

  try {
    const tenants = await Tenant.find(buildTenantQuery(args.tenant)).lean();
    if (tenants.length === 0) {
      throw new Error(args.tenant ? `Tenant bulunamadi: ${args.tenant}` : 'Sync edilecek tenant bulunamadi');
    }

    const results = [];
    for (const tenant of tenants) {
      results.push(await syncTenantAndTokens(tenant, args));
    }

    console.log('\nEdge Gateway KV sync tamamlandi.');
    console.log(`Namespace: ${namespaceId}`);
    console.log(`Mode: ${args.dryRun ? 'dry-run' : 'write'}`);
    console.log(`Tenant sayisi: ${results.length}`);

    for (const result of results) {
      console.log(`- ${result.slug || result.tenantId}: ${result.tenantKey}, apiTokenKeys=${result.tokenKeys.length}`);
    }

    return { namespaceId, results };
  } finally {
    await database.disconnectDB();
  }
}

if (require.main === module) {
  syncEdgeGatewayKv().catch((error) => {
    console.error('\nEdge Gateway KV sync basarisiz:', error.message);
    process.exit(1);
  });
}

module.exports = syncEdgeGatewayKv;
