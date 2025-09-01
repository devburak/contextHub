const { User, Membership } = require('@contexthub/common');

// Tenant context middleware - URL'den veya header'dan tenant bilgisini alır
async function tenantContext(request, reply) {
  let tenantId = null;
  
  // Query parameter'dan
  if (request.query.tenantId) {
    tenantId = request.query.tenantId;
  }
  
  // Header'dan
  else if (request.headers['x-tenant-id']) {
    tenantId = request.headers['x-tenant-id'];
  }
  
  // Subdomain'den (gelecekte)
  // else if (request.headers.host) {
  //   const subdomain = request.headers.host.split('.')[0];
  //   // Subdomain'e göre tenant bulma logic'i
  // }

  if (!tenantId) {
    return reply.code(400).send({ 
      error: 'Tenant ID required',
      message: 'Please provide tenantId in query params or X-Tenant-ID header' 
    });
  }

  request.tenantId = tenantId;
}

// JWT Authentication middleware
async function authenticate(request, reply) {
  try {
    await request.jwtVerify();
    
    // Token'dan user bilgisini al
    const userId = request.user.sub;
    const tenantId = request.tenantId;

    if (!userId) {
      return reply.code(401).send({ error: 'Invalid token', message: 'User ID not found in token' });
    }

    // User'ı veritabanından getir
    const user = await User.findOne({ _id: userId, tenantId }).select('-password');
    if (!user) {
      return reply.code(401).send({ error: 'User not found', message: 'User does not exist or not in this tenant' });
    }

    // User'ın bu tenant'taki membership'ini kontrol et
    const membership = await Membership.findOne({ 
      userId, 
      tenantId, 
      status: 'active' 
    });

    if (!membership) {
      return reply.code(403).send({ 
        error: 'Access denied', 
        message: 'User does not have access to this tenant' 
      });
    }

    // Request'e user ve membership bilgilerini ekle
    request.user = user;
    request.membership = membership;
    request.userRole = membership.role;

  } catch (err) {
    return reply.code(401).send({ error: 'Authentication failed', message: err.message });
  }
}

// Role-based authorization middleware
function requireRole(allowedRoles) {
  return async function(request, reply) {
    if (!request.userRole) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const roleHierarchy = ['viewer', 'author', 'editor', 'admin', 'owner'];
    const userRoleIndex = roleHierarchy.indexOf(request.userRole);
    const hasPermission = allowedRoles.some(role => {
      const requiredRoleIndex = roleHierarchy.indexOf(role);
      return userRoleIndex >= requiredRoleIndex;
    });

    if (!hasPermission) {
      return reply.code(403).send({ 
        error: 'Insufficient permissions',
        message: `Required roles: ${allowedRoles.join(', ')}. Current role: ${request.userRole}` 
      });
    }
  };
}

// Owner-only middleware
const requireOwner = requireRole(['owner']);

// Admin+ middleware  
const requireAdmin = requireRole(['admin', 'owner']);

// Editor+ middleware
const requireEditor = requireRole(['editor', 'admin', 'owner']);

// Author+ middleware  
const requireAuthor = requireRole(['author', 'editor', 'admin', 'owner']);

module.exports = {
  tenantContext,
  authenticate,
  requireRole,
  requireOwner,
  requireAdmin,
  requireEditor,
  requireAuthor
};
