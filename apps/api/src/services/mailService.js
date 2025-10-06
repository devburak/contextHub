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
      const settings = await this.tenantSettingsService.getSettings(tenantId);

      if (!settings.smtp.enabled || !settings.smtp.host) {
        return null;
      }

      const config = {
        host: settings.smtp.host,
        port: settings.smtp.port || 587,
        secure: settings.smtp.secure || false,
        from: `${settings.smtp.fromName || ''} <${settings.smtp.fromEmail}>`.trim(),
      };

      // Add authentication if credentials are provided
      if (settings.smtp.username && settings.smtp.password) {
        config.auth = {
          user: settings.smtp.username,
          pass: settings.smtp.password,
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
}

// Singleton instance
const mailService = new MailService();

module.exports = {
  MailService,
  mailService,
};