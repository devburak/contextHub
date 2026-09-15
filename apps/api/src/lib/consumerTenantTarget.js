const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

function resolveConsumerTenantQuery(value) {
  const target = String(value ?? '').trim();
  if (!target) return null;
  return OBJECT_ID_PATTERN.test(target) ? { _id: target } : { slug: target };
}

module.exports = {
  OBJECT_ID_PATTERN,
  resolveConsumerTenantQuery
};
