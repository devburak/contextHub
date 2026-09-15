const {
  authenticate,
  requirePermission,
  tenantContext
} = require('../middleware/auth');

class ExtensionAuthFacadeError extends Error {
  constructor(message, code = 'EXTENSION_AUTH_INVALID') {
    super(message);
    this.name = 'ExtensionAuthFacadeError';
    this.code = code;
  }
}

function createExtensionAuthFacade(manifest) {
  const declaredPermissions = new Set(manifest.permissions);

  return Object.freeze({
    require({ permissions, mode = 'all', sessionOnly = true } = {}) {
      const required = Array.isArray(permissions)
        ? permissions.filter(Boolean)
        : [permissions].filter(Boolean);
      if (!required.length) {
        throw new ExtensionAuthFacadeError('at least one permission is required');
      }
      const undeclared = required.find((permission) => !declaredPermissions.has(permission));
      if (undeclared) {
        throw new ExtensionAuthFacadeError(
          `permission is not declared by plugin ${manifest.name}: ${undeclared}`,
          'EXTENSION_PERMISSION_NOT_DECLARED'
        );
      }
      if (!['all', 'any'].includes(mode)) {
        throw new ExtensionAuthFacadeError('permission mode must be all or any');
      }
      const handlers = [tenantContext, authenticate];
      if (sessionOnly) {
        handlers.push(async function requireExtensionSession(request, reply) {
          if (request.authType !== 'jwt') {
            return reply.code(403).send({
              error: 'SessionRequired',
              message: 'This extension route requires an authenticated admin session'
            });
          }
        });
      }
      handlers.push(requirePermission(required, { mode }));
      return Object.freeze(handlers);
    },

    tenantId(request) {
      const tenantId = String(request?.tenantId ?? '').trim();
      if (!tenantId) {
        throw new ExtensionAuthFacadeError('authenticated tenant context is required');
      }
      return tenantId;
    },

    userId(request) {
      const userId = String(request?.user?._id ?? request?.user?.id ?? '').trim();
      return userId || null;
    }
  });
}

module.exports = {
  ExtensionAuthFacadeError,
  createExtensionAuthFacade
};
