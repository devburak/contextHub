const { database } = require('@contexthub/common');
const SubscriptionPlan = require('@contexthub/common/src/models/SubscriptionPlan');
const dotenv = require('dotenv');
const path = require('path');
const { DEFAULT_SUBSCRIPTION_PLANS } = require('../lib/defaultSubscriptionPlans');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Seed Subscription Plans
 * Creates the 4 default subscription plans
 */
async function seedSubscriptionPlans(options = {}) {
  const { connect = true } = options;
  try {
    if (connect) {
      console.log('Connecting to database...');
      await database.connectDB();
    }
    
    console.log('Seeding subscription plans...');

    for (const planData of DEFAULT_SUBSCRIPTION_PLANS) {
      const existing = await SubscriptionPlan.findOne({ slug: planData.slug });
      
      if (existing) {
        console.log(`✓ Plan '${planData.slug}' already exists, updating...`);
        await SubscriptionPlan.findOneAndUpdate(
          { slug: planData.slug },
          { $set: planData },
          { new: true }
        );
      } else {
        console.log(`+ Creating plan '${planData.slug}'...`);
        await SubscriptionPlan.create(planData);
      }
    }

    console.log('\n✅ Successfully seeded subscription plans!');
    console.log('\nPlans created:');
    console.log('1. Free      - $0/month  - 2 users, 500MB, 1K requests');
    console.log('2. Pro       - $5/month  - 10 users, 5GB, 10K requests');
    console.log('3. Pro Max   - $12/month - Unlimited users, 10GB, 100K requests');
    console.log('4. Enterprise - Usage-based - $1/GB storage, $0.1/1K requests (10 cents per 1K)');

    return {
      processed: DEFAULT_SUBSCRIPTION_PLANS.length,
      plans: DEFAULT_SUBSCRIPTION_PLANS.map((plan) => plan.slug),
    };
  } catch (error) {
    console.error('❌ Error seeding subscription plans:', error);
    throw error;
  } finally {
    if (connect) {
      await database.disconnectDB();
    }
  }
}

// Run if called directly
if (require.main === module) {
  seedSubscriptionPlans()
    .then(() => {
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

module.exports = seedSubscriptionPlans;
