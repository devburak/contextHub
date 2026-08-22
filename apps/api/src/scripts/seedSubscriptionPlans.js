const { database } = require('@contexthub/common');
const SubscriptionPlan = require('@contexthub/common/src/models/SubscriptionPlan');
const PlanPrice = require('@contexthub/common/src/models/PlanPrice');
const dotenv = require('dotenv');
const path = require('path');
const { DEFAULT_SUBSCRIPTION_PLANS, DEFAULT_PLAN_PRICES } = require('../lib/defaultSubscriptionPlans');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

function buildPlanPriceUpdate(priceData, planId, env = process.env) {
  const configuredExternalPriceId = priceData.envKey
    ? env[priceData.envKey]?.trim()
    : null;
  const configuredAmount = priceData.amountEnvKey ? env[priceData.amountEnvKey]?.trim() : null;
  if (priceData.optional && (!configuredAmount || !configuredExternalPriceId)) return null;
  const amountMinor = configuredAmount === null || configuredAmount === undefined
    ? priceData.amountMinor
    : Number(configuredAmount);
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error(`Invalid minor-unit amount for ${priceData.key}`);
  }
  const update = {
    planId,
    provider: priceData.provider,
    interval: priceData.interval,
    currency: priceData.currency,
    amountMinor,
    active: true,
  };

  // An unset deployment variable must never erase a provider ID that is
  // already live. New records still receive the schema's null default.
  if (configuredExternalPriceId) {
    update.externalPriceId = configuredExternalPriceId;
  }

  return update;
}

/**
 * Seed Subscription Plans
 * Creates the 4 default subscription plans
 */
async function seedSubscriptionPlans(options = {}) {
  const { connect = true, dryRun = false } = options;
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
        // Commercial/plugin feature keys are data owned by the deployment overlay.
        // Core seeding must preserve unknown entitlements on existing plan records.
        const corePlanData = { ...planData };
        delete corePlanData.features;
        if (!dryRun) {
          await SubscriptionPlan.findOneAndUpdate(
            { slug: planData.slug },
            { $set: corePlanData, $unset: { tenantLimit: '' } },
            { new: true }
          );
        }
      } else {
        console.log(`+ Creating plan '${planData.slug}'...`);
        if (!dryRun) {
          await SubscriptionPlan.create(planData);
        }
      }
    }

    for (const priceData of DEFAULT_PLAN_PRICES) {
      const plan = await SubscriptionPlan.findOne({ slug: priceData.planSlug });
      if (!plan) throw new Error(`Plan not found while seeding price: ${priceData.planSlug}`);
      const priceUpdate = buildPlanPriceUpdate(priceData, plan._id);
      if (!priceUpdate) {
        console.log(`· Price '${priceData.key}' skipped; local amount or provider plan reference is not configured`);
        continue;
      }

      console.log(`${dryRun ? '·' : '✓'} Price '${priceData.key}' ${dryRun ? 'would be upserted' : 'upserting...'}`);
      if (!dryRun) {
        await PlanPrice.findOneAndUpdate(
          { key: priceData.key },
          { $set: priceUpdate },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    }

    console.log(`\n✅ ${dryRun ? 'Dry run completed; no records changed.' : 'Successfully seeded subscription plans!'}`);
    console.log('\nPlans created:');
    console.log('1. Free      - $0/month  - 1 user, invitations disabled, 500MB, 1K requests');
    console.log('2. Pro       - $12/month per tenant - 5 users, 3GB, 50K requests');
    console.log('3. Pro Max   - $45/month per tenant - unlimited users, 5GB, 150K requests');
    console.log('4. Enterprise - $250+/month per tenant - contract pricing and custom limits');

    return {
      processed: DEFAULT_SUBSCRIPTION_PLANS.length,
      plans: DEFAULT_SUBSCRIPTION_PLANS.map((plan) => plan.slug),
      prices: DEFAULT_PLAN_PRICES.filter((price) => buildPlanPriceUpdate(price, 'preview')).map((price) => price.key),
      dryRun,
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
  seedSubscriptionPlans({ dryRun: process.argv.includes('--dry-run') })
    .then(() => {
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

module.exports = seedSubscriptionPlans;
module.exports.buildPlanPriceUpdate = buildPlanPriceUpdate;
