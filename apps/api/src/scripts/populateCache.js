const { database } = require('@contexthub/common');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// Pre-load models to prevent MissingSchemaError
require('@contexthub/common/src/models/SubscriptionPlan');
require('@contexthub/common/src/models/Tenant');

async function populateCache() {
  try {
    console.log('Connecting to database...');
    await database.connectDB();
    
    console.log('Initializing Redis clients...');
    const localRedisClient = require('../lib/localRedis');
    await localRedisClient.initialize();
    
    if (!localRedisClient.isEnabled()) {
      console.error('❌ Local Redis is not connected!');
      process.exit(1);
    }
    
    console.log('Populating cache...');
    const limitCheckerService = require('../services/limitCheckerService');
    await limitCheckerService.refreshAllLimitsCache();
    
    // Verify
    const Tenant = require('@contexthub/common/src/models/Tenant');
    const tenants = await Tenant.find({ status: 'active' });
    
    console.log(`\n✅ Cache populated for ${tenants.length} tenants`);
    
    // Check one tenant
    if (tenants.length > 0) {
      const testTenant = tenants[0];
      const cached = await localRedisClient.getTenantLimits(testTenant._id.toString());
      console.log(`\nTest read for tenant ${testTenant.name}:`, cached);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

populateCache();
