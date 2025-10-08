const { Tenant, Membership, User, rbac } = require('@contexthub/common');
const roleService = require('./roleService');
const { mailService } = require('./mailService');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const { ROLE_KEYS } = rbac;

class TenantService {
  #slugify(value) {
    return value
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async generateUniqueSlug(base) {
    const normalized = this.#slugify(base);
    let candidate = normalized;
    let suffix = 1;

    while (await Tenant.exists({ slug: candidate })) {
      candidate = `${normalized}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  async createTenant({ name, slug, plan = 'free' }, ownerId) {
    if (!name) {
      throw new Error('Tenant name is required');
    }

    let finalSlug;
    if (slug?.trim()) {
      finalSlug = this.#slugify(slug);
      if (!finalSlug) {
        finalSlug = await this.generateUniqueSlug(name);
      }
      if (await Tenant.exists({ slug: finalSlug })) {
        throw new Error('Tenant slug already exists');
      }
    } else {
      finalSlug = await this.generateUniqueSlug(name);
    }

    const tenant = new Tenant({
      name,
      slug: finalSlug,
      plan,
      status: 'active',
      createdBy: ownerId
    });
    await tenant.save();

    const ownerRole = await roleService.resolveRole({ tenantId: tenant._id, roleKey: ROLE_KEYS.OWNER })
      || await roleService.resolveRole({ tenantId: null, roleKey: ROLE_KEYS.OWNER });

    const membership = new Membership({
      tenantId: tenant._id,
      userId: ownerId,
      role: ownerRole?.key || ROLE_KEYS.OWNER,
      roleId: ownerRole?._id || null,
      status: 'active',
      createdBy: ownerId
    });
    await membership.save();

    return { tenant, membership };
  }

  async listUserTenants(userId) {
    const memberships = await Membership.find({ userId, status: { $in: ['active', 'pending'] } })
      .populate('tenantId', 'name slug plan status createdAt')
      .sort({ createdAt: -1 });

    return Promise.all(memberships.map(async (membership) => {
      const tenantDoc = membership.tenantId;
      const tenantId = tenantDoc?._id?.toString() || membership.tenantId?.toString();
      const { role: roleDoc, permissions } = await roleService.ensureRoleReference(
        membership,
        tenantId
      );

      // Bu tenant'taki toplam owner sayısını hesapla
      const ownerCount = await Membership.countDocuments({
        tenantId: membership.tenantId,
        role: 'owner',
        status: 'active'
      });

      return {
        id: membership._id.toString(),
        tenantId,
        tenant: tenantDoc
          ? {
              id: tenantDoc._id.toString(),
              name: tenantDoc.name,
              slug: tenantDoc.slug,
              plan: tenantDoc.plan,
              status: tenantDoc.status,
              createdAt: tenantDoc.createdAt
            }
          : null,
        role: roleDoc?.key || membership.role,
        roleMeta: roleService.formatRole(roleDoc),
        permissions,
        status: membership.status,
        ownerCount // Toplam owner sayısı
      };
    }));
  }

  async acceptMembershipInvitation(userId, tenantId) {
    if (!userId || !tenantId) {
      throw new Error('User and tenant identifiers are required');
    }

    const membership = await Membership.findOne({
      userId,
      tenantId,
      status: { $in: ['pending', 'inactive'] }
    });

    if (!membership) {
      throw new Error('Invitation not found');
    }

    membership.status = 'active';
    membership.acceptedAt = new Date();
    membership.inviteTokenHash = null;
    membership.inviteTokenExpiresAt = null;
    await membership.save();
    await membership.populate('tenantId', 'name slug plan status createdAt');

    const user = await User.findById(userId);
    if (user) {
      if (user.status !== 'active') {
        user.status = 'active';
      }
      user.isEmailVerified = true;
      await user.save();
    }

    return membership;
  }

  async requestOwnershipTransfer(tenantId, currentOwnerId, newOwnerEmail, password) {
    // Şifre doğrulama
    const currentOwner = await User.findById(currentOwnerId);
    if (!currentOwner) {
      throw new Error('Kullanıcı bulunamadı');
    }

    const isPasswordValid = await bcrypt.compare(password, currentOwner.password);
    if (!isPasswordValid) {
      throw new Error('Şifre hatalı');
    }

    // Mevcut kullanıcının owner olduğunu kontrol et
    const currentOwnerMembership = await Membership.findOne({
      userId: currentOwnerId,
      tenantId,
      role: 'owner'
    });

    if (!currentOwnerMembership) {
      throw new Error('Bu varlığın sahibi değilsiniz');
    }

    // Tek sahip kontrolü
    const otherOwners = await Membership.countDocuments({
      tenantId,
      role: 'owner',
      userId: { $ne: currentOwnerId }
    });

    if (otherOwners > 0) {
      throw new Error('Bu varlığın başka sahipleri var. Direkt olarak görevi bırakabilirsiniz.');
    }

    // Yeni sahibin var olup olmadığını kontrol et
    let newOwner = await User.findOne({ email: newOwnerEmail });
    
    // Yeni sahip yoksa veya üye değilse davet oluştur
    const transferToken = crypto.randomBytes(32).toString('hex');
    const transferTokenHash = await bcrypt.hash(transferToken, 10);
    const transferTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 gün

    if (!newOwner) {
      // Yeni kullanıcı oluştur (pending durumda)
      newOwner = new User({
        email: newOwnerEmail,
        password: crypto.randomBytes(16).toString('hex'), // Geçici şifre
        firstName: newOwnerEmail.split('@')[0],
        lastName: '',
        status: 'pending'
      });
      await newOwner.save();
    }

    // Yeni sahip için membership kontrolü
    let newOwnerMembership = await Membership.findOne({
      userId: newOwner._id,
      tenantId
    });

    if (!newOwnerMembership) {
      // Yeni membership oluştur
      const ownerRole = await roleService.resolveRole({ tenantId, roleKey: ROLE_KEYS.OWNER });
      
      newOwnerMembership = new Membership({
        tenantId,
        userId: newOwner._id,
        role: 'owner',
        roleId: ownerRole?._id || null,
        status: 'pending',
        inviteTokenHash: transferTokenHash,
        inviteTokenExpiresAt: transferTokenExpiresAt,
        invitedBy: currentOwnerId
      });
      await newOwnerMembership.save();
    } else {
      // Mevcut membership'i güncelle
      newOwnerMembership.role = 'owner';
      newOwnerMembership.status = 'pending';
      newOwnerMembership.inviteTokenHash = transferTokenHash;
      newOwnerMembership.inviteTokenExpiresAt = transferTokenExpiresAt;
      newOwnerMembership.invitedBy = currentOwnerId;
      await newOwnerMembership.save();
    }

    // Tenant bilgilerini al
    const tenant = await Tenant.findById(tenantId);
    const currentOwnerUser = await User.findById(currentOwnerId);
    const currentOwnerName = `${currentOwnerUser.firstName} ${currentOwnerUser.lastName}`.trim();

    // E-posta gönder
    try {
      await mailService.sendOwnershipTransferEmail(
        newOwnerEmail, 
        transferToken, 
        {
          id: tenant._id.toString(),
          name: tenant.name,
          slug: tenant.slug
        },
        currentOwnerName
      );
    } catch (emailError) {
      console.error('Failed to send ownership transfer email:', emailError);
      // E-posta gönderilemese bile devam et
    }

    return {
      message: 'Sahiplik devri talebi gönderildi',
      transferToken, // SADECE TEST İÇİN - Production'da kaldırılmalı
      email: newOwnerEmail,
      expiresAt: transferTokenExpiresAt
    };
  }

  async acceptOwnershipTransfer(tenantId, newOwnerId, token) {
    // Yeni sahibin membership'ini bul
    const newOwnerMembership = await Membership.findOne({
      userId: newOwnerId,
      tenantId,
      role: 'owner',
      status: 'pending'
    });

    if (!newOwnerMembership) {
      throw new Error('Sahiplik devri talebi bulunamadı');
    }

    // Token doğrulama
    if (!newOwnerMembership.inviteTokenHash) {
      throw new Error('Geçersiz devir talebi');
    }

    const isTokenValid = await bcrypt.compare(token, newOwnerMembership.inviteTokenHash);
    if (!isTokenValid) {
      throw new Error('Geçersiz token');
    }

    // Token süresini kontrol et
    if (newOwnerMembership.inviteTokenExpiresAt < new Date()) {
      throw new Error('Token süresi dolmuş');
    }

    // Yeni sahibi aktif et
    newOwnerMembership.status = 'active';
    newOwnerMembership.acceptedAt = new Date();
    newOwnerMembership.inviteTokenHash = null;
    newOwnerMembership.inviteTokenExpiresAt = null;
    await newOwnerMembership.save();

    // Kullanıcıyı aktif et
    const newOwner = await User.findById(newOwnerId);
    if (newOwner && newOwner.status === 'pending') {
      newOwner.status = 'active';
      newOwner.isEmailVerified = true;
      await newOwner.save();
    }

    // Transfer isteğini gönderen owner'ı bul ve admin yap
    // invitedBy field'ı transfer isteğini gönderen user'ı gösterir
    if (newOwnerMembership.invitedBy) {
      const oldOwnerMembership = await Membership.findOne({
        userId: newOwnerMembership.invitedBy,
        tenantId,
        role: 'owner',
        status: 'active'
      });

      if (oldOwnerMembership) {
        // Admin rolüne düşür
        const adminRole = await roleService.resolveRole({ tenantId, roleKey: ROLE_KEYS.ADMIN });
        oldOwnerMembership.role = 'admin';
        oldOwnerMembership.roleId = adminRole?._id || null;
        await oldOwnerMembership.save();
      }
    }

    return newOwnerMembership;
  }
}

module.exports = new TenantService();
