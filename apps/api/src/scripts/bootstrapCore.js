const path = require('path');
const dotenv = require('dotenv');
const { database } = require('@contexthub/common');
const seedSubscriptionPlans = require('./seedSubscriptionPlans');
const seedFeatureFlags = require('./seedFeatureFlags');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

function parseArgs(argv = []) {
  return {
    skipFlags: argv.includes('--skip-flags'),
  };
}

async function bootstrapCore(options = {}) {
  const args = {
    ...parseArgs(process.argv.slice(2)),
    ...options,
  };

  console.log('ContextHub core bootstrap basliyor...');
  await database.connectDB();

  try {
    const planSummary = await seedSubscriptionPlans({ connect: false, exitOnComplete: false });
    const flagSummary = args.skipFlags
      ? { skipped: true, processed: 0 }
      : await seedFeatureFlags({ connect: false, exitOnComplete: false });

    console.log('\n✅ Core bootstrap tamamlandi.');
    console.log(`  Planlar: ${planSummary.processed}`);
    console.log(`  Feature flags: ${flagSummary.skipped ? 'skip edildi' : flagSummary.processed}`);

    return {
      plans: planSummary,
      featureFlags: flagSummary,
    };
  } finally {
    await database.disconnectDB();
  }
}

if (require.main === module) {
  bootstrapCore().catch((error) => {
    console.error('\n❌ Core bootstrap basarisiz:', error);
    process.exit(1);
  });
}

module.exports = bootstrapCore;
