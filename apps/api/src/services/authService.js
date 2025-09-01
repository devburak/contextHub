const { User, Tenant, Membership } = require('@contexthub/common');
const bcrypt = require('bcryptjs');

class AuthService {
  constructor(fastifyInstance) {
    this.fastify = fastifyInstance;
  }

  async login(email, password, tenantId) {
    // Kullanıcıyı bul
    const user = await User.findOne({ email, tenantId });
    
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Şifre kontrolü
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Aktif membership kontrolü
    const membership = await Membership.findOne({ 
      userId: user._id, 
      tenantId, 
      status: 'active' 
    });

    if (!membership) {
      throw new Error('User does not have access to this tenant');
    }

    // JWT token oluştur
    const token = this.fastify.jwt.sign(
      { 
        sub: user._id.toString(),
        email: user.email,
        role: membership.role,
        tenantId: tenantId.toString()
      },
      { expiresIn: '24h' }
    );

    // Son giriş zamanını güncelle
    user.lastLoginAt = new Date();
    await user.save();

    return {
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: membership.role
      }
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

      // Yeni token oluştur
      const newToken = this.fastify.jwt.sign(
        { 
          sub: user._id.toString(),
          email: user.email,
          role: membership.role,
          tenantId: decoded.tenantId
        },
        { expiresIn: '24h' }
      );

      return { token: newToken };

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
        role,
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
        role,
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
