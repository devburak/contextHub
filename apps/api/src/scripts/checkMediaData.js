const { database } = require('@contexthub/common');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

async function checkMediaData() {
  try {
    console.log('Connecting to database...');
    await database.connectDB();
    
    const Media = require('@contexthub/common/src/models/Media');
    const Tenant = require('@contexthub/common/src/models/Tenant');
    
    const tenant = await Tenant.findOne({ name: 'ContextHub' });
    if (!tenant) {
      console.error('Tenant not found');
      process.exit(1);
    }
    
    console.log(`\n📋 Checking Media for tenant: ${tenant.name} (${tenant._id})\n`);
    
    // Total media count
    const totalCount = await Media.countDocuments({ tenantId: tenant._id });
    console.log(`Total media files: ${totalCount}`);
    
    // By status
    const statuses = await Media.aggregate([
      { $match: { tenantId: tenant._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    console.log('\nBy status:');
    statuses.forEach(s => console.log(`  ${s._id || 'null'}: ${s.count}`));
    
    // Total size (all files)
    const allFilesAgg = await Media.aggregate([
      { $match: { tenantId: tenant._id } },
      { $group: { _id: null, totalSize: { $sum: { $ifNull: ['$size', 0] } }, count: { $sum: 1 } } },
    ]);
    const allTotal = allFilesAgg[0] || { totalSize: 0, count: 0 };
    console.log(`\nAll files: ${allTotal.count} files, ${(allTotal.totalSize / (1024**3)).toFixed(4)} GB`);
    
    // Total size (excluding deleted)
    const activeFilesAgg = await Media.aggregate([
      { $match: { tenantId: tenant._id, status: { $ne: 'deleted' } } },
      { $group: { _id: null, totalSize: { $sum: { $ifNull: ['$size', 0] } }, count: { $sum: 1 } } },
    ]);
    const activeTotal = activeFilesAgg[0] || { totalSize: 0, count: 0 };
    console.log(`Active files: ${activeTotal.count} files, ${(activeTotal.totalSize / (1024**3)).toFixed(4)} GB`);
    
    // Total size (status = active)
    const statusActiveAgg = await Media.aggregate([
      { $match: { tenantId: tenant._id, status: 'active' } },
      { $group: { _id: null, totalSize: { $sum: { $ifNull: ['$size', 0] } }, count: { $sum: 1 } } },
    ]);
    const statusActive = statusActiveAgg[0] || { totalSize: 0, count: 0 };
    console.log(`Status=active: ${statusActive.count} files, ${(statusActive.totalSize / (1024**3)).toFixed(4)} GB`);
    
    // Sample some files
    const samples = await Media.find({ tenantId: tenant._id })
      .limit(5)
      .select('filename size status mimeType createdAt')
      .lean();
    
    console.log('\nSample files:');
    samples.forEach(f => {
      console.log(`  - ${f.filename || 'unnamed'} (${f.status || 'no-status'}) - ${(f.size / 1024).toFixed(2)} KB - ${f.mimeType}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkMediaData();
