const { User, Tenant, Membership } = require('@contexthub/common');
const ActivityLog = require('@contexthub/common/src/models/ActivityLog');
const roleService = require('./roleService');
const tenantService = require('./tenantService');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { mailService } = require('./mailService');
const loginRateLimiter = require('./loginRateLimiter');

function extractClientIp(request) {
  // Fastify will populate request.ips when trustProxy is enabled
  if (Array.isArray(request?.ips) && request.ips.length) {
    const candidate = request.ips.find(Boolean);
    if (candidate) return candidate;
  }

  const xfwd = request?.headers?.['x-forwarded-for'];
  if (xfwd && typeof xfwd === 'string') {
    const forwardedIp = xfwd.split(',').map((ip) => ip.trim()).find(Boolean);
    if (forwardedIp) return forwardedIp;
  }

  const xReal = request?.headers?.['x-real-ip'];
  if (xReal) return xReal;

  const cfIp = request?.headers?.['cf-connecting-ip'];
  if (cfIp) return cfIp;

  const forwardedHeader = request?.headers?.forwarded;
  if (forwardedHeader && typeof forwardedHeader === 'string') {
    const match = forwardedHeader.match(/for=([^;]+)/i);
    if (match && match[1]) {
      return match[1].replace(/["\[\]]/g, '');
    }
  }

  return (
    request?.ip ||
    request?.socket?.remoteAddress ||
    request?.raw?.socket?.remoteAddress ||
    'unknown'
  );
}

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

  async logActivity({ userId, tenantId, action, description, metadata = {}, request = null }) {
    try {
      const logData = {
        user: userId,
        action,
        description,
        metadata
      };

      if (tenantId) {
        logData.tenant = tenantId;
      }

      if (request) {
        logData.ipAddress = request.ip || request.headers['x-forwarded-for'] || request.socket?.remoteAddress;
        logData.userAgent = request.headers['user-agent'];
      }

      await ActivityLog.create(logData);
    } catch (error) {
      console.error('Failed to log activity:', error);
      // Don't throw - logging should not break the main flow
    }
  }

  async login(email, password, tenantId, request = null) {
    const clientIp = extractClientIp(request);
    const userAgent = request?.headers?.['user-agent'] || 'unknown';

    const blockStatus = await loginRateLimiter.isBlocked(email, clientIp);
    if (blockStatus.blocked) {
      const shouldNotify = !blockStatus.retryAfterSeconds || blockStatus.retryAfterSeconds >= (loginRateLimiter.BLOCK_TTL_SECONDS - 5);

      // Attempt to notify user if account exists
      if (shouldNotify) {
        try {
          const existingUser = await User.findOne({ email });
          if (existingUser) {
            await mailService.sendLoginLimitExceededEmail(existingUser.email, { ip: clientIp, userAgent });
          }
        } catch (notifyError) {
          console.error('Failed to notify user about login block:', notifyError);
        }
      }

      const err = new Error('Çok fazla hatalı deneme yapıldı. Lütfen 1 saat sonra tekrar deneyin.');
      err.statusCode = 429;
      err.retryAfterSeconds = blockStatus.retryAfterSeconds || loginRateLimiter.BLOCK_TTL_SECONDS;
      err.blocked = true;
      err.clientIp = clientIp;
      throw err;
    }

    // Kullanıcıyı email'e göre bul
    const user = await User.findOne({ email });

    if (!user) {
      await loginRateLimiter.recordFailedAttempt(email, clientIp);
      throw new Error('Invalid credentials');
    }

    // Şifre kontrolü
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      const attemptResult = await loginRateLimiter.recordFailedAttempt(email, clientIp);
      if (attemptResult.blocked) {
        try {
          await mailService.sendLoginLimitExceededEmail(user.email, { ip: clientIp, userAgent });
        } catch (mailError) {
          console.error('Failed to send login limit email:', mailError);
        }
        const err = new Error('Çok fazla hatalı deneme yapıldı. Lütfen 1 saat sonra tekrar deneyin.');
        err.statusCode = 429;
        err.retryAfterSeconds = loginRateLimiter.BLOCK_TTL_SECONDS;
        err.blocked = true;
        throw err;
      }
      throw new Error('Invalid credentials');
    }

    // Başarılı girişte limit sıfırla
    await loginRateLimiter.reset(email, clientIp);

    // E-posta doğrulama kontrolü
    if (!user.isEmailVerified) {
      const err = new Error('Lütfen önce e-posta adresinizi doğrulayın. Doğrulama e-postası gelen kutunuzda olmalı.');
      err.statusCode = 403;
      err.code = 'EMAIL_NOT_VERIFIED';
      err.email = user.email;
      throw err;
    }

    // Aktif membership'leri getir
    const memberships = await Membership.find({
      userId: user._id,
      status: 'active'
    }).populate('tenantId', 'name slug');

    // Eğer hiç aktif membership yoksa, kullanıcıyı yine de login yap
    // ama tenant seçimi gerekli olduğunu belirt
    if (!memberships.length) {
      user.lastLoginAt = new Date();
      await user.save();

      // Log login activity (tenant olmadan)
      await this.logActivity({
        userId: user._id,
        tenantId: null,
        action: 'user.login',
        description: `${user.firstName} ${user.lastName} giriş yaptı (tenant yok)`,
        metadata: { email: user.email, noTenant: true },
        request
      });

      // Minimal token oluştur (tenant bilgisi olmadan)
      const minimalToken = this.fastify.jwt.sign(
        {
          sub: user._id.toString(),
          email: user.email,
          tokenVersion: user.tokenVersion ?? 0,
          role: null,
          roleId: null,
          tenantId: null,
          permissions: []
        },
        { expiresIn: '24h' }
      );

      return {
        token: minimalToken,
        user: {
          id: user._id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: null,
          permissions: [],
          mustChangePassword: Boolean(user.mustChangePassword)
        },
        memberships: [],
        requiresTenantSelection: true,
        message: 'Lütfen bir varlık oluşturun veya mevcut bir varlığa katılın'
      };
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
        tokenVersion: user.tokenVersion ?? 0,
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

      // Log login activity
      await this.logActivity({
        userId: user._id,
        tenantId: payload.tenantId,
        action: 'user.login',
        description: `${user.firstName} ${user.lastName} giriş yaptı`,
        metadata: { email: user.email, tenantName: payload.tenant?.name },
        request
      });

      return {
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: payload.role,
          permissions: payload.permissions,
          mustChangePassword: Boolean(user.mustChangePassword)
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
        lastName: user.lastName,
        mustChangePassword: Boolean(user.mustChangePassword)
      },
      memberships: membershipResponses
    };
  }

  async register(userData, request = null) {
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

    // E-posta doğrulama token'ı oluştur (6 saat geçerli)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = await bcrypt.hash(verificationToken, 10);
    const verificationTokenExpiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6 saat

    // Kullanıcı oluştur (tenant olmadan da olabilir)
    const user = new User({
      email,
      password, // Model'de hash'lenecek
      firstName,
      lastName,
      tenantId: tenant?._id, // Opsiyonel
      isEmailVerified: false,
      emailVerificationToken: verificationTokenHash,
      emailVerificationTokenExpiresAt: verificationTokenExpiresAt
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

    // Log registration activity
    await this.logActivity({
      userId: user._id,
      tenantId: tenant?._id,
      action: 'user.register',
      description: `${user.firstName} ${user.lastName} kayıt oldu`,
      metadata: {
        email: user.email,
        withTenant: !!tenant,
        tenantName: tenant?.name
      },
      request
    });

    // E-posta doğrulama e-postası gönder
    try {
      const emailSent = await mailService.sendEmailVerificationEmail(
        user.email,
        `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        verificationToken
      );

      if (!emailSent) {
        console.warn('[AuthService] Email verification email could not be sent:', {
          userId: user._id.toString(),
          email: user.email
        });
      }
    } catch (error) {
      console.error('Failed to send email verification email:', error);
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
      } : null,
      emailVerificationRequired: true
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

       const currentTokenVersion = user.tokenVersion ?? 0;
       const payloadTokenVersion = decoded.tokenVersion ?? 0;

       if (payloadTokenVersion !== currentTokenVersion) {
         throw new Error('Session is no longer valid, please login again');
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
          tokenVersion: currentTokenVersion,
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
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    return { success: true };
  }

  async inviteUser(email, tenantId, role, invitedBy, options = {}) {
    // Kullanıcının zaten mevcut olup olmadığını kontrol et
    const existingUser = await User.findOne({ email });
    const {
      firstName,
      lastName,
      password: providedPassword
    } = options;

    let resolvedRole = await roleService.resolveRole({ tenantId, roleKey: role });

    if (!resolvedRole) {
      await roleService.ensureSystemRoles();
      resolvedRole = await roleService.resolveRole({ tenantId, roleKey: role });
    }

    if (!resolvedRole) {
      throw new Error('Role not found');
    }
    
    if (existingUser) {
      if (providedPassword) {
        throw new Error('Password cannot be set for existing users');
      }

      // Kullanıcı varsa sadece membership ekle
      const existingMembership = await Membership.findOne({ 
        userId: existingUser._id, 
        tenantId 
      });

      if (existingMembership) {
        // Active membership: update role if needed and return success
        if (existingMembership.status === 'active') {
          let updated = false;
          if (existingMembership.role !== resolvedRole.key) {
            existingMembership.role = resolvedRole.key;
            existingMembership.roleId = resolvedRole._id;
            existingMembership.updatedBy = invitedBy || existingMembership.updatedBy;
            await existingMembership.save();
            updated = true;
          }

          return {
            type: 'existing_member',
            membershipId: existingMembership._id,
            status: existingMembership.status,
            role: existingMembership.role,
            updated,
          };
        }

        // Pending/inactive membership: re-issue invitation with updated role
        existingMembership.role = resolvedRole.key;
        existingMembership.roleId = resolvedRole._id;
        existingMembership.invitedBy = invitedBy || existingMembership.invitedBy;
        await existingMembership.save();

        const invitation = await this.issueInvitation({ membership: existingMembership, tenantId, invitedBy });

        return {
          type: 'existing_user_reinvited',
          userId: existingUser._id,
          membershipId: existingMembership._id,
          invitation,
        };
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
      const tempPassword = providedPassword || Math.random().toString(36).slice(-8);
      
      const user = new User({
        email,
        password: tempPassword,
        firstName: firstName?.trim() || email.split('@')[0], // Geçici
        lastName: lastName?.trim() || 'User', // Geçici
        tenantId,
        status: 'inactive',
        isEmailVerified: false,
        mustChangePassword: Boolean(providedPassword)
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

    let passwordUpdated = false;
    if (typeof password === 'string' && password.trim()) {
      user.password = password.trim();
      passwordUpdated = true;
    }

    user.status = 'active';
    user.isEmailVerified = true;
    if (passwordUpdated) {
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      user.mustChangePassword = false;
    }
    await user.save();

    const tenantId = membership.tenantId?.toString();
    const activatedMembership = await tenantService.acceptMembershipInvitation(user._id, tenantId);

    const { role: roleDoc, permissions } = await roleService.ensureRoleReference(activatedMembership, tenantId);
    const roleKey = roleDoc?.key || activatedMembership.role;

    const authToken = this.fastify.jwt.sign(
      {
        sub: user._id.toString(),
        email: user.email,
        tokenVersion: user.tokenVersion ?? 0,
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
        permissions,
        mustChangePassword: Boolean(user.mustChangePassword)
      },
      membership: {
        id: activatedMembership._id.toString(),
        tenantId,
        status: activatedMembership.status,
        acceptedAt: activatedMembership.acceptedAt
      }
    };
  }

  async forgotPassword(email, request = null) {
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

    // Log forgot password activity
    await this.logActivity({
      userId: user._id,
      action: 'user.password.forgot',
      description: `${user.firstName} ${user.lastName} şifre sıfırlama talebinde bulundu`,
      metadata: { email: user.email },
      request
    });

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

  async resetPassword(token, newPassword, request = null) {
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
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.mustChangePassword = false;
    user.resetPasswordToken = null;
    user.resetPasswordExpiresAt = null;
    await user.save();

    // Log password reset activity
    await this.logActivity({
      userId: user._id,
      action: 'user.password.reset',
      description: `${user.firstName} ${user.lastName} şifresini sıfırladı`,
      metadata: { email: user.email },
      request
    });

    console.log(`Password reset successfully for user ${user.email}`);
    return { message: 'Password reset successfully' };
  }

  async verifyEmail(token, request = null) {
    if (!token) {
      throw new Error('Doğrulama token\'ı gereklidir');
    }

    // Token ile kullanıcıyı bul (password reset benzeri mantık)
    const users = await User.find({
      emailVerificationToken: { $exists: true, $ne: null },
      emailVerificationTokenExpiresAt: { $gt: new Date() }
    });

    let user = null;
    for (const u of users) {
      const isValid = await bcrypt.compare(token, u.emailVerificationToken);
      if (isValid) {
        user = u;
        break;
      }
    }

    if (!user) {
      throw new Error('Geçersiz veya süresi dolmuş doğrulama bağlantısı');
    }

    // Zaten doğrulanmışsa
    if (user.isEmailVerified) {
      return { message: 'E-posta adresi zaten doğrulanmış', alreadyVerified: true };
    }

    // E-posta doğrula
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationTokenExpiresAt = null;
    await user.save();

    // Activity log
    await this.logActivity({
      userId: user._id,
      action: 'user.email.verified',
      description: `${user.firstName} ${user.lastName} e-posta adresini doğruladı`,
      metadata: { email: user.email },
      request
    });

    // Welcome email gönder (doğrulama sonrası)
    try {
      await mailService.sendWelcomeEmail(
        {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        },
        null // Tenant bilgisi şu an için null
      );
    } catch (error) {
      console.error('Failed to send welcome email after verification:', error);
    }

    console.log(`Email verified successfully for user ${user.email}`);
    return { message: 'E-posta adresiniz başarıyla doğrulandı', verified: true };
  }

  async resendVerificationEmail(email, request = null) {
    if (!email) {
      throw new Error('E-posta adresi gereklidir');
    }

    // Kullanıcıyı bul
    const user = await User.findOne({ email });

    if (!user) {
      // Güvenlik için her zaman başarılı gibi görün (email enumeration önleme)
      console.log(`Verification email requested for non-existent email: ${email}`);
      return { message: 'Eğer bu e-posta adresi kayıtlıysa, doğrulama bağlantısı gönderilecektir' };
    }

    // Zaten doğrulanmışsa
    if (user.isEmailVerified) {
      throw new Error('E-posta adresi zaten doğrulanmış');
    }

    // Yeni token oluştur (6 saat geçerli)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = await bcrypt.hash(verificationToken, 10);
    const verificationTokenExpiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);

    user.emailVerificationToken = verificationTokenHash;
    user.emailVerificationTokenExpiresAt = verificationTokenExpiresAt;
    await user.save();

    // Activity log
    await this.logActivity({
      userId: user._id,
      action: 'user.email.verification.resend',
      description: `${user.firstName} ${user.lastName} yeni doğrulama e-postası talep etti`,
      metadata: { email: user.email },
      request
    });

    // Doğrulama e-postası gönder
    try {
      const emailSent = await mailService.sendEmailVerificationEmail(
        user.email,
        `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        verificationToken
      );

      if (!emailSent) {
        console.warn('[AuthService] Resend verification email could not be sent:', {
          userId: user._id.toString(),
          email: user.email
        });
      }
    } catch (error) {
      console.error('Failed to resend email verification email:', error);
    }

    return { message: 'Doğrulama e-postası gönderildi' };
  }
}

module.exports = AuthService;
