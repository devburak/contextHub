const { PERMISSIONS } = require('./permissions');

const ROLE_KEYS = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  EDITOR: 'editor',
  AUTHOR: 'author',
  VIEWER: 'viewer'
});

const ROLE_LEVELS = Object.freeze({
  [ROLE_KEYS.VIEWER]: 10,
  [ROLE_KEYS.AUTHOR]: 20,
  [ROLE_KEYS.EDITOR]: 30,
  [ROLE_KEYS.ADMIN]: 40,
  [ROLE_KEYS.OWNER]: 50
});

const DEFAULT_ROLES = [
  {
    key: ROLE_KEYS.OWNER,
    name: 'Owner',
    description: 'Full access to all tenant resources and configuration.',
    level: ROLE_LEVELS[ROLE_KEYS.OWNER],
    permissions: Object.values(PERMISSIONS),
    isDefault: true,
    isSystem: true
  },
  {
    key: ROLE_KEYS.ADMIN,
    name: 'Administrator',
    description: 'Manage tenant configuration, users, and content.',
    level: ROLE_LEVELS[ROLE_KEYS.ADMIN],
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.CONTENT_VIEW,
      PERMISSIONS.CONTENT_MANAGE,
      PERMISSIONS.MEDIA_VIEW,
      PERMISSIONS.MEDIA_MANAGE,
      PERMISSIONS.CATEGORIES_VIEW,
      PERMISSIONS.CATEGORIES_MANAGE,
      PERMISSIONS.FORMS_VIEW,
      PERMISSIONS.FORMS_MANAGE,
      PERMISSIONS.PLACEMENTS_VIEW,
      PERMISSIONS.PLACEMENTS_MANAGE,
      PERMISSIONS.MENUS_VIEW,
      PERMISSIONS.MENUS_MANAGE,
      PERMISSIONS.ANALYTICS_VIEW,
      PERMISSIONS.USERS_VIEW,
      PERMISSIONS.USERS_MANAGE,
      PERMISSIONS.USERS_INVITE,
      PERMISSIONS.USERS_ASSIGN_ROLE,
      PERMISSIONS.ROLES_VIEW,
      PERMISSIONS.ROLES_MANAGE,
      PERMISSIONS.PROFILE_UPDATE,
      PERMISSIONS.TENANTS_VIEW,
      PERMISSIONS.TENANTS_MANAGE,
      PERMISSIONS.SETTINGS_MANAGE
    ],
    isDefault: true,
    isSystem: true
  },
  {
    key: ROLE_KEYS.EDITOR,
    name: 'Editor',
    description: 'Create and manage most tenant content.',
    level: ROLE_LEVELS[ROLE_KEYS.EDITOR],
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.CONTENT_VIEW,
      PERMISSIONS.CONTENT_MANAGE,
      PERMISSIONS.MEDIA_VIEW,
      PERMISSIONS.MEDIA_MANAGE,
      PERMISSIONS.CATEGORIES_VIEW,
      PERMISSIONS.CATEGORIES_MANAGE,
      PERMISSIONS.FORMS_VIEW,
      PERMISSIONS.FORMS_MANAGE,
      PERMISSIONS.PLACEMENTS_VIEW,
      PERMISSIONS.PLACEMENTS_MANAGE,
      PERMISSIONS.MENUS_VIEW,
      PERMISSIONS.MENUS_MANAGE,
      PERMISSIONS.ANALYTICS_VIEW,
      PERMISSIONS.PROFILE_UPDATE
    ],
    isDefault: true,
    isSystem: true
  },
  {
    key: ROLE_KEYS.AUTHOR,
    name: 'Author',
    description: 'Edit existing content and upload media.',
    level: ROLE_LEVELS[ROLE_KEYS.AUTHOR],
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.CONTENT_VIEW,
      PERMISSIONS.CONTENT_MANAGE,
      PERMISSIONS.MEDIA_VIEW,
      PERMISSIONS.MEDIA_MANAGE,
      PERMISSIONS.ANALYTICS_VIEW,
      PERMISSIONS.PROFILE_UPDATE
    ],
    isDefault: true,
    isSystem: true
  },
  {
    key: ROLE_KEYS.VIEWER,
    name: 'Viewer',
    description: 'Read-only access to tenant content.',
    level: ROLE_LEVELS[ROLE_KEYS.VIEWER],
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.CONTENT_VIEW,
      PERMISSIONS.MEDIA_VIEW,
      PERMISSIONS.CATEGORIES_VIEW,
      PERMISSIONS.FORMS_VIEW,
      PERMISSIONS.PLACEMENTS_VIEW,
      PERMISSIONS.MENUS_VIEW,
      PERMISSIONS.ANALYTICS_VIEW,
      PERMISSIONS.PROFILE_UPDATE
    ],
    isDefault: true,
    isSystem: true
  }
];

const getRoleLevel = (roleKey) => ROLE_LEVELS[roleKey] ?? 0;

module.exports = {
  ROLE_KEYS,
  ROLE_LEVELS,
  DEFAULT_ROLES,
  getRoleLevel
};
