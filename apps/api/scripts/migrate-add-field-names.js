/**
 * Migrate existing forms to add name field to all fields
 * Run with: node scripts/migrate-add-field-names.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const mongoose = require('mongoose');
const { FormDefinition } = require('@contexthub/common');

async function migrateFieldNames() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('Error: MONGODB_URI or MONGO_URI not found in .env file');
      process.exit(1);
    }
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected to MongoDB\n');

    // Find all forms
    const forms = await FormDefinition.find({});
    console.log(`Found ${forms.length} forms to check`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const form of forms) {
      let hasChanges = false;

      // Check if any field is missing the name property
      const updatedFields = form.fields.map(field => {
        if (!field.name) {
          // Generate name from id if missing
          field.name = field.id;
          hasChanges = true;
          return field;
        }
        return field;
      });

      if (hasChanges) {
        form.fields = updatedFields;
        
        // Disable validation to allow saving without requiring all new schema fields
        await form.save({ validateBeforeSave: false });
        
        console.log(`✓ Updated form: ${form.slug} (${form._id})`);
        console.log(`  Added name property to ${updatedFields.filter(f => !f.name).length} fields`);
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    console.log(`\n✓ Migration complete!`);
    console.log(`  Updated: ${updatedCount} forms`);
    console.log(`  Skipped: ${skippedCount} forms (already have name property)`);

  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

migrateFieldNames();
