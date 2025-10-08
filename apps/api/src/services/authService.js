const { User, Tenant, Membership } = require('@contexthub/common');
const roleService = require('./roleService');
const tenantService = require('./tenantService');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { mailService } = require('./mailService');

class AuthService {
  constructor(fastifyInstance) {
    this.fastify = fastifyInstance;
  }

  generateInvitationToken(hours = 12) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    return { token, tokenHash, expiresAt };
  }

  buildInvitationLink(token, tenantId) {
    const baseUrl = process.env.ADMIN_URL || process.env.FRONTEND_URL || 'http://localhost:3100';
    const url = new URL('/accept-invite', baseUrl);
    url.searchParams.set('token', token);
    if (tenantId) {
      url.searchParams.set('tenantId', tenantId.toString());
    }
    return url.toString();
  }

  async sendInvitationEmail({ user, tenant, inviter, inviteLink, token, expiresAt, tenantId }) {
    const inviterName = inviter
      ? [inviter.firstName, inviter.lastName].filter(Boolean).join(' ') || inviter.email
      : 'ContextHub';

    const tenantName = tenant?.name || 'ContextHub';

    const subject = `${tenantName} daveti`; // Turkish default - we can use bilingual message

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937;">
        <h1 style="font-size: 22px; font-weight: 600;">${tenantName} daveti</h1>
        <p>Merhaba ${user.firstName || user.email},</p>
        <p>${tenantName} organizasyonuna katılman için bir davet aldın. Daveti kabul etmek için aşağıdaki bağlantıyı kullanabilirsin.</p>
        <p style="margin: 24px 0; text-align: center;">
          <a href="${inviteLink}" style="background-color:#2563eb; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; display:inline-block;">Daveti Kabul Et</a>
        </p>
        <p style="margin-bottom: 12px;">Bağlantı <strong>${expiresAt.toLocaleString()}</strong> tarihine kadar geçerlidir (12 saat).</p>
        <p style="margin-bottom: 12px;">Bağlantı çalışmazsa aşağıdaki adresi tarayıcına yapıştırabilirsin:</p>
        <p style="word-break: break-all; background:#f3f4f6; padding:12px; border-radius:8px;">${inviteLink}</p>
        <p style="margin-bottom: 12px;">Tek kullanımlık davet kodun:</p>
        <p style="font-family:'Fira Code',monospace; background:#111827; color:#f9fafb; padding:12px; border-radius:8px; display:inline-block;">${token}</p>
        <p style="margin-top:24px;">Bu daveti <strong>${inviterName}</strong> gönderdi.</p>
        <p style="margin-top:32px; font-size: 13px; color:#6b7280;">Eğer bu daveti beklemiyorsan bu e-postayı görmezden gelebilirsin.</p>
      </div>
    `;

    const text = `Merhaba ${user.firstName || user.email},\n\n${tenantName} organizasyonuna katılman için bir davet aldın.\n\nDaveti kabul etmek için bu bağlantıyı kullan: ${inviteLink}\n\nBağlantı ${expiresAt.toLocaleString()} tarihine kadar geçerli olacaktır (12 saat).\n\nTek kullanımlık davet kodun: ${token}\n\nBu daveti ${inviterName} gönderdi. Eğer bu daveti beklemiyorsan bu e-postayı görmezden gelebilirsin.`;

    await mailService.sendMail({
      to: user.email,
      subject,
      html,
      text
    }, tenantId);
  }

  async issueInvitation({ membership, tenantId, invitedBy }) {
    const user = await User.findById(membership.userId);

    if (!user) {
      throw new Error('User not found');
    }

    const { token, tokenHash, expiresAt } = this.generateInvitationToken();

    membership.status = 'pending';
    membership.inviteTokenHash = tokenHash;
    membership.inviteTokenExpiresAt = expiresAt;
    membership.lastInvitedAt = new Date();
    if (invitedBy) {
      membership.invitedBy = invitedBy;
    }
    if (!membership.invitedAt) {
      membership.invitedAt = new Date();
    }

    await membership.save();

    const tenant = await Tenant.findById(tenantId).select('name slug');
    const inviter = invitedBy ? await User.findById(invitedBy).select('firstName lastName email') : null;
    const inviteLink = this.buildInvitationLink(token, tenantId);

    await this.sendInvitationEmail({
      user,
      tenant,
      inviter,
      inviteLink,
      token,
      expiresAt,
      tenantId
    });

    return {
      membershipId: membership._id,
      userId: user._id,
      status: membership.status,
      expiresAt
    };
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

    // Tenant slug'ının mevcut olup olmadığını kontrol et (eğer tenant bilgisi verilmişse)
    if (tenantSlug) {
      const existingTenant = await Tenant.findOne({ slug: tenantSlug });
      if (existingTenant) {
        throw new Error('Tenant slug already exists');
      }
    }

    // Yeni tenant oluştur (SADECE tenantName verilmişse)
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

    // Kullanıcı oluştur (tenant olmadan da olabilir)
    const user = new User({
      email,
      password, // Model'de hash'lenecek
      firstName,
      lastName,
      tenantId: tenant?._id // Opsiyonel
    });
    await user.save();

    // Membership oluştur (SADECE tenant varsa, tenant owner olarak)
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

      const invitation = await this.issueInvitation({ membership, tenantId, invitedBy });

      return { 
        type: 'existing_user',
        userId: existingUser._id,
        membershipId: membership._id,
        invitation
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
        status: 'inactive',
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

      const invitation = await this.issueInvitation({ membership, tenantId, invitedBy });

      return { 
        type: 'new_user',
        userId: user._id,
        membershipId: membership._id,
        tempPassword,
        invitation
      };
    }
  }

  async resendInvitation(userId, tenantId, invitedBy) {
    const membership = await Membership.findOne({ userId, tenantId });

    if (!membership) {
      throw new Error('User membership not found');
    }

    if (membership.status === 'active') {
      throw new Error('User already active');
    }

    return this.issueInvitation({ membership, tenantId, invitedBy });
  }

  async acceptInvitation(inviteToken, { password, firstName, lastName } = {}) {
    if (!inviteToken) {
      throw new Error('Invitation token is required');
    }

    const tokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex');

    const membership = await Membership.findOne({ inviteTokenHash: tokenHash });

    if (!membership) {
      throw new Error('Invitation not found or already used');
    }

    if (!membership.inviteTokenExpiresAt || membership.inviteTokenExpiresAt < new Date()) {
      throw new Error('Invitation token has expired');
    }

    const user = await User.findById(membership.userId);

    if (!user) {
      throw new Error('User not found');
    }

    if (typeof firstName === 'string' && firstName.trim()) {
      user.firstName = firstName.trim();
    }

    if (typeof lastName === 'string' && lastName.trim()) {
      user.lastName = lastName.trim();
    }

    if (typeof password === 'string' && password.trim()) {
      user.password = password.trim();
    }

    user.status = 'active';
    user.isEmailVerified = true;
    await user.save();

    const tenantId = membership.tenantId?.toString();
    const activatedMembership = await tenantService.acceptMembershipInvitation(user._id, tenantId);

    const { role: roleDoc, permissions } = await roleService.ensureRoleReference(activatedMembership, tenantId);
    const roleKey = roleDoc?.key || activatedMembership.role;

    const authToken = this.fastify.jwt.sign(
      {
        sub: user._id.toString(),
        email: user.email,
        role: roleKey,
        roleId: roleDoc?._id?.toString() ?? null,
        tenantId,
        permissions
      },
      { expiresIn: '24h' }
    );

    return {
      token: authToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: roleKey,
        permissions
      },
      membership: {
        id: activatedMembership._id.toString(),
        tenantId,
        status: activatedMembership.status,
        acceptedAt: activatedMembership.acceptedAt
      }
    };
  }

  async forgotPassword(email) {
    // Kullanıcıyı bul
    const user = await User.findOne({ email });
    
    if (!user) {
      // Güvenlik için her zaman başarılı gibi görün
      // (Saldırganlar e-posta varlığını test edemesin)
      console.log(`Password reset requested for non-existent email: ${email}`);
      return;
    }

    // Reset token oluştur
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = await bcrypt.hash(resetToken, 10);
    const resetTokenExpiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 saat

    // Kullanıcıya token'ı kaydet
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpiresAt = resetTokenExpiresAt;
    await user.save();

    // E-posta gönder
    try {
      await mailService.sendPasswordResetEmail(
        email,
        resetToken,
        `${user.firstName} ${user.lastName}`.trim()
      );
      console.log(`Password reset email sent to ${email}`);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      // E-posta gönderilemese bile hata fırlatma
    }

    return { message: 'Password reset email sent' };
  }

  async resetPassword(token, newPassword) {
    // Token ile kullanıcıyı bul
    const users = await User.find({
      resetPasswordToken: { $exists: true },
      resetPasswordExpiresAt: { $gt: new Date() }
    });

    let user = null;
    for (const u of users) {
      const isValid = await bcrypt.compare(token, u.resetPasswordToken);
      if (isValid) {
        user = u;
        break;
      }
    }

    if (!user) {
      throw new Error('Geçersiz veya süresi dolmuş şifre sıfırlama bağlantısı');
    }

    // Yeni şifreyi kaydet
    user.password = newPassword; // Model'de pre-save ile hash'lenecek
    user.resetPasswordToken = null;
    user.resetPasswordExpiresAt = null;
    await user.save();

    console.log(`Password reset successfully for user ${user.email}`);
    return { message: 'Password reset successfully' };
  }
}

module.exports = AuthService;
