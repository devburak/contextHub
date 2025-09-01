const { User, Tenant, Membership } = require('@contexthub/common');
const bcrypt = require('bcryptjs');

class UserService {
  async createUser({ email, password, firstName, lastName, tenantId, role = 'viewer' }) {
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
      const membership = new Membership({
        tenantId,
        userId: user._id,
        role,
        status: 'active'
      });
      await membership.save();
    }

    return user;
  }

  async getUserById(userId, tenantId) {
    return await User.findOne({ _id: userId, tenantId }).select('-password');
  }

  async getUserByEmail(email, tenantId) {
    return await User.findOne({ email, tenantId });
  }

  async getUsersByTenant(tenantId, options = {}) {
    const { page = 1, limit = 10, search = '' } = options;
    const skip = (page - 1) * limit;

    let query = { tenantId };
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .populate('tenantId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(query);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
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

  async deleteUser(userId, tenantId) {
    // Önce membership'leri sil
    await Membership.deleteMany({ userId, tenantId });
    
    // Sonra kullanıcıyı sil
    const user = await User.findOneAndDelete({ _id: userId, tenantId });
    return user;
  }

  async updateUserRole(userId, tenantId, role) {
    const membership = await Membership.findOneAndUpdate(
      { userId, tenantId },
      { role, updatedAt: new Date() },
      { new: true }
    );

    return membership;
  }

  async getUserMemberships(userId) {
    return await Membership.find({ userId, status: 'active' })
      .populate('tenantId', 'name slug')
      .sort({ createdAt: -1 });
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
    const user = await User.findOne({ _id: userId, tenantId }).select('-password');
    if (!user) return null;

    const membership = await Membership.findOne({ userId, tenantId, status: 'active' });
    
    return {
      ...user.toObject(),
      membership
    };
  }
}

module.exports = new UserService();
