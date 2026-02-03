const PERMISSIONS = Object.freeze({
  DASHBOARD_VIEW: 'dashboard:view',
  USERS_VIEW: 'users:view',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  USERS_MANAGE: 'users:manage',
  USERS_INVITE: 'users:invite',
  USERS_ASSIGN_ROLE: 'users:assign-role',
  ROLES_VIEW: 'roles:view',
  ROLES_CREATE: 'roles:create',
  ROLES_UPDATE: 'roles:update',
  ROLES_DELETE: 'roles:delete',
  ROLES_MANAGE: 'roles:manage',
  PROFILE_UPDATE: 'profile:update',
  TENANTS_VIEW: 'tenants:view',
  TENANTS_CREATE: 'tenants:create',
  TENANTS_UPDATE: 'tenants:update',
  TENANTS_DELETE: 'tenants:delete',
  TENANTS_MANAGE: 'tenants:manage',
  CONTENT_VIEW: 'content:view',
  CONTENT_CREATE: 'content:create',
  CONTENT_UPDATE: 'content:update',
  CONTENT_DELETE: 'content:delete',
  CONTENT_MANAGE: 'content:manage',
  MEDIA_VIEW: 'media:view',
  MEDIA_CREATE: 'media:create',
  MEDIA_UPDATE: 'media:update',
  MEDIA_DELETE: 'media:delete',
  MEDIA_MANAGE: 'media:manage',
  CATEGORIES_VIEW: 'categories:view',
  CATEGORIES_CREATE: 'categories:create',
  CATEGORIES_UPDATE: 'categories:update',
  CATEGORIES_DELETE: 'categories:delete',
  CATEGORIES_MANAGE: 'categories:manage',
  COLLECTIONS_VIEW: 'collections:view',
  COLLECTIONS_CREATE: 'collections:create',
  COLLECTIONS_UPDATE: 'collections:update',
  COLLECTIONS_DELETE: 'collections:delete',
  COLLECTIONS_MANAGE: 'collections:manage',
  FORMS_VIEW: 'forms:view',
  FORMS_CREATE: 'forms:create',
  FORMS_UPDATE: 'forms:update',
  FORMS_DELETE: 'forms:delete',
  FORMS_MANAGE: 'forms:manage',
  PLACEMENTS_VIEW: 'placements:view',
  PLACEMENTS_CREATE: 'placements:create',
  PLACEMENTS_UPDATE: 'placements:update',
  PLACEMENTS_DELETE: 'placements:delete',
  PLACEMENTS_MANAGE: 'placements:manage',
  MENUS_VIEW: 'menus:view',
  MENUS_CREATE: 'menus:create',
  MENUS_UPDATE: 'menus:update',
  MENUS_DELETE: 'menus:delete',
  MENUS_MANAGE: 'menus:manage',
  ANALYTICS_VIEW: 'analytics:view',
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_MANAGE: 'settings:manage'
});

const MANAGE_IMPLIED_PERMISSIONS = Object.freeze({
  [PERMISSIONS.USERS_MANAGE]: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_UPDATE,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.USERS_INVITE,
    PERMISSIONS.USERS_ASSIGN_ROLE
  ],
  [PERMISSIONS.ROLES_MANAGE]: [
    PERMISSIONS.ROLES_VIEW,
    PERMISSIONS.ROLES_CREATE,
    PERMISSIONS.ROLES_UPDATE,
    PERMISSIONS.ROLES_DELETE
  ],
  [PERMISSIONS.TENANTS_MANAGE]: [
    PERMISSIONS.TENANTS_VIEW,
    PERMISSIONS.TENANTS_CREATE,
    PERMISSIONS.TENANTS_UPDATE,
    PERMISSIONS.TENANTS_DELETE
  ],
  [PERMISSIONS.CONTENT_MANAGE]: [
    PERMISSIONS.CONTENT_VIEW,
    PERMISSIONS.CONTENT_CREATE,
    PERMISSIONS.CONTENT_UPDATE,
    PERMISSIONS.CONTENT_DELETE
  ],
  [PERMISSIONS.MEDIA_MANAGE]: [
    PERMISSIONS.MEDIA_VIEW,
    PERMISSIONS.MEDIA_CREATE,
    PERMISSIONS.MEDIA_UPDATE,
    PERMISSIONS.MEDIA_DELETE
  ],
  [PERMISSIONS.CATEGORIES_MANAGE]: [
    PERMISSIONS.CATEGORIES_VIEW,
    PERMISSIONS.CATEGORIES_CREATE,
    PERMISSIONS.CATEGORIES_UPDATE,
    PERMISSIONS.CATEGORIES_DELETE
  ],
  [PERMISSIONS.COLLECTIONS_MANAGE]: [
    PERMISSIONS.COLLECTIONS_VIEW,
    PERMISSIONS.COLLECTIONS_CREATE,
    PERMISSIONS.COLLECTIONS_UPDATE,
    PERMISSIONS.COLLECTIONS_DELETE
  ],
  [PERMISSIONS.FORMS_MANAGE]: [
    PERMISSIONS.FORMS_VIEW,
    PERMISSIONS.FORMS_CREATE,
    PERMISSIONS.FORMS_UPDATE,
    PERMISSIONS.FORMS_DELETE
  ],
  [PERMISSIONS.PLACEMENTS_MANAGE]: [
    PERMISSIONS.PLACEMENTS_VIEW,
    PERMISSIONS.PLACEMENTS_CREATE,
    PERMISSIONS.PLACEMENTS_UPDATE,
    PERMISSIONS.PLACEMENTS_DELETE
  ],
  [PERMISSIONS.MENUS_MANAGE]: [
    PERMISSIONS.MENUS_VIEW,
    PERMISSIONS.MENUS_CREATE,
    PERMISSIONS.MENUS_UPDATE,
    PERMISSIONS.MENUS_DELETE
  ],
  [PERMISSIONS.SETTINGS_MANAGE]: [
    PERMISSIONS.SETTINGS_VIEW,
    PERMISSIONS.SETTINGS_UPDATE
  ]
});

const expandPermissions = (permissions = []) => {
  const set = new Set(permissions.filter(Boolean));

  for (const [managePermission, impliedPermissions] of Object.entries(MANAGE_IMPLIED_PERMISSIONS)) {
    if (!set.has(managePermission)) continue;
    impliedPermissions.forEach((permission) => set.add(permission));
  }

  for (const [managePermission, impliedPermissions] of Object.entries(MANAGE_IMPLIED_PERMISSIONS)) {
    if (impliedPermissions.every((permission) => set.has(permission))) {
      set.add(managePermission);
    }
  }

  return Array.from(set);
};

const normalizeScopes = (scopes = []) => {
  return Array.from(new Set(
    scopes
      .map((scope) => String(scope || '').trim().toLowerCase())
      .filter(Boolean)
  ));
};

const scopeAllowsPermission = (permission, scopeSet) => {
  const [, action = ''] = String(permission || '').split(':');

  if (!action) {
    return false;
  }

  if (action === 'view') {
    return scopeSet.has('read') || scopeSet.has('write') || scopeSet.has('delete');
  }

  if (action === 'create' || action === 'update' || action === 'invite' || action === 'assign-role') {
    return scopeSet.has('write');
  }

  if (action === 'delete') {
    return scopeSet.has('delete');
  }

  if (action === 'manage') {
    return scopeSet.has('write');
  }

  return scopeSet.has('write');
};

const filterPermissionsByScopes = (permissions = [], scopes = []) => {
  const scopeSet = new Set(normalizeScopes(scopes));
  if (scopeSet.size === 0) {
    return [];
  }

  return permissions.filter((permission) => scopeAllowsPermission(permission, scopeSet));
};

const PERMISSION_GROUPS = Object.freeze({
  USERS: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_UPDATE,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.USERS_INVITE,
    PERMISSIONS.USERS_ASSIGN_ROLE
  ],
  ROLES: [
    PERMISSIONS.ROLES_VIEW,
    PERMISSIONS.ROLES_CREATE,
    PERMISSIONS.ROLES_UPDATE,
    PERMISSIONS.ROLES_DELETE
  ],
  PROFILE: [PERMISSIONS.PROFILE_UPDATE],
  TENANTS: [
    PERMISSIONS.TENANTS_VIEW,
    PERMISSIONS.TENANTS_CREATE,
    PERMISSIONS.TENANTS_UPDATE,
    PERMISSIONS.TENANTS_DELETE
  ],
  CONTENT: [
    PERMISSIONS.CONTENT_VIEW,
    PERMISSIONS.CONTENT_CREATE,
    PERMISSIONS.CONTENT_UPDATE,
    PERMISSIONS.CONTENT_DELETE
  ],
  MEDIA: [
    PERMISSIONS.MEDIA_VIEW,
    PERMISSIONS.MEDIA_CREATE,
    PERMISSIONS.MEDIA_UPDATE,
    PERMISSIONS.MEDIA_DELETE
  ],
  CATEGORIES: [
    PERMISSIONS.CATEGORIES_VIEW,
    PERMISSIONS.CATEGORIES_CREATE,
    PERMISSIONS.CATEGORIES_UPDATE,
    PERMISSIONS.CATEGORIES_DELETE
  ],
  COLLECTIONS: [
    PERMISSIONS.COLLECTIONS_VIEW,
    PERMISSIONS.COLLECTIONS_CREATE,
    PERMISSIONS.COLLECTIONS_UPDATE,
    PERMISSIONS.COLLECTIONS_DELETE
  ],
  FORMS: [
    PERMISSIONS.FORMS_VIEW,
    PERMISSIONS.FORMS_CREATE,
    PERMISSIONS.FORMS_UPDATE,
    PERMISSIONS.FORMS_DELETE
  ],
  PLACEMENTS: [
    PERMISSIONS.PLACEMENTS_VIEW,
    PERMISSIONS.PLACEMENTS_CREATE,
    PERMISSIONS.PLACEMENTS_UPDATE,
    PERMISSIONS.PLACEMENTS_DELETE
  ],
  MENUS: [
    PERMISSIONS.MENUS_VIEW,
    PERMISSIONS.MENUS_CREATE,
    PERMISSIONS.MENUS_UPDATE,
    PERMISSIONS.MENUS_DELETE
  ],
  ANALYTICS: [PERMISSIONS.ANALYTICS_VIEW],
  SETTINGS: [PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_UPDATE],
  DASHBOARD: [PERMISSIONS.DASHBOARD_VIEW]
});

module.exports = {
  PERMISSIONS,
  PERMISSION_GROUPS,
  MANAGE_IMPLIED_PERMISSIONS,
  expandPermissions,
  filterPermissionsByScopes,
  normalizeScopes
};
