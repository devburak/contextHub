#!/usr/bin/env node

const nodemailer = require('nodemailer');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Simplified test mail service
 * Usage: node testMailService.js [email]
 */
async function testEmailService() {
  try {
    const targetEmail = process.argv[2] || 'test@example.com';

    console.log('🚀 ContextHub Simple Mail Test');
    console.log('==============================');
    console.log(`📧 Target Email: ${targetEmail}`);
    console.log(`🔧 SMTP Host: ${process.env.SMTP_HOST}`);
    console.log(`🔧 SMTP Port: ${process.env.SMTP_PORT}`);
    console.log(`🔧 SMTP User: ${process.env.SMTP_USER}`);
    console.log('');

    // Create simple transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    // Test connection
    console.log('🔄 Testing SMTP connection...');
    const verified = await transporter.verify();
    if (verified) {
      console.log('✅ SMTP connection successful');
    } else {
      throw new Error('SMTP connection failed');
    }

    // Send simple test email
    console.log('📤 Sending test email...');
    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: targetEmail,
      subject: 'ContextHub Simple Test Email',
      html: `
        <h2>Test Email</h2>
        <p>Bu ContextHub sisteminden gönderilen basit bir test emailidir.</p>
        <p>SMTP ayarları başarıyla çalışıyor.</p>
        <p>Gönderim zamanı: ${new Date().toLocaleString('tr-TR')}</p>
      `,
      text: `Test Email\n\nBu ContextHub sisteminden gönderilen basit bir test emailidir.\nSMTP ayarları başarıyla çalışıyor.\nGönderim zamanı: ${new Date().toLocaleString('tr-TR')}`
    });

    console.log('✅ Test email sent successfully!');
    console.log(`📧 Message ID: ${result.messageId}`);
    console.log('🎉 Check your email inbox.');

  } catch (error) {
    console.error('❌ Mail test failed:', error.message);
    process.exit(1);
  }
}

// Check if running directly
if (require.main === module) {
  testEmailService();
}

module.exports = { testEmailService };