const {
  PERMISSIONS,
  PERMISSION_GROUPS,
  MANAGE_IMPLIED_PERMISSIONS,
  expandPermissions,
  filterPermissionsByScopes,
  normalizeScopes
} = require('./permissions');
const { ROLE_KEYS, ROLE_LEVELS, DEFAULT_ROLES, getRoleLevel } = require('./roles');

module.exports = {
  PERMISSIONS,
  PERMISSION_GROUPS,
  MANAGE_IMPLIED_PERMISSIONS,
  expandPermissions,
  filterPermissionsByScopes,
  normalizeScopes,
  ROLE_KEYS,
  ROLE_LEVELS,
  DEFAULT_ROLES,
  getRoleLevel
};
