const { database } = require('@contexthub/common');
const FeatureFlagDefinition = require('@contexthub/common/src/models/FeatureFlagDefinition');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const featureFlags = [
  {
    key: 'limitShow',
    label: 'Limit ve Kullanım Gösterimi',
    description: 'Dashboard\'da "Limit & Kullanım" bölümünü gösterir. Depolama, API çağrıları, kullanıcı limitleri ve aktif plan bilgilerini içerir.',
    defaultEnabled: false,
    notes: 'Subscription plan sistemi aktif olduğunda açılmalıdır.'
  },
  {
    key: 'statisticShow',
    label: 'İstatistikler Gösterimi',
    description: 'Dashboard\'da "İstatistikler" bölümünü gösterir. Toplam kullanıcı, içerik, medya dosyaları ve API çağrıları istatistiklerini içerir.',
    defaultEnabled: false,
    notes: 'Genel bakış için kullanılır, performans endişesi varsa kapatılabilir.'
  },
  {
    key: 'contentScheduling',
    label: 'İçerik Zamanlama',
    description: 'İçeriklerin belirli bir tarih ve saatte yayınlanmasını sağlar. "scheduled" durumunu aktif eder.',
    defaultEnabled: false,
    notes: 'İçerik editörde zamanlama seçeneklerini gösterir.'
  }
];

async function seedFeatureFlags(options = {}) {
  const { connect = true } = options;
  try {
    if (connect) {
      console.log('🔗 Connecting to database...');
      await database.connectDB();
      console.log('✅ Connected to database\n');
    }

    console.log('🚩 Seeding feature flag definitions...\n');

    for (const flag of featureFlags) {
      const existing = await FeatureFlagDefinition.findOne({ key: flag.key });
      
      if (existing) {
        // Update existing flag
        await FeatureFlagDefinition.updateOne(
          { key: flag.key },
          { $set: flag }
        );
        console.log(`   ✓ Updated: ${flag.key} - ${flag.label}`);
      } else {
        // Create new flag
        await FeatureFlagDefinition.create(flag);
        console.log(`   ✓ Created: ${flag.key} - ${flag.label}`);
      }
    }

    console.log(`\n✅ Successfully seeded ${featureFlags.length} feature flags!`);
    console.log('\n📝 Feature Flags:');
    featureFlags.forEach(flag => {
      console.log(`   • ${flag.key}: ${flag.label}`);
      console.log(`     Default: ${flag.defaultEnabled ? 'Enabled' : 'Disabled'}`);
      console.log(`     ${flag.description}`);
      console.log('');
    });

    return {
      processed: featureFlags.length,
      keys: featureFlags.map((flag) => flag.key),
    };
  } catch (error) {
    console.error('❌ Error seeding feature flags:', error);
    throw error;
  } finally {
    if (connect) {
      await database.disconnectDB();
    }
  }
}

if (require.main === module) {
  seedFeatureFlags()
    .then(() => {
      process.exit(0);
    })
    .catch(() => {
      process.exit(1);
    });
}

module.exports = seedFeatureFlags;
