/**
 * Check for duplicate FormVersion entries for a specific form
 * Run with: node scripts/check-duplicates.js <formId>
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const mongoose = require('mongoose');
const { FormVersion } = require('@contexthub/common');

async function checkDuplicates() {
  try {
    const formId = process.argv[2] || '68e25ca9aa9fc7aa8f5b45f1';
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('Error: MONGODB_URI or MONGO_URI not found in .env file');
      process.exit(1);
    }
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB\n');

    // Find all versions for this form
    const versions = await FormVersion.find({ formId }).sort({ version: 1, createdAt: 1 });
    
    console.log(`Found ${versions.length} version records for form ${formId}:`);
    console.log('');
    
    // Group by version number
    const versionGroups = {};
    versions.forEach(v => {
      if (!versionGroups[v.version]) {
        versionGroups[v.version] = [];
      }
      versionGroups[v.version].push(v);
    });
    
    // Show duplicates
    let hasDuplicates = false;
    Object.entries(versionGroups).forEach(([version, records]) => {
      if (records.length > 1) {
        hasDuplicates = true;
        console.log(`⚠️  Version ${version} has ${records.length} records (DUPLICATE!):`);
        records.forEach((r, i) => {
          console.log(`   ${i + 1}. ID: ${r._id}, Created: ${r.createdAt}, ChangeType: ${r.changeType}`);
        });
      } else {
        console.log(`✓  Version ${version}: 1 record (OK)`);
      }
    });
    
    if (hasDuplicates) {
      console.log('\n⚠️  Duplicates found! Run fix-specific-duplicates.js to clean them up.');
    } else {
      console.log('\n✓  No duplicates found!');
    }

  } catch (error) {
    console.error('Error checking duplicates:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

checkDuplicates();
