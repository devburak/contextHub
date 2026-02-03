const { Role, Membership, rbac } = require('@contexthub/common');

const { DEFAULT_ROLES, ROLE_KEYS, getRoleLevel } = rbac;
const { PERMISSIONS } = rbac;

class RoleService {
  constructor() {
    this.validPermissions = new Set(Object.values(PERMISSIONS));
  }

  normalizeKey(input) {
    if (!input) return '';
    return String(input)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  async ensureSystemRoles() {
    if (!Role?.db || Role.db.readyState !== 1) {
      return;
    }

    for (const roleDef of DEFAULT_ROLES) {
      try {
        await Role.findOneAndUpdate(
          { tenantId: null, key: roleDef.key },
          {
            ...roleDef,
            tenantId: null,
            isSystem: true,
            isDefault: true
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (error) {
        if (error?.code === 11000) {
          await Role.updateOne(
            { tenantId: null, key: roleDef.key },
            {
              ...roleDef,
              tenantId: null,
              isSystem: true,
              isDefault: true
            }
          );
          continue;
        }
        throw error;
      }
    }
  }

  async getSystemRoles() {
    return Role.find({ tenantId: null }).sort({ level: -1, key: 1 });
  }

  async listRoles(tenantId) {
    await this.ensureSystemRoles();
    const [systemRoles, tenantRoles] = await Promise.all([
      this.getSystemRoles(),
      tenantId ? Role.find({ tenantId }).sort({ level: -1, key: 1 }) : []
    ]);

    const combined = [...systemRoles, ...tenantRoles];
    return combined.map((role) => this.formatRole(role));
  }

  async resolveRole({ tenantId, roleId, roleKey }) {
    if (!roleId && !roleKey) {
      return null;
    }

    if (roleId) {
      const role = await Role.findById(roleId);
      if (role) {
        return role;
      }
    }

    if (!roleKey) {
      return null;
    }

    const normalizedKey = this.normalizeKey(roleKey);

    if (tenantId) {
      const tenantRole = await Role.findOne({ tenantId, key: normalizedKey });
      if (tenantRole) {
        return tenantRole;
      }
    }

    // Fallback to system role
    const systemRole = await Role.findOne({ tenantId: null, key: normalizedKey });
    if (systemRole) {
      return systemRole;
    }

    const defaultRole = DEFAULT_ROLES.find((role) => role.key === normalizedKey);
    if (defaultRole && Role?.db && Role.db.readyState === 1) {
      try {
        return await Role.findOneAndUpdate(
          { tenantId: null, key: normalizedKey },
          {
            ...defaultRole,
            tenantId: null,
            isSystem: true,
            isDefault: true
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (error) {
        if (error?.code === 11000) {
          return await Role.findOne({ tenantId: null, key: normalizedKey });
        }
        throw error;
      }
    }

    return null;
  }

  validatePermissions(permissionList = []) {
    const unique = new Set();
    for (const permission of permissionList) {
      if (this.validPermissions.has(permission)) {
        unique.add(permission);
      }
    }
    return Array.from(unique);
  }

  async createRole(tenantId, payload, operatorId) {
    if (!tenantId) {
      throw new Error('Tenant ID is required to create custom roles');
    }

    const {
      name,
      description = '',
      key: providedKey,
      level: providedLevel,
      permissions: providedPermissions,
      baseRoleKey
    } = payload;

    if (!name || !name.trim()) {
      throw new Error('Role name is required');
    }

    const key = this.normalizeKey(providedKey || name);
    if (!key) {
      throw new Error('Role key cannot be empty');
    }

    const existingRole = await Role.findOne({ tenantId, key });
    if (existingRole) {
      throw new Error('A role with this key already exists for the tenant');
    }

    if (Object.values(ROLE_KEYS).includes(key)) {
      throw new Error('Cannot override a system role key');
    }

    let baseRole = null;

    if (baseRoleKey) {
      baseRole = await this.resolveRole({ tenantId, roleKey: baseRoleKey });
      if (!baseRole) {
        throw new Error('Base role not found');
      }
    }

    const level = Number.isFinite(providedLevel)
      ? providedLevel
      : baseRole?.level ?? getRoleLevel(ROLE_KEYS.VIEWER);

    if (level < 0 || level > getRoleLevel(ROLE_KEYS.OWNER)) {
      throw new Error('Invalid role level provided');
    }

    const permissions = this.validatePermissions(
      Array.isArray(providedPermissions) && providedPermissions.length
        ? providedPermissions
        : baseRole?.permissions ?? []
    );

    const role = new Role({
      tenantId,
      key,
      name: name.trim(),
      description: description.trim(),
      level,
      permissions,
      isDefault: false,
      isSystem: false,
      createdBy: operatorId || null,
      updatedBy: operatorId || null
    });

    await role.save();

    return this.formatRole(role);
  }

  async updateRole(roleId, tenantId, updates = {}, operatorId) {
    if (!roleId) {
      throw new Error('Role ID is required');
    }

    const role = await Role.findById(roleId);

    if (!role) {
      throw new Error('Role not found');
    }

    if (role.isSystem || role.tenantId === null) {
      throw new Error('System roles cannot be modified');
    }

    if (tenantId && String(role.tenantId) !== String(tenantId)) {
      throw new Error('Cannot modify roles outside of the tenant scope');
    }

    const next = {};

    if (updates.name) {
      next.name = updates.name.trim();
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'description')) {
      next.description = (updates.description || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'level')) {
      const level = Number(updates.level);
      if (!Number.isFinite(level) || level < 0 || level > getRoleLevel(ROLE_KEYS.OWNER)) {
        throw new Error('Invalid role level provided');
      }
      next.level = level;
    }

    if (Array.isArray(updates.permissions)) {
      next.permissions = this.validatePermissions(updates.permissions);
    }

    if (Object.keys(next).length === 0) {
      return this.formatRole(role);
    }

    next.updatedBy = operatorId || null;

    const updatedRole = await Role.findByIdAndUpdate(roleId, next, { new: true });

    return this.formatRole(updatedRole);
  }

  async deleteRole(roleId, tenantId) {
    const role = await Role.findById(roleId);
    if (!role) {
      throw new Error('Role not found');
    }

    if (role.isSystem || role.tenantId === null) {
      throw new Error('System roles cannot be removed');
    }

    if (tenantId && String(role.tenantId) !== String(tenantId)) {
      throw new Error('Cannot delete roles outside of the tenant scope');
    }

    const membershipCount = await Membership.countDocuments({ tenantId: role.tenantId, role: role.key });
    if (membershipCount > 0) {
      throw new Error('Role is assigned to users and cannot be deleted');
    }

    await Role.findByIdAndDelete(roleId);

    return { success: true };
  }

  async ensureRoleReference(membership, tenantId) {
    if (!membership) {
      return { role: null, permissions: [] };
    }

    let roleDoc = await this.resolveRole({
      tenantId,
      roleId: membership.roleId,
      roleKey: membership.role
    });
    let hasChanges = false;

    if (!roleDoc) {
      roleDoc = await this.resolveRole({ tenantId, roleKey: ROLE_KEYS.OWNER })
        || await this.resolveRole({ tenantId: null, roleKey: ROLE_KEYS.OWNER })
        || await this.resolveRole({ tenantId, roleKey: ROLE_KEYS.ADMIN })
        || await this.resolveRole({ tenantId: null, roleKey: ROLE_KEYS.ADMIN })
        || roleDoc;

      if (roleDoc) {
        membership.role = roleDoc.key;
        membership.roleId = roleDoc._id;
        hasChanges = true;
      }
    }

    if (roleDoc && (!membership.roleId || String(membership.roleId) !== String(roleDoc._id))) {
      membership.roleId = roleDoc._id;
      membership.role = roleDoc.key;
      hasChanges = true;
    }

    if (hasChanges) {
      await membership.save();
    }

    const permissions = membership.getEffectivePermissions(roleDoc);

    return { role: roleDoc, permissions };
  }

  formatRole(roleDoc) {
    if (!roleDoc) {
      return null;
    }

    return {
      id: roleDoc._id.toString(),
      key: roleDoc.key,
      name: roleDoc.name,
      description: roleDoc.description,
      level: roleDoc.level,
      permissions: Array.isArray(roleDoc.permissions) ? roleDoc.permissions : [],
      tenantId: roleDoc.tenantId ? roleDoc.tenantId.toString() : null,
      isDefault: Boolean(roleDoc.isDefault),
      isSystem: Boolean(roleDoc.isSystem)
    };
  }
}

module.exports = new RoleService();
