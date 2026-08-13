# Roles and permissions

ContextHub Cloud applies access at the tenant membership boundary. A user may belong to several tenants and have a different role in each one—useful when an agency remains administrator while a client team receives editorial access.

## System roles

The built-in hierarchy is `Viewer`, `Author`, `Editor`, `Admin`, and `Owner`. System roles cannot be edited or deleted. Permissions are resource/action strings such as `content:view`, `content:update`, `placements:manage`, and `analytics:view`.

Do not infer permissions only from a role name. Read the role's returned permission list, especially for custom roles and integrations.

## Custom roles

Users with `roles:manage` can create tenant-scoped roles, optionally starting from a system role:

```http
POST https://api.ctxhub.net/api/roles
Authorization: Bearer <admin-session-token>
Content-Type: application/json

{
  "name": "Client editor",
  "description": "Edits content without managing users or settings",
  "baseRoleKey": "editor",
  "permissions": ["content:view", "content:create", "content:update"]
}
```

```text
GET    /api/roles
POST   /api/roles
PUT    /api/roles/:id
DELETE /api/roles/:id
PUT    /api/users/:id/role
```

Custom role keys cannot replace system role keys. A custom role still assigned to a membership cannot be deleted. Only an owner can assign the owner role, and owner safety checks prevent removing the tenant's last owner.

## Agency pattern

1. Keep at least two controlled owner accounts for recovery.
2. Give agency operators `Admin` or a narrow custom role.
3. Give client editors only the content, media, collection, form, menu, or placement actions they need.
4. Reserve role, user, token, tenant setting, and extension management for a small group.
5. Review membership and [activity records](./audit-activity.md) regularly.

API tokens also have a role, but their effective access is further restricted by token scopes. See [API token lifecycle](./api-token-lifecycle.md).
