const { FormDefinition, FormResponse, FormVersion } = require('@contexthub/common');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const ObjectId = mongoose.Types.ObjectId;

// Turkish character mapping for slug generation
const TURKISH_CHAR_MAP = {
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', I: 'i', İ: 'i', 
  ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u', â: 'a', Â: 'a'
};

/**
 * Transliterate Turkish characters to ASCII
 */
function transliterate(value = '') {
  return value
    .split('')
    .map((char) => TURKISH_CHAR_MAP[char] ?? char)
    .join('');
}

/**
 * Generate URL-friendly slug from text
 */
function slugify(value) {
  if (!value) return '';
  
  return transliterate(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Check if slug exists for tenant
 */
async function slugExists({ tenantId, slug, excludeId }) {
  const query = { tenantId, slug };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  return Boolean(await FormDefinition.exists(query));
}

/**
 * Ensure slug is unique for tenant
 */
async function ensureUniqueSlug({ tenantId, slug, excludeId }) {
  const exists = await slugExists({ tenantId, slug, excludeId });
  if (exists) {
    throw new Error('Slug already exists for this tenant');
  }
}

/**
 * Generate unique slug with counter suffix if needed
 */
async function generateUniqueSlug({ tenantId, baseSlug, excludeId }) {
  let candidate = baseSlug;
  let counter = 1;
  
  while (await slugExists({ tenantId, slug: candidate, excludeId })) {
    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }
  
  return candidate;
}

/**
 * Extract title from i18n object or string
 */
function extractTitle(title) {
  if (typeof title === 'string') return title;
  if (typeof title === 'object' && title !== null) {
    return title.en || title.tr || Object.values(title)[0] || 'Untitled Form';
  }
  return 'Untitled Form';
}

/**
 * Normalize and validate field IDs
 */
function normalizeFields(fields = []) {
  return fields.map((field) => {
    // Ensure each field has a unique ID
    if (!field.id) {
      field.id = uuidv4();
    }
    
    // Ensure order is set
    if (field.order === undefined) {
      field.order = 0;
    }
    
    return field;
  });
}

/**
 * Calculate changes between two field arrays for version tracking
 */
function calculateFieldChanges(oldFields = [], newFields = []) {
  const oldFieldIds = new Set(oldFields.map(f => f.id));
  const newFieldIds = new Set(newFields.map(f => f.id));
  
  const fieldsAdded = newFields
    .filter(f => !oldFieldIds.has(f.id))
    .map(f => f.id);
  
  const fieldsRemoved = oldFields
    .filter(f => !newFieldIds.has(f.id))
    .map(f => f.id);
  
  const fieldsModified = newFields
    .filter(f => {
      if (!oldFieldIds.has(f.id)) return false;
      const oldField = oldFields.find(of => of.id === f.id);
      return JSON.stringify(oldField) !== JSON.stringify(f);
    })
    .map(f => f.id);
  
  return {
    fieldsAdded,
    fieldsRemoved,
    fieldsModified
  };
}

/**
 * Create a new version snapshot
 */
async function createVersion({ tenantId, formId, form, userId, changeNote, changeType = 'updated' }) {
  const existingForm = await FormDefinition.findById(formId);
  if (!existingForm) {
    throw new Error('Form not found');
  }
  
  const versionNumber = existingForm.version || 1;
  
  // Check if this version already exists (to prevent duplicates)
  const existingVersion = await FormVersion.findOne({ formId, version: versionNumber });
  if (existingVersion) {
    // Version already exists, return it instead of creating duplicate
    console.log(`Version ${versionNumber} for form ${formId} already exists, skipping creation`);
    return existingVersion;
  }
  
  const changes = {};
  
  // Calculate field changes if updating
  if (changeType === 'updated' && existingForm.fields) {
    Object.assign(changes, calculateFieldChanges(existingForm.fields, form.fields || []));
  }
  
  const version = new FormVersion({
    tenantId,
    formId,
    version: versionNumber,
    title: form.title || existingForm.title,
    description: form.description || existingForm.description,
    fields: form.fields || existingForm.fields,
    settings: form.settings || existingForm.settings,
    status: form.status || existingForm.status,
    visibility: form.visibility || existingForm.visibility,
    changeNote,
    changeType,
    changes,
    createdBy: userId
  });
  
  try {
    await version.save();
    return version;
  } catch (error) {
    // If duplicate key error, return existing version
    if (error.code === 11000) {
      console.log(`Duplicate key error caught, fetching existing version ${versionNumber} for form ${formId}`);
      const existing = await FormVersion.findOne({ formId, version: versionNumber });
      if (existing) return existing;
    }
    throw error;
  }
}

/**
 * Create a new form
 */
async function create({ tenantId, data, userId }) {
  const { title, slug, description, fields, settings, visibility } = data;
  
  if (!title) {
    throw new Error('Form title is required');
  }
  
  // Generate slug from title if not provided
  const titleText = extractTitle(title);
  const baseSlug = slug ? slugify(slug) : slugify(titleText);
  const uniqueSlug = await generateUniqueSlug({ tenantId, baseSlug });
  
  // Normalize fields
  const normalizedFields = normalizeFields(fields);
  
  // Create form
  const form = new FormDefinition({
    tenantId,
    title,
    slug: uniqueSlug,
    description: description || {},
    fields: normalizedFields,
    settings: settings || {},
    visibility: visibility || 'public',
    status: 'draft',
    version: 1,
    createdBy: userId,
    updatedBy: userId
  });
  
  await form.save();
  
  // Create initial version snapshot
  const version = await createVersion({
    tenantId,
    formId: form._id,
    form,
    userId,
    changeType: 'created',
    changeNote: 'Initial version'
  });
  
  // Update form with version reference
  form.lastVersionId = version._id;
  await form.save();
  
  return form;
}

/**
 * Update an existing form
 */
async function update({ tenantId, formId, data, userId }) {
  const form = await FormDefinition.findOne({ _id: formId, tenantId });
  if (!form) {
    throw new Error('Form not found');
  }
  
  const { title, slug, description, fields, settings, visibility, status } = data;
  
  let hasChanges = false;
  let shouldIncrementVersion = form.status === 'published';
  
  // Update title
  if (title !== undefined) {
    form.title = title;
    hasChanges = true;
  }
  
  // Update slug if changed
  if (slug !== undefined && slug !== form.slug) {
    const newSlug = slugify(slug);
    await ensureUniqueSlug({ tenantId, slug: newSlug, excludeId: formId });
    form.slug = newSlug;
    hasChanges = true;
  }
  
  // Update description
  if (description !== undefined) {
    form.description = description;
    hasChanges = true;
  }
  
  // Update fields
  if (fields !== undefined) {
    form.fields = normalizeFields(fields);
    hasChanges = true;
  }
  
  // Update settings
  if (settings !== undefined) {
    form.settings = { ...form.settings, ...settings };
    hasChanges = true;
  }
  
  // Update visibility
  if (visibility !== undefined) {
    form.visibility = visibility;
    hasChanges = true;
  }
  
  // Update status
  if (status !== undefined && status !== form.status) {
    form.status = status;
    hasChanges = true;
  }
  
  if (!hasChanges) {
    return form;
  }
  
  // Create version snapshot BEFORE incrementing version
  // (snapshot stores the current version, then we increment for next time)
  const version = await createVersion({
    tenantId,
    formId: form._id,
    form: {
      title: form.title,
      description: form.description,
      fields: form.fields,
      settings: form.settings,
      status: form.status,
      visibility: form.visibility
    },
    userId,
    changeType: 'updated'
  });
  
  // Increment version if form is published
  if (shouldIncrementVersion) {
    form.version += 1;
  }
  
  form.updatedBy = userId;
  form.lastVersionId = version._id;
  await form.save();
  
  return form;
}

/**
 * Publish a form
 */
async function publish({ tenantId, formId, userId }) {
  const form = await FormDefinition.findOne({ _id: formId, tenantId });
  if (!form) {
    throw new Error('Form not found');
  }
  
  if (form.status === 'published') {
    throw new Error('Form is already published');
  }
  
  // Validate form has at least one field
  if (!form.fields || form.fields.length === 0) {
    throw new Error('Cannot publish form without fields');
  }
  
  const previousStatus = form.status;
  
  // Create version snapshot BEFORE changing status/version
  const version = await createVersion({
    tenantId,
    formId: form._id,
    form: {
      title: form.title,
      description: form.description,
      fields: form.fields,
      settings: form.settings,
      status: form.status,
      visibility: form.visibility
    },
    userId,
    changeType: 'published',
    changeNote: `Published from ${previousStatus}`
  });
  
  form.status = 'published';
  form.version += 1;
  form.publishedBy = userId;
  form.publishedAt = new Date();
  form.updatedBy = userId;
  form.lastVersionId = version._id;
  
  await form.save();
  
  return form;
}

/**
 * Archive a form
 */
async function archive({ tenantId, formId, userId }) {
  const form = await FormDefinition.findOne({ _id: formId, tenantId });
  if (!form) {
    throw new Error('Form not found');
  }
  
  const previousStatus = form.status;
  
  // Create version snapshot BEFORE changing status
  const version = await createVersion({
    tenantId,
    formId: form._id,
    form: {
      title: form.title,
      description: form.description,
      fields: form.fields,
      settings: form.settings,
      status: form.status,
      visibility: form.visibility
    },
    userId,
    changeType: 'archived',
    changeNote: `Archived from ${previousStatus}`
  });
  
  form.status = 'archived';
  form.updatedBy = userId;
  form.lastVersionId = version._id;
  
  await form.save();
  
  return form;
}

/**
 * Get form by ID
 */
async function getById({ tenantId, formId, populateFields = false }) {
  const query = FormDefinition.findOne({ _id: formId, tenantId });
  
  if (populateFields) {
    query.populate('createdBy', 'firstName lastName email')
         .populate('updatedBy', 'firstName lastName email')
         .populate('publishedBy', 'firstName lastName email');
  }
  
  const form = await query.lean();
  if (!form) {
    throw new Error('Form not found');
  }
  
  return form;
}

/**
 * Get form by slug
 */
async function getBySlug({ tenantId, slug, populateFields = false }) {
  const query = FormDefinition.findOne({ tenantId, slug });
  
  if (populateFields) {
    query.populate('createdBy', 'firstName lastName email');
  }
  
  const form = await query.lean();
  if (!form) {
    throw new Error('Form not found');
  }
  
  return form;
}

/**
 * List forms with filters and pagination
 */
async function list({ tenantId, filters = {}, pagination = {} }) {
  const { status, search } = filters;
  const { page = 1, limit = 20 } = pagination;
  
  const query = { tenantId };
  
  // Filter by status
  if (status) {
    query.status = status;
  }
  
  // Search in title (handle i18n)
  if (search) {
    // Create regex for case-insensitive search
    const searchRegex = new RegExp(search, 'i');
    query.$or = [
      { 'title.en': searchRegex },
      { 'title.tr': searchRegex },
      { slug: searchRegex }
    ];
  }
  
  const skip = (page - 1) * limit;
  
  const [forms, total] = await Promise.all([
    FormDefinition.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'firstName lastName email')
      .lean(),
    FormDefinition.countDocuments(query)
  ]);
  
  return {
    items: forms,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

/**
 * Delete form (soft delete by archiving)
 */
async function deleteForm({ tenantId, formId, userId }) {
  return await archive({ tenantId, formId, userId });
}

/**
 * Hard delete form and all related data
 */
async function hardDelete({ tenantId, formId }) {
  const form = await FormDefinition.findOne({ _id: formId, tenantId });
  if (!form) {
    throw new Error('Form not found');
  }
  
  // Delete all versions
  await FormVersion.deleteMany({ formId });
  
  // Delete all responses
  await FormResponse.deleteMany({ formId });
  
  // Delete form
  await FormDefinition.deleteOne({ _id: formId });
  
  return { success: true };
}

/**
 * Get version history
 */
async function getVersionHistory({ tenantId, formId, pagination = {} }) {
  const form = await FormDefinition.findOne({ _id: formId, tenantId });
  if (!form) {
    throw new Error('Form not found');
  }
  
  return await FormVersion.getVersionHistory(formId, pagination);
}

/**
 * Restore form from a version
 */
async function restoreVersion({ tenantId, formId, version, userId }) {
  const form = await FormDefinition.findOne({ _id: formId, tenantId });
  if (!form) {
    throw new Error('Form not found');
  }
  
  const versionSnapshot = await FormVersion.findOne({ formId, version });
  if (!versionSnapshot) {
    throw new Error('Version not found');
  }
  
  // Restore form state from version
  form.title = versionSnapshot.title;
  form.description = versionSnapshot.description;
  form.fields = versionSnapshot.fields;
  form.settings = versionSnapshot.settings;
  form.visibility = versionSnapshot.visibility;
  form.updatedBy = userId;
  
  // Create new version snapshot for the restore BEFORE incrementing version
  const newVersion = await createVersion({
    tenantId,
    formId: form._id,
    form: {
      title: form.title,
      description: form.description,
      fields: form.fields,
      settings: form.settings,
      status: form.status,
      visibility: form.visibility
    },
    userId,
    changeType: 'restored',
    changeNote: `Restored from version ${version}`
  });
  
  form.version += 1; // Increment version for the restore
  form.lastVersionId = newVersion._id;
  
  await form.save();
  
  return form;
}

/**
 * Duplicate a form
 */
async function duplicate({ tenantId, formId, userId, newTitle }) {
  const originalForm = await FormDefinition.findOne({ _id: formId, tenantId });
  if (!originalForm) {
    throw new Error('Form not found');
  }
  
  // Prepare new title
  const titleText = newTitle || `${extractTitle(originalForm.title)} (Copy)`;
  const title = typeof originalForm.title === 'string' 
    ? titleText 
    : { ...originalForm.title, en: titleText };
  
  // Generate unique slug
  const baseSlug = slugify(titleText);
  const uniqueSlug = await generateUniqueSlug({ tenantId, baseSlug });
  
  // Create duplicate with new IDs for fields
  const duplicatedFields = originalForm.fields.map(field => ({
    ...field.toObject(),
    id: uuidv4() // Generate new ID for each field
  }));
  
  const duplicateData = {
    title,
    slug: uniqueSlug,
    description: originalForm.description,
    fields: duplicatedFields,
    settings: originalForm.settings.toObject(),
    visibility: originalForm.visibility
  };
  
  return await create({ tenantId, data: duplicateData, userId });
}

/**
 * Submit a form response (public endpoint)
 */
async function submitResponse({ tenantId, formId, data, metadata = {} }) {
  // Get form to validate it exists and is published
  const form = await FormDefinition.findOne({
    _id: formId,
    tenantId,
    status: 'published'
  });

  if (!form) {
    throw new Error('Form not found or not published');
  }

  // Validate required fields
  const requiredFields = form.fields.filter(f => f.required);
  for (const field of requiredFields) {
    if (!data[field.name] && data[field.name] !== 0 && data[field.name] !== false) {
      throw new Error(`Field "${field.name}" is required`);
    }
  }

  // Hash IP for privacy
  const crypto = require('crypto');
  const ipRaw = metadata.ip;
  const ipHashed = ipRaw ? crypto.createHash('sha256').update(ipRaw).digest('hex') : null;

  // Create response
  const response = new FormResponse({
    tenantId,
    formId,
    formVersion: form.version,
    data,
    source: metadata.source || 'web',
    locale: metadata.locale || 'en',
    userAgent: metadata.userAgent,
    ip: ipHashed,
    ipRaw: ipRaw,
    geo: metadata.geo,
    device: metadata.device,
    referrer: metadata.referrer,
    userId: metadata.userId,
    userEmail: metadata.userEmail,
    userName: metadata.userName,
    status: 'pending'
  });

  await response.save();

  // Update form submission count
  await FormDefinition.updateOne(
    { _id: formId },
    {
      $inc: { submissionCount: 1 },
      $set: { lastSubmissionAt: new Date() }
    }
  );

  return response;
}

/**
 * Get form responses with filters (admin)
 */
async function getResponses({ tenantId, formId, filters = {}, pagination = {} }) {
  const form = await FormDefinition.findOne({ _id: formId, tenantId });
  if (!form) {
    throw new Error('Form not found');
  }

  const { status, startDate, endDate } = filters;
  const { page = 1, limit = 20 } = pagination;

  const query = { tenantId, formId };

  if (status) {
    query.status = status;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const skip = (page - 1) * limit;

  const [responseDocs, total] = await Promise.all([
    FormResponse.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'firstName lastName email'),
    FormResponse.countDocuments(query)
  ]);

  // Convert to plain objects (important for Mixed type fields)
  const responses = responseDocs.map(doc => doc.toObject());

  // Create field mapping for enriching response data
  const fieldMap = {};
  form.fields.forEach(field => {
    fieldMap[field.name] = {
      id: field.id,
      type: field.type,
      label: field.label,
      options: field.options
    };
  });

  // Enrich responses with field metadata
  const enrichedResponses = responses.map(response => ({
    ...response,
    fieldMetadata: fieldMap
  }));

  return {
    items: enrichedResponses,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    },
    form: {
      id: form._id,
      title: form.title,
      fields: form.fields
    }
  };
}

/**
 * Get single response by ID (admin)
 */
async function getResponseById({ tenantId, formId, responseId }) {
  const [responseDoc, form] = await Promise.all([
    FormResponse.findOne({
      _id: responseId,
      tenantId,
      formId
    })
      .populate('userId', 'firstName lastName email')
      .populate('files.mediaId', 'filename url size mimeType'),
    FormDefinition.findOne({ _id: formId, tenantId })
  ]);

  if (!responseDoc) {
    throw new Error('Response not found');
  }

  if (!form) {
    throw new Error('Form not found');
  }

  // Convert to plain object AFTER accessing data
  // This is important for Mixed type fields
  const response = responseDoc.toObject();

  // Create field mapping for enriching response data
  const fieldMap = {};
  form.fields.forEach(field => {
    fieldMap[field.name] = {
      id: field.id,
      type: field.type,
      label: field.label,
      placeholder: field.placeholder,
      helpText: field.helpText,
      options: field.options,
      required: field.required
    };
  });

  return {
    ...response,
    fieldMetadata: fieldMap,
    form: {
      id: form._id,
      title: form.title,
      fields: form.fields
    }
  };
}

/**
 * Delete response (admin) - Soft delete
 */
async function deleteResponse({ tenantId, formId, responseId }) {
  const response = await FormResponse.findOne({
    _id: responseId,
    tenantId,
    formId
  });

  if (!response) {
    throw new Error('Response not found');
  }

  response.status = 'deleted';
  await response.save();

  return response;
}

/**
 * Permanently delete response (admin) - Hard delete
 */
async function hardDeleteResponse({ tenantId, formId, responseId }) {
  const response = await FormResponse.findOne({
    _id: responseId,
    tenantId,
    formId
  });

  if (!response) {
    throw new Error('Response not found');
  }

  // Permanently delete from database
  await FormResponse.deleteOne({ _id: responseId });

  return { success: true, responseId };
}

/**
 * Mark response as spam (admin)
 */
async function markAsSpam({ tenantId, formId, responseId }) {
  const response = await FormResponse.findOne({
    _id: responseId,
    tenantId,
    formId
  });

  if (!response) {
    throw new Error('Response not found');
  }

  response.status = 'spam';
  response.flaggedAsSpam = true;
  await response.save();

  return response;
}

/**
 * Update response status (admin)
 */
async function updateResponseStatus({ tenantId, formId, responseId, status }) {
  const validStatuses = ['pending', 'processed', 'spam', 'deleted'];

  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const response = await FormResponse.findOne({
    _id: responseId,
    tenantId,
    formId
  });

  if (!response) {
    throw new Error('Response not found');
  }

  response.status = status;

  // Update spam flag if changing to/from spam status
  if (status === 'spam') {
    response.flaggedAsSpam = true;
  } else if (response.flaggedAsSpam && status !== 'spam') {
    response.flaggedAsSpam = false;
  }

  await response.save();

  return response;
}

module.exports = {
  slugify,
  extractTitle,
  create,
  update,
  publish,
  archive,
  getById,
  getBySlug,
  list,
  deleteForm,
  hardDelete,
  getVersionHistory,
  restoreVersion,
  duplicate,
  generateUniqueSlug,
  ensureUniqueSlug,
  submitResponse,
  getResponses,
  getResponseById,
  deleteResponse,
  hardDeleteResponse,
  markAsSpam,
  updateResponseStatus
};
