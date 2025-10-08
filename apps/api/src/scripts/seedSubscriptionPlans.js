const { database } = require('@contexthub/common');
const SubscriptionPlan = require('@contexthub/common/src/models/SubscriptionPlan');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Seed Subscription Plans
 * Creates the 4 default subscription plans
 */
async function seedSubscriptionPlans() {
  try {
    console.log('Connecting to database...');
    await database.connectDB();
    
    console.log('Seeding subscription plans...');

    const plans = [
      {
        slug: 'free',
        name: 'Free',
        description: 'Küçük projeler için ideal başlangıç paketi',
        price: 0,
        billingType: 'fixed',
        userLimit: 2, // 1 owner + 1 user
        ownerLimit: 1,
        storageLimit: 500 * 1024 * 1024, // 500 MB
        monthlyRequestLimit: 1000, // 1K requests/month
        pricePerGBStorage: 0,
        pricePerThousandRequests: 0,
        isActive: true,
        sortOrder: 1,
      },
      {
        slug: 'pro',
        name: 'Pro',
        description: 'Büyüyen ekipler için güçlü çözüm',
        price: 5,
        billingType: 'fixed',
        userLimit: 10, // 5 owners + 5 users
        ownerLimit: 5,
        storageLimit: 5 * 1024 * 1024 * 1024, // 5 GB
        monthlyRequestLimit: 10000, // 10K requests/month
        pricePerGBStorage: 0,
        pricePerThousandRequests: 0,
        isActive: true,
        sortOrder: 2,
      },
      {
        slug: 'promax',
        name: 'Pro Max',
        description: 'Profesyonel ekipler için sınırsız güç',
        price: 12,
        billingType: 'fixed',
        userLimit: null, // Unlimited users
        ownerLimit: null, // Unlimited owners
        storageLimit: 10 * 1024 * 1024 * 1024, // 10 GB
        monthlyRequestLimit: 100000, // 100K requests/month
        pricePerGBStorage: 0,
        pricePerThousandRequests: 0,
        isActive: true,
        sortOrder: 3,
      },
      {
        slug: 'enterprise',
        name: 'Enterprise',
        description: 'Kullandığınız kadar ödeyin - kurumsal çözüm',
        price: 0, // Base price (will be calculated based on usage)
        billingType: 'usage-based',
        userLimit: null, // Unlimited users
        ownerLimit: null, // Unlimited owners
        storageLimit: null, // Unlimited storage (but charged)
        monthlyRequestLimit: null, // Unlimited requests (but charged)
        pricePerGBStorage: 1, // $1 per GB
        pricePerThousandRequests: 0.1, // $0.1 per 1K requests (10 cents)
        isActive: true,
        sortOrder: 4,
      },
    ];

    for (const planData of plans) {
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

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding subscription plans:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedSubscriptionPlans();
}

module.exports = seedSubscriptionPlans;
