// Mock tenant context middleware - database olmadan çalışır
async function tenantContext(request, reply) {
  console.log('Mock tenant context - query:', request.query);
  
  let tenantId = null;
  
  // Query parameter'dan
  if (request.query.tenantId) {
    tenantId = request.query.tenantId;
  }
  
  // Header'dan
  else if (request.headers['x-tenant-id']) {
    tenantId = request.headers['x-tenant-id'];
  }
  
  // Default mock tenant
  else {
    tenantId = 'mock-tenant-id';
  }
  
  request.tenantId = tenantId;
  console.log('Mock tenant context - set tenantId:', tenantId);
}

// Mock auth middleware
async function requireAuth(request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
  }
}

module.exports = {
  tenantContext,
  requireAuth
};
