#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');

// Load root level env file if present so the script can run in isolation
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { database, Tenant, User, Membership } = require('@contexthub/common');
const tenantSubscriptionService = require('../src/services/tenantSubscriptionService');

const DEFAULTS = {
  tenantName: process.env.SEED_TENANT_NAME || 'ContextHub',
  tenantSlug:
    process.env.SEED_TENANT_SLUG ||
    (process.env.SEED_TENANT_NAME || 'ContextHub').toLowerCase().replace(/\s+/g, '-'),
  tenantPlan: process.env.SEED_TENANT_PLAN || 'free',
  adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@contexthub.local',
  adminPassword: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!',
  adminFirstName: process.env.SEED_ADMIN_FIRST_NAME || 'Admin',
  adminLastName: process.env.SEED_ADMIN_LAST_NAME || 'User',
  adminRole: process.env.SEED_ADMIN_ROLE || 'owner',
  forcePassword: process.env.SEED_ADMIN_FORCE_PASSWORD === 'true'
};

function logStep(message) {
  console.log(`\n🛠  ${message}`);
}

async function ensureTenant({ name, slug, plan }) {
  logStep(`Tenant kontrol ediliyor: ${name} (${slug})`);
  let tenant = await Tenant.findOne({ slug });
  if (!tenant) {
    tenant = new Tenant({ name, slug, plan, status: 'active' });
    await tenantSubscriptionService.applyPlanToTenant(tenant, plan);
    await tenant.save();
    console.log('• Tenant oluşturuldu.');
    return tenant;
  }

  let changed = false;

  if (tenant.name !== name) {
    tenant.name = name;
    changed = true;
  }
  if (tenant.plan !== plan) {
    tenant.plan = plan;
    changed = true;
  }
  if (tenant.status !== 'active') {
    tenant.status = 'active';
    changed = true;
  }

  const planResult = await tenantSubscriptionService.applyPlanToTenant(tenant, plan);
  changed = changed || planResult.changed;

  if (changed) {
    await tenant.save();
    console.log('• Tenant güncellendi.');
  } else {
    console.log('• Tenant zaten güncel.');
  }

  return tenant;
}

async function ensureAdminUser({
  email,
  password,
  firstName,
  lastName,
  tenantId,
  forcePassword
}) {
  logStep(`Kullanıcı kontrol ediliyor: ${email}`);
  let user = await User.findOne({ email });
  let created = false;
  let passwordUpdated = false;

  if (!user) {
    user = new User({
      email,
      password,
      firstName,
      lastName,
      tenantId,
      status: 'active',
      isEmailVerified: true
    });
    await user.save();
    console.log('• Kullanıcı oluşturuldu.');
    return { user, created: true, passwordUpdated: true };
  }

  let changed = false;

  if (firstName && user.firstName !== firstName) {
    user.firstName = firstName;
    changed = true;
  }
  if (lastName && user.lastName !== lastName) {
    user.lastName = lastName;
    changed = true;
  }
  if (tenantId && (!user.tenantId || user.tenantId.toString() !== tenantId.toString())) {
    user.tenantId = tenantId;
    changed = true;
  }
  if (user.status !== 'active') {
    user.status = 'active';
    changed = true;
  }
  if (!user.isEmailVerified) {
    user.isEmailVerified = true;
    changed = true;
  }
  if (forcePassword) {
    user.password = password;
    passwordUpdated = true;
    changed = true;
  }

  if (changed) {
    await user.save();
    console.log('• Kullanıcı güncellendi.');
  } else {
    console.log('• Kullanıcı zaten güncel.');
  }

  return { user, created, passwordUpdated };
}

async function ensureMembership(userId, tenantId, role) {
  logStep('Tenant üyeliği kontrol ediliyor');
  let membership = await Membership.findOne({ userId, tenantId });

  if (!membership) {
    membership = new Membership({
      userId,
      tenantId,
      role,
      status: 'active',
      acceptedAt: new Date()
    });
    await membership.save();
    console.log(`• ${role} rolü ile üyelik oluşturuldu.`);
    return membership;
  }

  let changed = false;

  if (membership.role !== role) {
    membership.role = role;
    changed = true;
  }
  if (membership.status !== 'active') {
    membership.status = 'active';
    changed = true;
  }
  if (!membership.acceptedAt) {
    membership.acceptedAt = new Date();
    changed = true;
  }

  if (changed) {
    await membership.save();
    console.log('• Üyelik güncellendi.');
  } else {
    console.log('• Üyelik zaten güncel.');
  }

  return membership;
}

async function seed() {
  console.log('ContextHub seed scripti çalışıyor...');
  await database.connectDB();

  try {
    const tenant = await ensureTenant({
      name: DEFAULTS.tenantName,
      slug: DEFAULTS.tenantSlug,
      plan: DEFAULTS.tenantPlan
    });
    const { user, created, passwordUpdated } = await ensureAdminUser({
      email: DEFAULTS.adminEmail,
      password: DEFAULTS.adminPassword,
      firstName: DEFAULTS.adminFirstName,
      lastName: DEFAULTS.adminLastName,
      tenantId: tenant._id,
      forcePassword: DEFAULTS.forcePassword
    });
    await ensureMembership(user._id, tenant._id, DEFAULTS.adminRole);

    console.log('\n✅ Seed işlemi tamamlandı.');
    console.log(`  Email:    ${DEFAULTS.adminEmail}`);
    const passwordInfo = created || passwordUpdated
      ? DEFAULTS.adminPassword
      : '(değiştirilmedi)';
    console.log(`  Şifre:    ${passwordInfo}`);
    console.log(`  Tenant:   ${tenant.name} (${tenant.slug})`);
    console.log(`  Plan:     ${tenant.plan}`);
    console.log(`  Rol:      ${DEFAULTS.adminRole}`);
  } finally {
    await database.disconnectDB();
  }
}

seed().catch((error) => {
  console.error('\n❌ Seed işlemi başarısız:', error);
  process.exitCode = 1;
});
