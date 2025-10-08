const { database } = require('@contexthub/common');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// Pre-load models
require('@contexthub/common/src/models/SubscriptionPlan');
require('@contexthub/common/src/models/Tenant');

async function testLimitsEndpoint() {
  try {
    console.log('Connecting to database...');
    await database.connectDB();
    
    console.log('Initializing Redis...');
    const localRedisClient = require('../lib/localRedis');
    await localRedisClient.initialize();
    
    if (!localRedisClient.isEnabled()) {
      console.warn('⚠️  Local Redis not connected, will use MongoDB fallback');
    } else {
      console.log('✅ Local Redis connected');
    }
    
    // Get a test tenant
    const Tenant = require('@contexthub/common/src/models/Tenant');
    const tenant = await Tenant.findOne({ status: 'active' }).populate('currentPlan');
    
    if (!tenant) {
      console.error('❌ No active tenant found in database');
      process.exit(1);
    }
    
    console.log(`\n📋 Testing with tenant: ${tenant.name} (${tenant._id})`);
    console.log(`   Current Plan: ${tenant.currentPlan?.name || 'Free (default)'}`);
    
    // Simulate the endpoint logic
    const Membership = require('@contexthub/common/src/models/Membership');
    const Media = require('@contexthub/common/src/models/Media');
    const upstashClient = require('../lib/upstash');
    
    // Get limits
    const limits = {
      userLimit: await tenant.getLimit('userLimit'),
      ownerLimit: await tenant.getLimit('ownerLimit'),
      storageLimit: await tenant.getLimit('storageLimit'),
      monthlyRequestLimit: await tenant.getLimit('monthlyRequestLimit'),
    };
    
    console.log('\n📊 Limits:');
    console.log(`   Users: ${limits.userLimit === -1 ? 'Unlimited' : limits.userLimit}`);
    console.log(`   Storage: ${limits.storageLimit === -1 ? 'Unlimited' : `${(limits.storageLimit / (1024**3)).toFixed(2)} GB`}`);
    console.log(`   Monthly Requests: ${limits.monthlyRequestLimit === -1 ? 'Unlimited' : limits.monthlyRequestLimit.toLocaleString()}`);
    
    // Get usage
    const membershipCount = await Membership.countDocuments({ 
      tenantId: tenant._id,
      status: 'active',
    });
    
    const ownerCount = await Membership.countDocuments({ 
      tenantId: tenant._id,
      role: 'owner',
      status: 'active',
    });
    
    const mediaAgg = await Media.aggregate([
      { $match: { tenantId: tenant._id, status: { $ne: 'deleted' } } },
      { $group: { _id: null, totalSize: { $sum: { $ifNull: ['$size', 0] } } } },
    ]);
    const storageUsed = mediaAgg.length > 0 ? mediaAgg[0].totalSize : 0;
    
    let monthlyRequests = 0;
    if (upstashClient.isEnabled()) {
      try {
        const stats = await upstashClient.getApiStats(tenant._id.toString());
        monthlyRequests = stats.monthly || 0;
      } catch (error) {
        console.warn('   ⚠️  Could not fetch Upstash stats:', error.message);
      }
    }
    
    console.log('\n📈 Current Usage:');
    console.log(`   Users: ${membershipCount}${limits.userLimit !== -1 ? ` / ${limits.userLimit}` : ''}`);
    console.log(`   Owners: ${ownerCount}${limits.ownerLimit !== -1 ? ` / ${limits.ownerLimit}` : ''}`);
    console.log(`   Storage: ${(storageUsed / (1024**3)).toFixed(2)} GB${limits.storageLimit !== -1 ? ` / ${(limits.storageLimit / (1024**3)).toFixed(2)} GB` : ''}`);
    console.log(`   Monthly Requests: ${monthlyRequests.toLocaleString()}${limits.monthlyRequestLimit !== -1 ? ` / ${limits.monthlyRequestLimit.toLocaleString()}` : ''}`);
    
    // Calculate percentages
    const usage = {
      users: {
        current: membershipCount,
        limit: limits.userLimit,
        percentage: limits.userLimit !== -1 ? Math.min(100, (membershipCount / limits.userLimit) * 100) : 0,
        remaining: limits.userLimit !== -1 ? Math.max(0, limits.userLimit - membershipCount) : Infinity,
        isUnlimited: limits.userLimit === -1,
      },
      storage: {
        current: storageUsed,
        limit: limits.storageLimit,
        percentage: limits.storageLimit !== -1 ? Math.min(100, (storageUsed / limits.storageLimit) * 100) : 0,
        remaining: limits.storageLimit !== -1 ? Math.max(0, limits.storageLimit - storageUsed) : Infinity,
        isUnlimited: limits.storageLimit === -1,
      },
      requests: {
        current: monthlyRequests,
        limit: limits.monthlyRequestLimit,
        percentage: limits.monthlyRequestLimit !== -1 ? Math.min(100, (monthlyRequests / limits.monthlyRequestLimit) * 100) : 0,
        remaining: limits.monthlyRequestLimit !== -1 ? Math.max(0, limits.monthlyRequestLimit - monthlyRequests) : Infinity,
        isUnlimited: limits.monthlyRequestLimit === -1,
      },
    };
    
    console.log('\n📊 Percentages:');
    console.log(`   Users: ${usage.users.percentage.toFixed(1)}%`);
    console.log(`   Storage: ${usage.storage.percentage.toFixed(1)}%`);
    console.log(`   Requests: ${usage.requests.percentage.toFixed(1)}%`);
    
    console.log('\n🎯 Response Object:');
    console.log(JSON.stringify({
      tenant: {
        id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
      },
      plan: tenant.currentPlan ? {
        slug: tenant.currentPlan.slug,
        name: tenant.currentPlan.name,
        price: tenant.currentPlan.price,
        billingType: tenant.currentPlan.billingType,
      } : {
        slug: 'free',
        name: 'Free',
        price: 0,
        billingType: 'fixed',
      },
      usage,
      limits,
    }, null, 2));
    
    // Test cache read
    if (localRedisClient.isEnabled()) {
      console.log('\n🔍 Testing cache read...');
      const cached = await localRedisClient.getTenantLimits(tenant._id.toString());
      if (cached) {
        console.log('✅ Cache hit:', cached);
      } else {
        console.log('❌ Cache miss - limits not cached');
      }
    }
    
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testLimitsEndpoint();
