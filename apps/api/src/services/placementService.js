const { PlacementDefinition, PlacementEvent } = require('@contexthub/common');

/**
 * Placement CRUD Service
 */

/**
 * Create new placement
 */
async function createPlacement({ tenantId, data, userId }) {
  // Generate slug if not provided
  if (!data.slug) {
    data.slug = await generateSlug(data.name, tenantId);
  } else {
    // Check slug uniqueness
    const existing = await PlacementDefinition.findOne({ tenantId, slug: data.slug });
    if (existing) {
      throw new Error('Bu slug zaten kullanımda');
    }
  }

  const placement = new PlacementDefinition({
    ...data,
    tenantId,
    createdBy: userId,
    updatedBy: userId
  });

  await placement.save();
  return placement;
}

/**
 * Update placement
 */
async function updatePlacement({ tenantId, placementId, data, userId }) {
  const placement = await PlacementDefinition.findOne({ _id: placementId, tenantId });
  
  if (!placement) {
    throw new Error('Placement bulunamadı');
  }

  // If slug is changing, check uniqueness
  if (data.slug && data.slug !== placement.slug) {
    const existing = await PlacementDefinition.findOne({ 
      tenantId, 
      slug: data.slug,
      _id: { $ne: placementId }
    });
    if (existing) {
      throw new Error('Bu slug zaten kullanımda');
    }
  }

  Object.assign(placement, {
    ...data,
    updatedBy: userId,
    updatedAt: new Date()
  });

  await placement.save();
  return placement;
}

/**
 * Get placement by ID
 */
async function getPlacementById({ tenantId, placementId }) {
  const placement = await PlacementDefinition.findOne({ _id: placementId, tenantId });
  
  if (!placement) {
    throw new Error('Placement bulunamadı');
  }

  return placement;
}

/**
 * Get placement by slug
 */
async function getPlacementBySlug({ tenantId, slug }) {
  const placement = await PlacementDefinition.findOne({ tenantId, slug });
  
  if (!placement) {
    throw new Error('Placement bulunamadı');
  }

  return placement;
}

/**
 * List placements with filters
 */
async function listPlacements({ 
  tenantId, 
  status, 
  category, 
  search, 
  tags,
  page = 1, 
  limit = 20,
  sortBy = 'updatedAt',
  sortOrder = 'desc'
}) {
  const query = { tenantId };

  if (status) {
    query.status = status;
  }

  if (category) {
    query.category = category;
  }

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { slug: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  if (tags?.length) {
    query.tags = { $in: tags };
  }

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  const [placements, total] = await Promise.all([
    PlacementDefinition.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    PlacementDefinition.countDocuments(query)
  ]);

  return {
    placements,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

/**
 * Archive placement (soft delete)
 */
async function archivePlacement({ tenantId, placementId, userId }) {
  const placement = await PlacementDefinition.findOne({ _id: placementId, tenantId });
  
  if (!placement) {
    throw new Error('Placement bulunamadı');
  }

  placement.status = 'archived';
  placement.updatedBy = userId;
  placement.updatedAt = new Date();

  await placement.save();
  return placement;
}

/**
 * Delete placement permanently
 */
async function deletePlacement({ tenantId, placementId }) {
  const placement = await PlacementDefinition.findOne({ _id: placementId, tenantId });
  
  if (!placement) {
    throw new Error('Placement bulunamadı');
  }

  // Delete associated events (optional - depends on data retention policy)
  // await PlacementEvent.deleteMany({ placementId });

  await placement.deleteOne();
  return { success: true };
}

/**
 * Duplicate placement
 */
async function duplicatePlacement({ tenantId, placementId, userId, newName }) {
  const original = await PlacementDefinition.findOne({ _id: placementId, tenantId }).lean();
  
  if (!original) {
    throw new Error('Placement bulunamadı');
  }

  const name = newName || `${original.name} (Kopya)`;
  const slug = await generateSlug(name, tenantId);

  const duplicated = new PlacementDefinition({
    ...original,
    _id: undefined,
    name,
    slug,
    status: 'draft',
    tenantId,
    createdBy: userId,
    updatedBy: userId,
    createdAt: undefined,
    updatedAt: undefined
  });

  await duplicated.save();
  return duplicated;
}

/**
 * Add experience to placement
 */
async function addExperience({ tenantId, placementId, experience, userId }) {
  const placement = await PlacementDefinition.findOne({ _id: placementId, tenantId });
  
  if (!placement) {
    throw new Error('Placement bulunamadı');
  }

  placement.experiences.push(experience);
  placement.updatedBy = userId;
  placement.updatedAt = new Date();

  await placement.save();
  
  // Return the newly added experience
  const newExperience = placement.experiences[placement.experiences.length - 1];
  return newExperience;
}

/**
 * Update experience
 */
async function updateExperience({ tenantId, placementId, experienceId, data, userId }) {
  const placement = await PlacementDefinition.findOne({ _id: placementId, tenantId });
  
  if (!placement) {
    throw new Error('Placement bulunamadı');
  }

  const experience = placement.experiences.id(experienceId);
  if (!experience) {
    throw new Error('Experience bulunamadı');
  }

  Object.assign(experience, data);
  placement.updatedBy = userId;
  placement.updatedAt = new Date();

  await placement.save();
  return experience;
}

/**
 * Delete experience
 */
async function deleteExperience({ tenantId, placementId, experienceId, userId }) {
  const placement = await PlacementDefinition.findOne({ _id: placementId, tenantId });
  
  if (!placement) {
    throw new Error('Placement bulunamadı');
  }

  // Check if it's the last experience
  if (placement.experiences.length === 1) {
    throw new Error('Son experience silinemez');
  }

  // Remove experience
  placement.experiences.pull(experienceId);
  placement.updatedBy = userId;
  placement.updatedAt = new Date();

  await placement.save();
  return { success: true };
}

/**
 * Generate unique slug
 */
async function generateSlug(name, tenantId) {
  // Turkish character mapping
  const turkishMap = {
    'ç': 'c', 'Ç': 'C',
    'ğ': 'g', 'Ğ': 'G',
    'ı': 'i', 'İ': 'I',
    'ö': 'o', 'Ö': 'O',
    'ş': 's', 'Ş': 'S',
    'ü': 'u', 'Ü': 'U'
  };

  let slug = name.toLowerCase();
  
  // Replace Turkish characters
  Object.entries(turkishMap).forEach(([turkish, english]) => {
    slug = slug.replace(new RegExp(turkish, 'g'), english);
  });

  // Replace non-alphanumeric with dash
  slug = slug.replace(/[^a-z0-9]+/g, '-');
  
  // Remove leading/trailing dashes
  slug = slug.replace(/^-+|-+$/g, '');

  // Check uniqueness
  let uniqueSlug = slug;
  let counter = 1;

  while (true) {
    const existing = await PlacementDefinition.findOne({ tenantId, slug: uniqueSlug });
    if (!existing) break;
    uniqueSlug = `${slug}-${counter}`;
    counter++;
  }

  return uniqueSlug;
}

/**
 * Get placement stats
 */
async function getPlacementStats({ tenantId, placementId, dateRange, groupBy = 'day' }) {
  const placement = await PlacementDefinition.findOne({ _id: placementId, tenantId });
  
  if (!placement) {
    throw new Error('Placement bulunamadı');
  }

  const stats = await PlacementEvent.getPlacementStats({
    tenantId,
    placementId,
    dateRange,
    groupBy
  });

  return stats;
}

/**
 * Get experience stats
 */
async function getExperienceStats({ tenantId, placementId, experienceId, dateRange }) {
  const placement = await PlacementDefinition.findOne({ _id: placementId, tenantId });
  
  if (!placement) {
    throw new Error('Placement bulunamadı');
  }

  const experience = placement.experiences.id(experienceId);
  if (!experience) {
    throw new Error('Experience bulunamadı');
  }

  const stats = await PlacementEvent.getPlacementStats({
    tenantId,
    placementId,
    experienceId,
    dateRange,
    groupBy: 'day'
  });

  return stats;
}

/**
 * Get conversion funnel
 */
async function getConversionFunnel({ tenantId, placementId, experienceId, dateRange, goalType }) {
  const placement = await PlacementDefinition.findOne({ _id: placementId, tenantId });
  
  if (!placement) {
    throw new Error('Placement bulunamadı');
  }

  const funnel = await PlacementEvent.getConversionFunnel({
    tenantId,
    placementId,
    experienceId,
    dateRange,
    goalType
  });

  return funnel;
}

module.exports = {
  createPlacement,
  updatePlacement,
  getPlacementById,
  getPlacementBySlug,
  listPlacements,
  archivePlacement,
  deletePlacement,
  duplicatePlacement,
  addExperience,
  updateExperience,
  deleteExperience,
  generateSlug,
  getPlacementStats,
  getExperienceStats,
  getConversionFunnel
};
