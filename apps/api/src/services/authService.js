const { User, Tenant, Membership } = require('@contexthub/common');
const roleService = require('./roleService');
const bcrypt = require('bcryptjs');
const { mailService } = require('./mailService');

class AuthService {
  constructor(fastifyInstance) {
    this.fastify = fastifyInstance;
  }

  async login(email, password, tenantId) {
    // Kullanıcıyı email'e göre bul
    const user = await User.findOne({ email });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Şifre kontrolü
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Aktif membership'leri getir
    const memberships = await Membership.find({
      userId: user._id,
      status: 'active'
    }).populate('tenantId', 'name slug');

    if (!memberships.length) {
      throw new Error('User does not have any active tenant access');
    }

    const membershipDetails = await Promise.all(
      memberships.map(async (membershipDoc) => {
        const tenant = membershipDoc.tenantId;
        const tenantIdResolved = tenant?.id?.toString?.() || tenant?._id?.toString() || membershipDoc.tenantId?.toString();

        const { role: roleDoc, permissions } = await roleService.ensureRoleReference(
          membershipDoc,
          tenantIdResolved
        );

        const rolePayload = roleService.formatRole(roleDoc);
        const roleKey = rolePayload?.key || membershipDoc.role;

        const tenantPayload = tenant
          ? {
              id: tenant._id ? tenant._id.toString() : tenant.id,
              name: tenant.name,
              slug: tenant.slug
            }
          : {
              id: tenantIdResolved,
              name: null,
              slug: null
            };

        return {
          doc: membershipDoc,
          payload: {
            id: membershipDoc._id.toString(),
            tenantId: tenantIdResolved,
            tenant: tenantPayload,
            role: roleKey,
            roleMeta: rolePayload,
            status: membershipDoc.status,
            permissions
          }
        };
      })
    );

    const createToken = (payload) => this.fastify.jwt.sign(
      {
        sub: user._id.toString(),
        email: user.email,
        role: payload.role,
        roleId: payload.roleMeta?.id ?? null,
        tenantId: payload.tenantId,
        permissions: payload.permissions
      },
      { expiresIn: '24h' }
    );

    membershipDetails.forEach((entry) => {
      entry.token = createToken(entry.payload);
    });

    const membershipResponses = membershipDetails.map(({ payload, token }) => ({
      ...payload,
      token
    }));

    const membershipMap = new Map(
      membershipDetails.map(({ doc, payload, token }) => [doc._id.toString(), { payload, token }])
    );

    const resolveMembershipLogin = async (membership) => {
      const detail = membershipMap.get(membership._id.toString());

      if (!detail) {
        throw new Error('Membership details could not be resolved');
      }

      user.lastLoginAt = new Date();
      await user.save();

      const { payload, token } = detail;

      return {
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: payload.role,
          permissions: payload.permissions
        },
        memberships: membershipResponses,
        activeMembership: {
          ...payload,
          token
        },
        requiresTenantSelection: false
      };
    };

    if (tenantId) {
      const membership = memberships.find((item) =>
        item.tenantId && item.tenantId._id.toString() === tenantId.toString()
      );

      if (!membership) {
        throw new Error('User does not have access to this tenant');
      }

      return resolveMembershipLogin(membership);
    }

    // Tek tenant varsa otomatik giriş
    if (memberships.length === 1) {
      return resolveMembershipLogin(memberships[0]);
    }

    // Tenant seçilmediyse, seçim için membership listesini döndür
    user.lastLoginAt = new Date();
    await user.save();

    return {
      requiresTenantSelection: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      },
      memberships: membershipResponses
    };
  }

  async register(userData) {
    const { email, password, firstName, lastName, tenantName, tenantSlug } = userData;

    // Email'in daha önce kullanılıp kullanılmadığını kontrol et
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new Error('Email already exists');
    }

    // Tenant slug'ının mevcut olup olmadığını kontrol et
    if (tenantSlug) {
      const existingTenant = await Tenant.findOne({ slug: tenantSlug });
      if (existingTenant) {
        throw new Error('Tenant slug already exists');
      }
    }

    // Yeni tenant oluştur (eğer belirtilmişse)
    let tenant = null;
    if (tenantName) {
      tenant = new Tenant({
        name: tenantName,
        slug: tenantSlug || tenantName.toLowerCase().replace(/\s+/g, '-'),
        plan: 'free',
        status: 'active'
      });
      await tenant.save();
    }

    // Kullanıcı oluştur
    const user = new User({
      email,
      password, // Model'de hash'lenecek
      firstName,
      lastName,
      tenantId: tenant?._id
    });
    await user.save();

    // Membership oluştur (tenant owner olarak)
    if (tenant) {
      const membership = new Membership({
        tenantId: tenant._id,
        userId: user._id,
        role: 'owner',
        status: 'active'
      });
      await membership.save();
    }

    // Welcome email gönder
    try {
      await mailService.sendWelcomeEmail(
        {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        },
        tenant ? {
          id: tenant._id,
          name: tenant.name,
          slug: tenant.slug
        } : null
      );
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      // Email hatası kayıt işlemini durdurmaz
    }

    return {
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      },
      tenant: tenant ? {
        id: tenant._id,
        name: tenant.name,
        slug: tenant.slug
      } : null
    };
  }

  async refreshToken(oldToken) {
    try {
      const decoded = this.fastify.jwt.verify(oldToken);
      
      // Kullanıcı ve membership kontrolü
      const user = await User.findById(decoded.sub);
      if (!user) {
        throw new Error('User not found');
      }

      const membership = await Membership.findOne({ 
        userId: decoded.sub, 
        tenantId: decoded.tenantId, 
        status: 'active' 
      });

      if (!membership) {
        throw new Error('Membership not found or inactive');
      }

      const { role: roleDoc, permissions } = await roleService.ensureRoleReference(
        membership,
        decoded.tenantId
      );

      const roleKey = roleDoc?.key || membership.role;

      // Yeni token oluştur
      const newToken = this.fastify.jwt.sign(
        { 
          sub: user._id.toString(),
          email: user.email,
          role: roleKey,
          roleId: roleDoc?._id?.toString() ?? null,
          tenantId: decoded.tenantId,
          permissions
        },
        { expiresIn: '24h' }
      );

      return { token: newToken, permissions, role: roleKey };

    } catch (err) {
      throw new Error('Invalid or expired token');
    }
  }

  async changePassword(userId, tenantId, currentPassword, newPassword) {
    const user = await User.findOne({ _id: userId, tenantId });
    
    if (!user) {
      throw new Error('User not found');
    }

    // Mevcut şifre kontrolü
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      throw new Error('Current password is incorrect');
    }

    // Yeni şifre kaydet (model'de hash'lenecek)
    user.password = newPassword;
    await user.save();

    return { success: true };
  }

  async inviteUser(email, tenantId, role, invitedBy) {
    // Kullanıcının zaten mevcut olup olmadığını kontrol et
    const existingUser = await User.findOne({ email });

    const resolvedRole = await roleService.resolveRole({ tenantId, roleKey: role });

    if (!resolvedRole) {
      throw new Error('Role not found');
    }
    
    if (existingUser) {
      // Kullanıcı varsa sadece membership ekle
      const existingMembership = await Membership.findOne({ 
        userId: existingUser._id, 
        tenantId 
      });

      if (existingMembership) {
        throw new Error('User already has access to this tenant');
      }

      const membership = new Membership({
        tenantId,
        userId: existingUser._id,
        role: resolvedRole.key,
        roleId: resolvedRole._id,
        status: 'pending',
        invitedBy
      });
      await membership.save();

      return { 
        type: 'existing_user',
        userId: existingUser._id,
        membershipId: membership._id 
      };
    } else {
      // Yeni kullanıcı için invitation oluştur
      // Bu durumda gerçek projede email gönderme logic'i olacak
      const tempPassword = Math.random().toString(36).slice(-8);
      
      const user = new User({
        email,
        password: tempPassword,
        firstName: email.split('@')[0], // Geçici
        lastName: 'User', // Geçici
        tenantId,
        isEmailVerified: false
      });
      await user.save();

      const membership = new Membership({
        tenantId,
        userId: user._id,
        role: resolvedRole.key,
        roleId: resolvedRole._id,
        status: 'pending',
        invitedBy
      });
      await membership.save();

      return { 
        type: 'new_user',
        userId: user._id,
        membershipId: membership._id,
        tempPassword 
      };
    }
  }
}

module.exports = AuthService;
