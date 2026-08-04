function tenantIdentity(tenant) {
  const value = tenant && typeof tenant === 'object'
    ? tenant._id ?? tenant.id
    : tenant;
  const tenantId = String(value ?? '').trim();
  if (!tenantId) throw new Error('consumer process received a tenant without an id');
  return tenantId;
}

async function runConsumerBatch(options) {
  const tenants = options.tenants || [];
  const runner = options.runner;
  const logger = options.logger || console;
  if (!runner || typeof runner.runTenant !== 'function') {
    throw new Error('consumer runner with runTenant() is required');
  }

  const summaries = [];
  for (const tenant of tenants) {
    const tenantId = tenantIdentity(tenant);
    const results = await runner.runTenant(tenantId);
    const summary = Object.freeze({
      tenantId,
      slug: tenant?.slug || null,
      results
    });
    summaries.push(summary);
    logger.info('[domainEventConsumerProcess] Tenant processed', summary);
  }
  return Object.freeze(summaries);
}

module.exports = { runConsumerBatch, tenantIdentity };
