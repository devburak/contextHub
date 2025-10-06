/**
 * Fix duplicate FormVersion entries
 * Run with: node scripts/fix-duplicate-versions.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const mongoose = require('mongoose');
const { FormVersion } = require('@contexthub/common');

async function fixDuplicateVersions() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('Error: MONGODB_URI or MONGO_URI not found in .env file');
      process.exit(1);
    }
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB');

    // Find all duplicate formId+version combinations
    const duplicates = await FormVersion.aggregate([
      {
        $group: {
          _id: { formId: '$formId', version: '$version' },
          count: { $sum: 1 },
          ids: { $push: '$_id' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    console.log(`Found ${duplicates.length} duplicate formId+version combinations`);

    if (duplicates.length === 0) {
      console.log('No duplicates to fix!');
      process.exit(0);
    }

    // For each duplicate, keep the first one and delete the rest
    let deletedCount = 0;
    for (const dup of duplicates) {
      const [keepId, ...deleteIds] = dup.ids;
      
      console.log(`\nDuplicate: formId=${dup._id.formId}, version=${dup._id.version}`);
      console.log(`  Keeping: ${keepId}`);
      console.log(`  Deleting: ${deleteIds.join(', ')}`);

      const result = await FormVersion.deleteMany({ _id: { $in: deleteIds } });
      deletedCount += result.deletedCount;
    }

    console.log(`\n✓ Deleted ${deletedCount} duplicate records`);
    console.log('✓ Database cleaned successfully!');

  } catch (error) {
    console.error('Error fixing duplicates:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

fixDuplicateVersions();
