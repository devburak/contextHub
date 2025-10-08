const { User, Membership, rbac, mongoose } = require('@contexthub/common');
const bcrypt = require('bcryptjs');
const roleService = require('./roleService');

const { ROLE_KEYS } = rbac;

class UserService {
  async createUser({ email, password, firstName, lastName, tenantId, role = ROLE_KEYS.ADMIN }) {
    // Şifre hash'leme işlemini User model'inde yaptığımız için burada yapmaya gerek yok
    const user = new User({
      email,
      password, // Model'de pre-save middleware ile hash'lenecek
      firstName,
      lastName,
      tenantId
    });

    await user.save();

    // Kullanıcı tenant ilişkisini oluştur
    if (tenantId) {
      const normalizedRole = roleService.normalizeKey(role) || ROLE_KEYS.ADMIN;
      let resolvedRole = null;

      if (normalizedRole) {
        resolvedRole = await roleService.resolveRole({ tenantId, roleKey: normalizedRole });
        if (!resolvedRole && normalizedRole !== ROLE_KEYS.VIEWER && normalizedRole !== ROLE_KEYS.ADMIN) {
          throw new Error('Role not found');
        }
      }

      const fallbackRole = resolvedRole
        || await roleService.resolveRole({ tenantId, roleKey: ROLE_KEYS.ADMIN })
        || await roleService.resolveRole({ tenantId: null, roleKey: ROLE_KEYS.ADMIN })
        || await roleService.resolveRole({ tenantId, roleKey: ROLE_KEYS.OWNER })
        || await roleService.resolveRole({ tenantId: null, roleKey: ROLE_KEYS.OWNER })
        || await roleService.resolveRole({ tenantId, roleKey: ROLE_KEYS.VIEWER })
        || await roleService.resolveRole({ tenantId: null, roleKey: ROLE_KEYS.VIEWER });

      const membership = new Membership({
        tenantId,
        userId: user._id,
        role: (resolvedRole || fallbackRole)?.key || ROLE_KEYS.ADMIN,
        roleId: (resolvedRole || fallbackRole)?._id || null,
        status: 'active'
      });
      await membership.save();
    }

    return user;
  }

  async findUserByEmail(email) {
    if (!email) {
      return null;
    }

    return await User.findOne({ email });
  }

  async getUserById(userId, tenantId) {
    return await User.findOne({ _id: userId, tenantId }).select('-password');
  }

  async getUserByEmail(email, tenantId) {
    return await User.findOne({ email, tenantId });
  }

  async getUsersByTenant(tenantId, options = {}) {
    const {
      page = 1,
      limit = 10,
      search = '',
      status,
      role
    } = options;

    const pageNumber = Math.max(1, Number.isFinite(Number(page)) ? Number(page) : 1);
    const limitNumber = Math.max(1, Number.isFinite(Number(limit)) ? Number(limit) : 10);
    const skip = (pageNumber - 1) * limitNumber;

    let tenantObjectId;
    try {
      tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    } catch (error) {
      throw new Error('Invalid tenant identifier');
    }

    const membershipMatch = { tenantId: tenantObjectId };

    if (status && status !== 'all') {
      membershipMatch.status = status;
    }

    if (role && role !== 'all') {
      membershipMatch.role = role;
    }

    const pipeline = [
      { $match: membershipMatch },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' }
    ];

    if (search) {
      const regex = new RegExp(search, 'i');
      pipeline.push({
        $match: {
          $or: [
            { 'user.firstName': regex },
            { 'user.lastName': regex },
            { 'user.email': regex }
          ]
        }
      });
    }

    pipeline.push(
      { $sort: { 'user.createdAt': -1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limitNumber },
            {
              $project: {
                _id: 0,
                id: { $toString: '$user._id' },
                email: '$user.email',
                firstName: '$user.firstName',
                lastName: '$user.lastName',
                username: '$user.username',
                status: '$status',
                role: '$role',
                createdAt: '$user.createdAt',
                lastLoginAt: '$user.lastLoginAt'
              }
            }
          ],
          totalCount: [
            { $count: 'count' }
          ]
        }
      },
      {
        $addFields: {
          total: {
            $ifNull: [{ $arrayElemAt: ['$totalCount.count', 0] }, 0]
          }
        }
      },
      {
        $project: {
          data: 1,
          total: 1
        }
      }
    );

    const [aggregateResult = {}] = await Membership.aggregate(pipeline);
    const users = Array.isArray(aggregateResult.data) ? aggregateResult.data : [];
    const total = aggregateResult.total || 0;

    const totalPages = limitNumber ? Math.ceil(total / limitNumber) : 0;
    const offset = total === 0 ? 0 : Math.min(skip, Math.max(total - 1, 0));

    return {
      users,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        pages: totalPages,
        offset,
        hasPrevPage: pageNumber > 1,
        hasNextPage: pageNumber < totalPages
      }
    };
  }

  async updateUser(userId, tenantId, updates) {
    // Şifre güncelleniyorsa hash'le
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    const user = await User.findOneAndUpdate(
      { _id: userId, tenantId },
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).select('-password');

    return user;
  }

  async detachUserFromTenant(userId, tenantId) {
    const membership = await Membership.findOne({ userId, tenantId });

    if (!membership) {
      return null;
    }

    if (membership.role === ROLE_KEYS.OWNER) {
      const otherOwnerExists = await Membership.exists({
        tenantId,
        role: membership.role,
        status: 'active',
        userId: { $ne: userId }
      });

      if (!otherOwnerExists) {
        const error = new Error('Tenant için en az bir aktif sahibi bırakmalısınız.');
        error.code = 'LAST_OWNER';
        throw error;
      }
    }

    await Membership.deleteOne({ _id: membership._id });

    return {
      status: membership.status,
      removedAt: new Date()
    };
  }

  async updateOwnProfile(userId, updates = {}) {
    const user = await User.findById(userId);

    if (!user) {
      return null;
    }

    const allowedFields = ['firstName', 'lastName', 'email'];
    let hasChanges = false;

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        const nextValue = updates[field];
        if (typeof nextValue === 'string') {
          user[field] = nextValue.trim();
        } else if (nextValue === null) {
          user[field] = undefined;
        }
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      return user.toObject({ versionKey: false });
    }

    await user.save();

    return user.toObject({ versionKey: false });
  }

  async updateUserRole(userId, tenantId, roleKey) {
    const resolvedRole = await roleService.resolveRole({ tenantId, roleKey });

    if (!resolvedRole) {
      throw new Error('Role not found');
    }

    const membership = await Membership.findOneAndUpdate(
      { userId, tenantId },
      {
        role: resolvedRole.key,
        roleId: resolvedRole._id,
        permissions: [],
        updatedAt: new Date()
      },
      { new: true }
    );

    return membership;
  }

  async toggleUserStatus(userId, tenantId) {
    const membership = await Membership.findOne({ userId, tenantId });

    if (!membership) {
      return null;
    }

    const nextStatus = membership.status === 'active' ? 'inactive' : 'active';

    if (membership.role === ROLE_KEYS.OWNER && nextStatus !== 'active') {
      const otherOwnerExists = await Membership.exists({
        tenantId,
        role: membership.role,
        status: 'active',
        userId: { $ne: userId }
      });

      if (!otherOwnerExists) {
        const error = new Error('Son sahibi pasifleştiremezsiniz.');
        error.code = 'LAST_OWNER';
        throw error;
      }
    }

    membership.status = nextStatus;
    membership.updatedAt = new Date();
    await membership.save();

    return membership;
  }

  async getUserMemberships(userId) {
    const memberships = await Membership.find({ userId, status: 'active' })
      .populate('tenantId', 'name slug')
      .sort({ createdAt: -1 });

    return Promise.all(memberships.map(async (membership) => {
      const tenantDoc = membership.tenantId;
      const tenantId = tenantDoc?._id?.toString() || membership.tenantId?.toString();
      const { role: roleDoc, permissions } = await roleService.ensureRoleReference(
        membership,
        tenantId
      );

      return {
        id: membership._id.toString(),
        tenantId,
        tenant: tenantDoc
          ? {
              id: tenantDoc._id.toString(),
              name: tenantDoc.name,
              slug: tenantDoc.slug
            }
          : null,
        role: roleDoc?.key || membership.role,
        roleMeta: roleService.formatRole(roleDoc),
        permissions,
        status: membership.status,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt
      };
    }));
  }

  async validatePassword(user, password) {
    return await bcrypt.compare(password, user.password);
  }

  async changePassword(userId, tenantId, currentPassword, newPassword) {
    const user = await User.findOne({ _id: userId, tenantId });
    
    if (!user) {
      throw new Error('User not found');
    }

    const isValid = await this.validatePassword(user, currentPassword);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    user.password = newPassword; // Model'de pre-save ile hash'lenecek
    await user.save();

    return { success: true };
  }

  async getUserWithMembership(userId, tenantId) {
    const membership = await Membership.findOne({ userId, tenantId });

    if (!membership) {
      return null;
    }

    const user = await User.findById(userId).select('-password');

    if (!user) {
      return null;
    }

    const { role: roleDoc, permissions } = await roleService.ensureRoleReference(membership, tenantId);
    const membershipPayload = membership.toObject({ versionKey: false });
    delete membershipPayload.inviteTokenHash;

    const userPayload = user.toObject({ versionKey: false });
    if (membershipPayload.status) {
      userPayload.status = membershipPayload.status;
    }

    return {
      ...userPayload,
      membership: {
        ...membershipPayload,
        permissions,
        roleMeta: roleService.formatRole(roleDoc)
      }
    };
  }

  async deleteOwnAccount(userId) {
    // Önce kullanıcının sahip olduğu tenantları kontrol et
    const ownedMemberships = await Membership.find({ 
      userId, 
      role: 'owner' 
    }).populate('tenantId');

    if (ownedMemberships.length > 0) {
      const ownedTenantNames = ownedMemberships
        .map(m => m.tenantId?.name || 'İsimsiz Varlık')
        .join(', ');
      
      throw new Error(
        `Hesabınızı silmeden önce sahip olduğunuz varlıkları devretmeniz veya silmeniz gerekmektedir: ${ownedTenantNames}`
      );
    }

    // Kullanıcıya ait tüm üyelikleri sil
    await Membership.deleteMany({ userId });

    // Kullanıcıyı sil
    await User.findByIdAndDelete(userId);

    return { success: true };
  }

  async leaveMembership(userId, membershipId, password) {
    // Üyeliği bul
    const membership = await Membership.findById(membershipId).populate('tenantId');
    
    if (!membership) {
      throw new Error('Üyelik bulunamadı');
    }

    // Üyeliğin kullanıcıya ait olduğunu kontrol et
    if (membership.userId.toString() !== userId.toString()) {
      throw new Error('Bu üyelik size ait değil');
    }

    // Kullanıcıyı bul ve şifreyi doğrula
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('Kullanıcı bulunamadı');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Şifre hatalı');
    }

    // Eğer sahipse ve başka sahip yoksa engelle
    if (membership.role === 'owner') {
      const otherOwners = await Membership.countDocuments({
        tenantId: membership.tenantId,
        role: 'owner',
        _id: { $ne: membershipId }
      });

      if (otherOwners === 0) {
        throw new Error(
          'Bu varlığın tek sahibisiniz. Görevi bırakmadan önce sahipliği başka bir kullanıcıya devretmeniz gerekmektedir.'
        );
      }
    }

    // Üyeliği sil
    await Membership.findByIdAndDelete(membershipId);

    return { success: true };
  }
}

module.exports = new UserService();
