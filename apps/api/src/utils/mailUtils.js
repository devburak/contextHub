const { mailService } = require('../services/mailService');

/**
 * Send welcome email to new user
 */
async function sendWelcomeEmail(user, tenantId = null) {
  const mailOptions = {
    to: user.email,
    subject: 'Welcome to ContextHub!',
    html: `
      <h1>Welcome ${user.name || user.email}!</h1>
      <p>Your account has been created successfully.</p>
      <p>You can now start using ContextHub to manage your content.</p>
      <p>If you have any questions, feel free to contact our support team.</p>
    `,
    text: `Welcome ${user.name || user.email}! Your account has been created successfully. You can now start using ContextHub to manage your content.`,
  };

  return mailService.sendMail(mailOptions, tenantId);
}

/**
 * Send password reset email
 */
async function sendPasswordResetEmail(user, resetToken, tenantId = null) {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const mailOptions = {
    to: user.email,
    subject: 'Password Reset Request',
    html: `
      <h1>Password Reset</h1>
      <p>Hello ${user.name || user.email},</p>
      <p>You have requested to reset your password. Click the link below to reset your password:</p>
      <p><a href="${resetUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Reset Password</a></p>
      <p>If you didn't request this, please ignore this email.</p>
      <p>This link will expire in 1 hour.</p>
    `,
    text: `Hello ${user.name || user.email}, you have requested to reset your password. Visit this link to reset: ${resetUrl}. If you didn't request this, please ignore this email. This link will expire in 1 hour.`,
  };

  return mailService.sendMail(mailOptions, tenantId);
}

/**
 * Send email verification email
 */
async function sendEmailVerificationEmail(user, verificationToken, tenantId = null) {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

  const mailOptions = {
    to: user.email,
    subject: 'Verify Your Email Address',
    html: `
      <h1>Email Verification</h1>
      <p>Hello ${user.name || user.email},</p>
      <p>Please verify your email address by clicking the link below:</p>
      <p><a href="${verificationUrl}" style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Verify Email</a></p>
      <p>If you didn't create this account, please ignore this email.</p>
    `,
    text: `Hello ${user.name || user.email}, please verify your email address by visiting: ${verificationUrl}. If you didn't create this account, please ignore this email.`,
  };

  return mailService.sendMail(mailOptions, tenantId);
}

/**
 * Send notification email
 */
async function sendNotificationEmail(recipient, subject, message, tenantId = null) {
  const mailOptions = {
    to: recipient,
    subject: subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">${subject}</h2>
        <div style="color: #666; line-height: 1.6;">
          ${message}
        </div>
      </div>
    `,
    text: message.replace(/<[^>]*>/g, ''), // Strip HTML tags for text version
  };

  return mailService.sendMail(mailOptions, tenantId);
}

/**
 * Send content published notification
 */
async function sendContentPublishedEmail(user, content, tenantId = null) {
  const mailOptions = {
    to: user.email,
    subject: `Content Published: ${content.title}`,
    html: `
      <h1>Content Published</h1>
      <p>Hello ${user.name || user.email},</p>
      <p>Your content "<strong>${content.title}</strong>" has been published successfully.</p>
      <p>You can view it at: <a href="${content.publicUrl || '#'}">${content.publicUrl || 'Your website'}</a></p>
    `,
    text: `Hello ${user.name || user.email}, your content "${content.title}" has been published successfully. You can view it at: ${content.publicUrl || 'Your website'}`,
  };

  return mailService.sendMail(mailOptions, tenantId);
}

/**
 * Send bulk email to multiple recipients
 */
async function sendBulkEmail(recipients, subject, message, tenantId = null) {
  const promises = recipients.map(recipient => {
    return sendNotificationEmail(recipient, subject, message, tenantId);
  });

  return Promise.allSettled(promises);
}

/**
 * Test email functionality
 */
async function sendTestEmail(recipient, tenantId = null) {
  const mailOptions = {
    to: recipient,
    subject: 'ContextHub Test Email',
    html: `
      <h1>Test Email</h1>
      <p>This is a test email from ContextHub.</p>
      <p>If you receive this email, your SMTP configuration is working correctly.</p>
      <p>Sent at: ${new Date().toISOString()}</p>
    `,
    text: `This is a test email from ContextHub. If you receive this email, your SMTP configuration is working correctly. Sent at: ${new Date().toISOString()}`,
  };

  return mailService.sendMail(mailOptions, tenantId);
}

module.exports = {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
  sendNotificationEmail,
  sendContentPublishedEmail,
  sendBulkEmail,
  sendTestEmail,
};