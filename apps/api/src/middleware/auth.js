const { User, Membership, rbac, ApiToken } = require('@contexthub/common');
const roleService = require('../services/roleService');
const crypto = require('crypto');
const tenantContextStore = require('@contexthub/common/src/tenantContext');
const { checkRequestLimit } = require('./requestLimitGuard');

const {
  getRoleLevel,
  ROLE_KEYS,
  DEFAULT_ROLES,
  expandPermissions,
  filterPermissionsByScopes,
  normalizeScopes
} = rbac;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

const resolveTokenScopes = (scopes) => {
  const normalized = normalizeScopes(scopes);
  return normalized.length ? normalized : ['read'];
};

const scopeAllowsMethod = (method, scopeSet) => {
  if (SAFE_METHODS.has(method)) {
    return scopeSet.has('read') || scopeSet.has('write') || scopeSet.has('delete');
  }
  if (WRITE_METHODS.has(method)) {
    return scopeSet.has('write');
  }
  if (method === 'DELETE') {
    return scopeSet.has('delete');
  }
  return scopeSet.has('write');
};

// Tenant context middleware - URL'den veya header'dan tenant bilgisini alır
async function tenantContext(request, reply) {
  let tenantId = null;

  // Authorization header kontrolü - Bearer ctx_ var mı?
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.includes('ctx_')) {
    // API token kullanılıyor - tenant ID'yi token'dan alacağız
    // Bu durumda tenantId kontrolünü atlayalım, authenticate veya validateApiKey set edecek
    return;
  }

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
    // If request has Authorization header, let authenticate middleware derive tenantId from token
    if (request.headers.authorization) {
      return;
    }

    return reply.code(400).send({
      error: 'Tenant ID required',
      message: 'Please provide tenantId in query params or X-Tenant-ID header'
    });
  }

  request.tenantId = tenantId;
  tenantContextStore.setContext({ tenantId });
}

// API Token Authentication - token'dan tenant ID'yi otomatik alır
async function authenticateApiToken(request, reply) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        error: 'Authentication required',
        message: 'Authorization header with Bearer token is required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Token ctx_ ile başlamalı
    if (!token.startsWith('ctx_')) {
      return reply.code(401).send({
        error: 'Invalid token',
        message: 'API token must start with ctx_ prefix'
      });
    }

    // Token'ı hash'le
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    // Token'ı veritabanında ara
    const apiToken = await ApiToken.findOne({ hash });

    if (!apiToken) {
      return reply.code(401).send({
        error: 'Invalid token',
        message: 'API token not found or invalid'
      });
    }

    // Token süresini kontrol et
    if (apiToken.expiresAt && new Date(apiToken.expiresAt) < new Date()) {
      return reply.code(401).send({
        error: 'Token expired',
        message: 'API token has expired'
      });
    }

    // Last used at'i güncelle
    apiToken.lastUsedAt = new Date();
    await apiToken.save();

    // Request'e tenant ve token bilgilerini ekle
    request.tenantId = apiToken.tenantId.toString();
    request.apiToken = apiToken;
    request.authType = 'api_token';
    const effectiveScopes = resolveTokenScopes(apiToken.scopes || []);
    request.tokenScopes = effectiveScopes;

    if (await checkRequestLimit(request, reply)) {
      return;
    }

    // API token'ın role'ünü ve level'ını set et
    const tokenRole = apiToken.role || 'editor'; // Default: editor
    request.userRole = tokenRole;
    request.roleLevel = getRoleLevel(tokenRole);

    const scopeSet = new Set(effectiveScopes);
    if (!scopeAllowsMethod(request.method, scopeSet)) {
      return reply.code(403).send({
        error: 'InsufficientPermissions',
        message: 'API token scope does not allow this action'
      });
    }

    const roleDoc = await roleService.resolveRole({ tenantId: request.tenantId, roleKey: tokenRole });
    const fallbackRole = DEFAULT_ROLES.find((role) => role.key === tokenRole);
    const rolePermissions = roleDoc?.permissions || fallbackRole?.permissions || [];
    const expandedPermissions = expandPermissions(rolePermissions);
    const scopedPermissions = filterPermissionsByScopes(expandedPermissions, effectiveScopes);
    const normalizedPermissions = expandPermissions(scopedPermissions);
    request.userPermissions = normalizedPermissions;
    request.userPermissionSet = new Set(normalizedPermissions);

    // API token için user context'i oluştur
    // Token'ı oluşturan user varsa onu kullan, yoksa minimal context oluştur
    if (apiToken.createdBy) {
      const user = await User.findById(apiToken.createdBy).select('-password');
      if (user) {
        request.user = user;
      }
    }

    // User bulunamazsa, minimal user context oluştur (API token için)
    // createdBy/updatedBy field'ları optional olduğu için bu yeterli
    if (!request.user) {
      request.user = {
        _id: apiToken._id, // Token'ın kendi ID'si userId olarak kullanılır
        name: apiToken.name,
        isApiToken: true
      };
    }

    tenantContextStore.setContext({
      tenantId: request.tenantId,
      userId: request.user?._id?.toString?.()
    });

  } catch (err) {
    return reply.code(401).send({
      error: 'Authentication failed',
      message: err.message
    });
  }
}

// JWT Authentication middleware - hem JWT hem API token destekler
async function authenticate(request, reply) {
  const authHeader = request.headers.authorization;

  // API token kontrolü - ctx_ prefix'i varsa
  if (authHeader && authHeader.includes('ctx_')) {
    return await authenticateApiToken(request, reply);
  }

  // Normal JWT authentication için authHeader kontrolü
  if (!authHeader) {
    return reply.code(401).send({
      error: 'Authentication required',
      message: 'Authorization header is required'
    });
  }

  try {
    await request.jwtVerify();

    // Token'dan user bilgisini al
    const userId = request.user.sub;
    // Prefer explicit tenantId from header/query or context; do not rely on token claim
    const tenantId = request.tenantId || request.headers['x-tenant-id'] || request.query?.tenantId;
    if (tenantId) {
      request.tenantId = tenantId;
    } else {
      return reply.code(400).send({ error: 'Tenant ID required', message: 'Please provide tenantId in query params or X-Tenant-ID header' });
    }

    if (!userId) {
      return reply.code(401).send({ error: 'Invalid token', message: 'User ID not found in token' });
    }

    // User'ı veritabanından getir
    const user = await User.findOne({ _id: userId }).select('-password');
    if (!user) {
      return reply.code(401).send({ error: 'User not found', message: 'User does not exist' });
    }

    const payloadTokenVersion = request.user?.tokenVersion ?? 0;
    const currentTokenVersion = user.tokenVersion ?? 0;

    if (payloadTokenVersion !== currentTokenVersion) {
      return reply.code(401).send({ error: 'Session expired', message: 'Please login again' });
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

    if (await checkRequestLimit(request, reply)) {
      return;
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
    request.userPermissionSet = new Set(expandPermissions(permissions));
    request.authType = 'jwt';
    tenantContextStore.setContext({
      tenantId,
      userId: user._id?.toString?.()
    });

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

    const payloadTokenVersion = request.user?.tokenVersion ?? 0;
    const currentTokenVersion = user.tokenVersion ?? 0;

    if (payloadTokenVersion !== currentTokenVersion) {
      return reply.code(401).send({ error: 'Session expired', message: 'Please login again' });
    }

    // Request'e user bilgisini ekle (tenant kontrolü yapma)
    request.user = user;
    tenantContextStore.setContext({ userId: user._id?.toString?.() });

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
    // Owners bypass permission checks
    if (request.userRole === 'owner') {
      return;
    }

    if (!request.userPermissionSet) {
      request.userPermissionSet = new Set(expandPermissions(request.userPermissions || []));
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
