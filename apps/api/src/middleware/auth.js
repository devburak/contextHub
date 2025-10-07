const { User, Membership, rbac } = require('@contexthub/common');
const roleService = require('../services/roleService');

const { getRoleLevel, ROLE_KEYS } = rbac;

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
    const user = await User.findOne({ _id: userId }).select('-password');
    if (!user) {
      return reply.code(401).send({ error: 'User not found', message: 'User does not exist' });
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

    const { role: roleDoc, permissions } = await roleService.ensureRoleReference(membership, tenantId);

    const roleKey = roleDoc?.key || membership.role || ROLE_KEYS.VIEWER;
    const roleLevel = roleDoc?.level ?? getRoleLevel(roleKey);

    // Request'e user ve membership bilgilerini ekle
    request.user = user;
    request.membership = membership;
    request.userRole = roleKey;
    request.role = roleDoc ? roleService.formatRole(roleDoc) : null;
    request.roleLevel = roleLevel;
    request.userPermissions = permissions;
    request.userPermissionSet = new Set(permissions);

  } catch (err) {
    return reply.code(401).send({ error: 'Authentication failed', message: err.message });
  }
}

// JWT Authentication without tenant check - for listing all user's tenants
async function authenticateWithoutTenant(request, reply) {
  try {
    await request.jwtVerify();
    
    // Token'dan user bilgisini al
    const userId = request.user.sub;

    if (!userId) {
      return reply.code(401).send({ error: 'Invalid token', message: 'User ID not found in token' });
    }

    // User'ı veritabanından getir
    const user = await User.findOne({ _id: userId }).select('-password');
    if (!user) {
      return reply.code(401).send({ error: 'User not found', message: 'User does not exist' });
    }

    // Request'e user bilgisini ekle (tenant kontrolü yapma)
    request.user = user;

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

    const userLevel = request.roleLevel ?? getRoleLevel(request.userRole);
    const requiredLevels = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    const hasPermission = requiredLevels.some((roleKey) => {
      const requiredLevel = getRoleLevel(roleKey);
      return userLevel >= requiredLevel;
    });

    if (!hasPermission) {
      return reply.code(403).send({ 
        error: 'Insufficient permissions',
        message: `Required roles: ${allowedRoles.join(', ')}. Current role: ${request.userRole}` 
      });
    }
  };
}

function requirePermission(requiredPermissions, options = {}) {
  const { mode = 'all' } = options;
  const requiredList = Array.isArray(requiredPermissions)
    ? requiredPermissions.filter(Boolean)
    : [requiredPermissions].filter(Boolean);

  return async function(request, reply) {
    if (!request.userPermissionSet) {
      request.userPermissionSet = new Set(request.userPermissions || []);
    }

    const userPermissions = request.userPermissionSet;

    const check = mode === 'any'
      ? requiredList.some((permission) => userPermissions.has(permission))
      : requiredList.every((permission) => userPermissions.has(permission));

    if (!check) {
      return reply.code(403).send({
        error: 'Insufficient permissions',
        message: `Required permissions: ${requiredList.join(', ')}`
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
  authenticateWithoutTenant,
  requireRole,
  requireOwner,
  requireAdmin,
  requireEditor,
  requireAuthor,
  requirePermission
};
