const nodemailer = require('nodemailer');
const tenantSettingsService = require('./tenantSettingsService');

class MailService {
  constructor() {
    this.tenantSettingsService = tenantSettingsService;
    this.globalTransporter = null;
    this.tenantTransporters = new Map();
  }

  /**
   * Get global SMTP configuration from environment variables
   */
  getGlobalSmtpConfig() {
    const config = {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      from: process.env.SMTP_FROM,
    };

    // Add authentication if required
    if (process.env.SMTP_AUTH === 'true' && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
      config.auth = {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      };
    }

    return config;
  }

  /**
   * Get tenant-specific SMTP configuration
   */
  async getTenantSmtpConfig(tenantId) {
    try {
      const smtp = await this.tenantSettingsService.getSmtpCredentials(tenantId);

      if (!smtp || !smtp.enabled || !smtp.host) {
        return null;
      }

      const config = {
        host: smtp.host,
        port: smtp.port || 587,
        secure: smtp.secure || false,
        from: `${smtp.fromName || ''} <${smtp.fromEmail}>`.trim(),
      };

      // Add authentication if credentials are provided
      if (smtp.username && smtp.password) {
        config.auth = {
          user: smtp.username,
          pass: smtp.password,
        };
      }

      return config;
    } catch (error) {
      console.error(`Failed to get tenant SMTP config for ${tenantId}:`, error);
      return null;
    }
  }

  /**
   * Create or get global transporter
   */
  async getGlobalTransporter() {
    if (this.globalTransporter) {
      return this.globalTransporter;
    }

    const config = this.getGlobalSmtpConfig();

    if (!config.host || !config.auth.user) {
      throw new Error('Global SMTP configuration is incomplete. Please check environment variables.');
    }

    this.globalTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });

    return this.globalTransporter;
  }

  /**
   * Create or get tenant-specific transporter
   */
  async getTenantTransporter(tenantId) {
    if (this.tenantTransporters.has(tenantId)) {
      return this.tenantTransporters.get(tenantId);
    }

    const config = await this.getTenantSmtpConfig(tenantId);

    if (!config) {
      return null;
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });

    this.tenantTransporters.set(tenantId, transporter);
    return transporter;
  }

  /**
   * Get the appropriate transporter (tenant-specific or global)
   */
  async getTransporter(tenantId = null) {
    if (tenantId) {
      const tenantTransporter = await this.getTenantTransporter(tenantId);
      if (tenantTransporter) {
        return {
          transporter: tenantTransporter,
          config: await this.getTenantSmtpConfig(tenantId)
        };
      }
    }

    // Fall back to global transporter
    const globalTransporter = await this.getGlobalTransporter();
    const globalConfig = this.getGlobalSmtpConfig();

    return {
      transporter: globalTransporter,
      config: globalConfig
    };
  }

  /**
   * Send email
   */
  async sendMail(options, tenantId = null) {
    try {
      const { transporter, config } = await this.getTransporter(tenantId);

      const mailOptions = {
        from: options.from || config.from,
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
        replyTo: options.replyTo,
      };

      const result = await transporter.sendMail(mailOptions);

      console.log(`Email sent successfully via ${tenantId ? 'tenant' : 'global'} SMTP:`, {
        messageId: result.messageId,
        to: options.to,
        subject: options.subject,
      });

      return result;
    } catch (error) {
      console.error('Failed to send email:', error);
      throw error;
    }
  }

  /**
   * Send template-based email (for future template support)
   */
  async sendTemplateEmail(templateName, data, recipients, tenantId = null) {
    // TODO: Implement template system
    // For now, just send a basic email
    const mailOptions = {
      to: Array.isArray(recipients) ? recipients.join(', ') : recipients,
      subject: data.subject || `Email from ${templateName}`,
      html: data.html || data.body || '',
      text: data.text || data.body || '',
    };

    return this.sendMail(mailOptions, tenantId);
  }

  /**
   * Test SMTP connection
   */
  async testConnection(tenantId = null) {
    try {
      const { transporter } = await this.getTransporter(tenantId);
      const verified = await transporter.verify();

      return {
        success: true,
        message: `SMTP connection ${tenantId ? 'for tenant ' + tenantId : 'global'} verified successfully`,
        verified,
      };
    } catch (error) {
      return {
        success: false,
        message: `SMTP connection ${tenantId ? 'for tenant ' + tenantId : 'global'} failed`,
        error: error.message,
      };
    }
  }

  /**
   * Clear tenant transporter cache (useful when tenant SMTP settings are updated)
   */
  clearTenantTransporter(tenantId) {
    if (this.tenantTransporters.has(tenantId)) {
      const transporter = this.tenantTransporters.get(tenantId);
      transporter.close();
      this.tenantTransporters.delete(tenantId);
    }
  }

  /**
   * Clear all transporter caches
   */
  clearAllTransporters() {
    // Close all tenant transporters
    for (const [tenantId, transporter] of this.tenantTransporters) {
      transporter.close();
    }
    this.tenantTransporters.clear();

    // Close global transporter
    if (this.globalTransporter) {
      this.globalTransporter.close();
      this.globalTransporter = null;
    }
  }

  /**
   * Get email statistics (basic implementation)
   */
  async getEmailStats(tenantId = null) {
    // TODO: Implement proper email statistics tracking
    // This is a placeholder for future implementation
    return {
      sent: 0,
      failed: 0,
      pending: 0,
    };
  }

  /**
   * Notify user about excessive login attempts
   */
  async sendLoginLimitExceededEmail(email, { ip, userAgent } = {}) {
    const subject = 'ContextHub - Şüpheli giriş denemesi';
    const safeIp = ip || 'bilinmiyor';
    const ua = userAgent || 'bilinmiyor';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #111827; background: #f9fafb; padding: 20px; }
          .card { background: #ffffff; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); max-width: 640px; margin: 0 auto; }
          .badge { display: inline-block; padding: 6px 10px; border-radius: 12px; background: #fef3c7; color: #92400e; font-weight: 600; font-size: 13px; }
          .meta { margin: 12px 0; padding: 12px; background: #f3f4f6; border-radius: 8px; }
          .meta strong { display: inline-block; width: 110px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">Çok fazla hatalı giriş denemesi</div>
          <p>Hesabınıza kısa süre içinde birden fazla başarısız giriş denemesi yapıldı. Hesabınız korunması için geçici olarak kilitlendi.</p>
          <div class="meta">
            <p><strong>IP Adresi:</strong> ${safeIp}</p>
            <p><strong>Cihaz/Bilgi:</strong> ${ua}</p>
            <p><strong>Zaman:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <p>Eğer bu denemeleri siz yapmadıysanız, şifrenizi değiştirmenizi ve iki faktörlü doğrulamayı etkinleştirmenizi öneririz.</p>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Çok fazla hatalı giriş denemesi

IP Adresi: ${safeIp}
Cihaz/Bilgi: ${ua}
Zaman: ${new Date().toLocaleString()}

Eğer bu denemeleri siz yapmadıysanız, şifrenizi değiştirin ve iki faktörlü doğrulamayı etkinleştirin.
    `;

    await this.sendMail({
      to: email,
      subject,
      html: htmlContent,
      text: textContent
    });
  }

  /**
   * Send welcome email to new user
   */
  async sendWelcomeEmail(userData, tenantData = null) {
    try {
      const { email, firstName, lastName } = userData;
      const name = `${firstName} ${lastName}`.trim();
      
      const subject = tenantData 
        ? `${tenantData.name} - Hoş Geldiniz!` 
        : 'ContextHub - Hoş Geldiniz!';

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
            .footer { margin-top: 30px; text-align: center; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Hoş Geldiniz${tenantData ? ` ${tenantData.name}` : ''}</h1>
            </div>
            <div class="content">
              <p>Merhaba ${name},</p>
              
              <p>Hesabınız başarıyla oluşturuldu! ${tenantData ? `${tenantData.name} organizasyonuna` : 'ContextHub platformuna'} hoş geldiniz.</p>
              
              ${tenantData ? `
              <p><strong>Organizasyon Bilgileriniz:</strong></p>
              <ul>
                <li><strong>Organizasyon Adı:</strong> ${tenantData.name}</li>
                <li><strong>Subdomain:</strong> ${tenantData.slug}</li>
              </ul>
              ` : ''}
              
              <p>Artık platform özelliklerini kullanmaya başlayabilirsiniz:</p>
              <ul>
                <li>İçerik yönetimi</li>
                <li>Medya galerisi</li>
                <li>Kategori sistemi</li>
                <li>Kullanıcı yönetimi</li>
              </ul>
              
              <div style="text-align: center;">
                <a href="${process.env.ADMIN_URL || 'http://localhost:3100'}/login" class="button">Giriş Yap</a>
              </div>
              
              <p>Herhangi bir sorunuz varsa lütfen bizimle iletişime geçin.</p>
              
              <p>İyi günler!<br>
              ContextHub Ekibi</p>
            </div>
            <div class="footer">
              <p>Bu e-posta otomatik olarak gönderilmiştir.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const textContent = `
        Hoş Geldiniz${tenantData ? ` ${tenantData.name}` : ''}!

        Merhaba ${name},

        Hesabınız başarıyla oluşturuldu! ${tenantData ? `${tenantData.name} organizasyonuna` : 'ContextHub platformuna'} hoş geldiniz.

        ${tenantData ? `
        Organizasyon Bilgileriniz:
        - Organizasyon Adı: ${tenantData.name}
        - Subdomain: ${tenantData.slug}
        ` : ''}

        Artık platform özelliklerini kullanmaya başlayabilirsiniz:
        - İçerik yönetimi
        - Medya galerisi
        - Kategori sistemi
        - Kullanıcı yönetimi

        Giriş yapmak için: ${process.env.ADMIN_URL || 'http://localhost:3100'}/login

        Herhangi bir sorunuz varsa lütfen bizimle iletişime geçin.

        İyi günler!
        ContextHub Ekibi
      `;

      await this.sendMail({
        to: email,
        subject,
        html: htmlContent,
        text: textContent
      }, tenantData?.id);

      console.log(`Welcome email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      return false;
    }
  }

  /**
   * Send ownership transfer request email
   */
  async sendOwnershipTransferEmail(recipientEmail, transferToken, tenantData, currentOwnerName) {
    try {
      const acceptUrl = `${process.env.ADMIN_URL || 'http://localhost:3100'}/transfer-accept?token=${transferToken}&tenant=${tenantData.id}`;
      
      const subject = `${tenantData.name} - Sahiplik Devri Talebi`;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #9333ea; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { background-color: #9333ea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
            .info-box { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .footer { margin-top: 30px; text-align: center; color: #6b7280; font-size: 14px; }
            .token-box { background-color: #e0e7ff; padding: 10px; border-radius: 4px; font-family: monospace; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔄 Sahiplik Devri Talebi</h1>
            </div>
            <div class="content">
              <p>Merhaba,</p>
              
              <p><strong>${currentOwnerName}</strong> sizin <strong>${tenantData.name}</strong> varlığının yeni sahibi olmanızı talep ediyor.</p>
              
              <div class="info-box">
                <strong>⚠️ Önemli:</strong> Bu talebi kabul ederseniz, varlığın sahibi olacak ve tüm yönetim yetkilerine sahip olacaksınız.
              </div>
              
              <p><strong>Varlık Bilgileri:</strong></p>
              <ul>
                <li><strong>Varlık Adı:</strong> ${tenantData.name}</li>
                <li><strong>Slug:</strong> ${tenantData.slug}</li>
                <li><strong>Mevcut Sahip:</strong> ${currentOwnerName}</li>
              </ul>
              
              <p>Bu talebi kabul etmek için aşağıdaki butona tıklayın:</p>
              
              <div style="text-align: center;">
                <a href="${acceptUrl}" class="button">Sahiplik Devri Talebini Kabul Et</a>
              </div>
              
              <p><small>Eğer buton çalışmıyorsa, aşağıdaki bağlantıyı tarayıcınıza kopyalayın:</small></p>
              <div class="token-box">
                ${acceptUrl}
              </div>
              
              <div class="info-box">
                <strong>⏰ Süre:</strong> Bu talep 7 gün geçerlidir.
              </div>
              
              <p>Bu talebi siz göndermediyseniz, bu e-postayı görmezden gelebilirsiniz.</p>
              
              <p>İyi günler!<br>
              ContextHub Ekibi</p>
            </div>
            <div class="footer">
              <p>Bu e-posta otomatik olarak gönderilmiştir.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const textContent = `
        Sahiplik Devri Talebi

        Merhaba,

        ${currentOwnerName} sizin ${tenantData.name} varlığının yeni sahibi olmanızı talep ediyor.

        ⚠️ ÖNEMLI: Bu talebi kabul ederseniz, varlığın sahibi olacak ve tüm yönetim yetkilerine sahip olacaksınız.

        Varlık Bilgileri:
        - Varlık Adı: ${tenantData.name}
        - Slug: ${tenantData.slug}
        - Mevcut Sahip: ${currentOwnerName}

        Bu talebi kabul etmek için aşağıdaki bağlantıyı kullanın:
        ${acceptUrl}

        ⏰ Bu talep 7 gün geçerlidir.

        Bu talebi siz göndermediyseniz, bu e-postayı görmezden gelebilirsiniz.

        İyi günler!
        ContextHub Ekibi
      `;

      await this.sendMail({
        to: recipientEmail,
        subject,
        html: htmlContent,
        text: textContent
      }, tenantData.id);

      console.log(`Ownership transfer email sent to ${recipientEmail} for tenant ${tenantData.name}`);
      return true;
    } catch (error) {
      console.error('Failed to send ownership transfer email:', error);
      return false;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(recipientEmail, resetToken, userName) {
    try {
      const resetUrl = `${process.env.ADMIN_URL || 'http://localhost:3100'}/reset-password?token=${resetToken}`;
      
      const subject = 'ContextHub - Şifre Sıfırlama';

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #ef4444; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
            .warning-box { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .footer { margin-top: 30px; text-align: center; color: #6b7280; font-size: 14px; }
            .token-box { background-color: #fee2e2; padding: 10px; border-radius: 4px; font-family: monospace; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Şifre Sıfırlama</h1>
            </div>
            <div class="content">
              <p>Merhaba ${userName || ''},</p>
              
              <p>Hesabınız için bir şifre sıfırlama talebi aldık. Şifrenizi sıfırlamak için aşağıdaki butona tıklayın:</p>
              
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Şifremi Sıfırla</a>
              </div>
              
              <p><small>Eğer buton çalışmıyorsa, aşağıdaki bağlantıyı tarayıcınıza kopyalayın:</small></p>
              <div class="token-box">
                ${resetUrl}
              </div>
              
              <div class="warning-box">
                <strong>⚠️ Önemli Güvenlik Bilgileri:</strong>
                <ul>
                  <li>Bu bağlantı sadece <strong>1 saat</strong> geçerlidir</li>
                  <li>Bağlantı tek kullanımlıktır</li>
                  <li>Bu talebi siz yapmadıysanız, bu e-postayı görmezden gelin</li>
                  <li>Şifrenizi kimseyle paylaşmayın</li>
                </ul>
              </div>
              
              <p>Bu talebi siz göndermediyseniz, hesabınız güvende. Hiçbir işlem yapmanıza gerek yok.</p>
              
              <p>İyi günler!<br>
              ContextHub Ekibi</p>
            </div>
            <div class="footer">
              <p>Bu e-posta otomatik olarak gönderilmiştir.</p>
              <p>Güvenlik sorunlarınız için: support@ctxhub.net</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const textContent = `
        Şifre Sıfırlama

        Merhaba ${userName || ''},

        Hesabınız için bir şifre sıfırlama talebi aldık.

        Şifrenizi sıfırlamak için aşağıdaki bağlantıyı kullanın:
        ${resetUrl}

        ⚠️ ÖNEMLI GÜVENLİK BİLGİLERİ:
        - Bu bağlantı sadece 1 saat geçerlidir
        - Bağlantı tek kullanımlıktır
        - Bu talebi siz yapmadıysanız, bu e-postayı görmezden gelin
        - Şifrenizi kimseyle paylaşmayın

        Bu talebi siz göndermediyseniz, hesabınız güvende. Hiçbir işlem yapmanıza gerek yok.

        İyi günler!
        ContextHub Ekibi

        Güvenlik sorunlarınız için: support@ctxhub.net
      `;

      await this.sendMail({
        to: recipientEmail,
        subject,
        html: htmlContent,
        text: textContent
      });

      console.log(`Password reset email sent to ${recipientEmail}`);
      return true;
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      return false;
    }
  }

  /**
   * Send password change confirmation email
   * @param {string} recipientEmail
   * @param {string} userName
   * @param {Object} metadata - { ipAddress, userAgent, timestamp }
   */
  async sendPasswordChangeEmail(recipientEmail, userName, metadata = {}) {
    try {
      const { ipAddress, userAgent, timestamp } = metadata;
      const resetUrl = `${process.env.ADMIN_URL || 'http://localhost:3100'}/forgot-password`;
      const subject = 'ContextHub - Şifreniz Değiştirildi';

      const formattedDate = timestamp
        ? new Date(timestamp).toLocaleString('tr-TR', {
            dateStyle: 'long',
            timeStyle: 'short'
          })
        : new Date().toLocaleString('tr-TR', {
            dateStyle: 'long',
            timeStyle: 'short'
          });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
            .warning-box { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .info-box { background-color: #e0f2fe; border-left: 4px solid #0ea5e9; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .footer { margin-top: 30px; text-align: center; color: #6b7280; font-size: 14px; }
            .detail-row { display: flex; margin: 5px 0; }
            .detail-label { font-weight: bold; min-width: 100px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔒 Şifre Değişikliği Onayı</h1>
            </div>
            <div class="content">
              <p>Merhaba ${userName || ''},</p>

              <p>Hesabınızın şifresi başarıyla değiştirildi.</p>

              <div class="info-box">
                <strong>📋 İşlem Detayları:</strong>
                <div style="margin-top: 10px;">
                  <div class="detail-row">
                    <span class="detail-label">Tarih:</span>
                    <span>${formattedDate}</span>
                  </div>
                  ${ipAddress ? `
                  <div class="detail-row">
                    <span class="detail-label">IP Adresi:</span>
                    <span>${ipAddress}</span>
                  </div>
                  ` : ''}
                  ${userAgent ? `
                  <div class="detail-row">
                    <span class="detail-label">Cihaz:</span>
                    <span>${userAgent.substring(0, 100)}${userAgent.length > 100 ? '...' : ''}</span>
                  </div>
                  ` : ''}
                </div>
              </div>

              <div class="warning-box">
                <strong>⚠️ Güvenlik Uyarısı:</strong>
                <p style="margin: 10px 0 0 0;">Bu şifre değişikliğini siz yapmadıysanız, hesabınız tehlike altında olabilir. Lütfen hemen şifrenizi sıfırlayın:</p>
                <div style="text-align: center; margin-top: 15px;">
                  <a href="${resetUrl}" class="button">Şifremi Sıfırla</a>
                </div>
              </div>

              <p>Bu işlemi siz yaptıysanız, herhangi bir işlem yapmanıza gerek yoktur.</p>

              <p>İyi günler!<br>
              ContextHub Ekibi</p>
            </div>
            <div class="footer">
              <p>Bu e-posta otomatik olarak gönderilmiştir.</p>
              <p>Güvenlik sorunlarınız için: support@ctxhub.net</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const textContent = `
        Şifre Değişikliği Onayı

        Merhaba ${userName || ''},

        Hesabınızın şifresi başarıyla değiştirildi.

        İŞLEM DETAYLARI:
        Tarih: ${formattedDate}
        ${ipAddress ? `IP Adresi: ${ipAddress}` : ''}
        ${userAgent ? `Cihaz: ${userAgent.substring(0, 100)}` : ''}

        ⚠️ GÜVENLİK UYARISI:
        Bu şifre değişikliğini siz yapmadıysanız, hesabınız tehlike altında olabilir.
        Lütfen hemen şifrenizi sıfırlayın: ${resetUrl}

        Bu işlemi siz yaptıysanız, herhangi bir işlem yapmanıza gerek yoktur.

        İyi günler!
        ContextHub Ekibi

        Güvenlik sorunlarınız için: support@ctxhub.net
      `;

      await this.sendMail({
        to: recipientEmail,
        subject,
        html: htmlContent,
        text: textContent
      });

      console.log(`Password change confirmation email sent to ${recipientEmail}`);
      return true;
    } catch (error) {
      console.error('Failed to send password change email:', {
        email: recipientEmail,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Send email verification email for new registrations
   * @param {string} recipientEmail
   * @param {string} userName
   * @param {string} verificationToken
   */
  async sendEmailVerificationEmail(recipientEmail, userName, verificationToken) {
    try {
      const verificationUrl = `${process.env.ADMIN_URL || 'http://localhost:3100'}/verify-email?token=${verificationToken}`;
      const subject = 'ContextHub - E-posta Adresinizi Doğrulayın';

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #3b82f6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { background-color: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; font-weight: bold; }
            .info-box { background-color: #e0f2fe; border-left: 4px solid #0ea5e9; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .warning-box { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .footer { margin-top: 30px; text-align: center; color: #6b7280; font-size: 14px; }
            .link-box { background-color: #f3f4f6; padding: 10px; border-radius: 4px; font-family: monospace; word-break: break-all; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✉️ E-posta Doğrulama</h1>
            </div>
            <div class="content">
              <p>Merhaba ${userName || ''},</p>

              <p>ContextHub'a hoş geldiniz! Hesabınızı aktifleştirmek için lütfen e-posta adresinizi doğrulayın.</p>

              <div style="text-align: center;">
                <a href="${verificationUrl}" class="button">E-posta Adresimi Doğrula</a>
              </div>

              <p><small>Eğer buton çalışmıyorsa, aşağıdaki bağlantıyı tarayıcınıza kopyalayın:</small></p>
              <div class="link-box">
                ${verificationUrl}
              </div>

              <div class="info-box">
                <strong>⏰ Önemli:</strong>
                <p style="margin: 10px 0 0 0;">Bu doğrulama bağlantısı <strong>6 saat</strong> geçerlidir. Süre dolduğunda yeni bir doğrulama e-postası talep edebilirsiniz.</p>
              </div>

              <div class="warning-box">
                <strong>⚠️ Güvenlik Uyarısı:</strong>
                <p style="margin: 10px 0 0 0;">Bu hesabı siz oluşturmadıysanız, bu e-postayı görmezden gelin. Hesap doğrulanmadan aktif olmayacaktır.</p>
              </div>

              <p>Sorularınız için bize ulaşabilirsiniz.</p>

              <p>İyi günler!<br>
              ContextHub Ekibi</p>
            </div>
            <div class="footer">
              <p>Bu e-posta otomatik olarak gönderilmiştir.</p>
              <p>Destek için: support@ctxhub.net</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const textContent = `
        E-posta Doğrulama

        Merhaba ${userName || ''},

        ContextHub'a hoş geldiniz! Hesabınızı aktifleştirmek için lütfen e-posta adresinizi doğrulayın.

        Doğrulama bağlantısı:
        ${verificationUrl}

        ⏰ ÖNEMLİ:
        Bu doğrulama bağlantısı 6 saat geçerlidir. Süre dolduğunda yeni bir doğrulama e-postası talep edebilirsiniz.

        ⚠️ GÜVENLİK UYARISI:
        Bu hesabı siz oluşturmadıysanız, bu e-postayı görmezden gelin. Hesap doğrulanmadan aktif olmayacaktır.

        İyi günler!
        ContextHub Ekibi

        Destek için: support@ctxhub.net
      `;

      await this.sendMail({
        to: recipientEmail,
        subject,
        html: htmlContent,
        text: textContent
      });

      console.log(`Email verification email sent to ${recipientEmail}`);
      return true;
    } catch (error) {
      console.error('Failed to send email verification email:', {
        email: recipientEmail,
        error: error.message
      });
      return false;
    }
  }
}

// Singleton instance
const mailService = new MailService();

module.exports = {
  MailService,
  mailService,
};
