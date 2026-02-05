const { FormDefinition, FormResponse, FormVersion } = require('@contexthub/common');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { emitDomainEvent } = require('../lib/domainEvents');
const { triggerWebhooksForTenant } = require('../lib/webhookTrigger');
const { mailService } = require('./mailService');
const tenantSettingsService = require('./tenantSettingsService');

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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_REGEX.test(value.trim());
}

function getI18nValue(value, locale = 'tr') {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value[locale]
      || value.tr
      || value.en
      || Object.values(value)[0]
      || '';
  }
  return '';
}

function formatFieldValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map(item => formatFieldValue(item)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }
  return String(value);
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveRecipientsFromForm({ form, data = {}, recipients = [] }) {
  const resolved = new Set();
  const fieldMap = new Map();
  (form.fields || []).forEach((field) => {
    fieldMap.set(field.id, field);
  });

  recipients
    .filter(Boolean)
    .map((item) => String(item).trim())
    .filter(Boolean)
    .forEach((recipient) => {
      const fieldMatch = recipient.match(/^\{field:(.+)\}$/);
      if (fieldMatch) {
        const fieldId = fieldMatch[1];
        const field = fieldMap.get(fieldId);
        if (!field) return;
        const fieldValue = data?.[field.name];
        if (Array.isArray(fieldValue)) {
          fieldValue.forEach((val) => {
            if (isValidEmail(val)) resolved.add(val.trim());
            if (typeof val === 'string' && val.includes(',') || typeof val === 'string' && val.includes(';')) {
              val.split(/[;,]+/).map(v => v.trim()).filter(Boolean).forEach((v) => {
                if (isValidEmail(v)) resolved.add(v);
              });
            }
          });
        } else if (typeof fieldValue === 'string') {
          if (isValidEmail(fieldValue)) {
            resolved.add(fieldValue.trim());
          } else if (fieldValue.includes(',') || fieldValue.includes(';')) {
            fieldValue.split(/[;,]+/).map(v => v.trim()).filter(Boolean).forEach((v) => {
              if (isValidEmail(v)) resolved.add(v);
            });
          }
        }
        return;
      }

      if (isValidEmail(recipient)) {
        resolved.add(recipient.trim());
      }
    });

  return Array.from(resolved);
}

function buildSubmissionEmail({ form, data, locale, submittedAt }) {
  const title = extractTitle(form.title);
  const formattedDate = submittedAt instanceof Date
    ? submittedAt.toLocaleString('tr-TR')
    : new Date().toLocaleString('tr-TR');

  const sortedFields = [...(form.fields || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const rows = sortedFields
    .map((field) => {
      if (!field || !field.name) return null;
      const value = data?.[field.name];
      if (value === undefined || value === null || value === '') return null;
      const label = getI18nValue(field.label, locale) || field.name;
      const formattedValue = formatFieldValue(value);
      if (!formattedValue) return null;
      return { label, value: formattedValue };
    })
    .filter(Boolean);

  const htmlRows = rows.length
    ? rows.map((item) => `
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb; font-weight: 600; background: #f9fafb; width: 220px;">${escapeHtml(item.label)}</td>
          <td style="padding: 8px 12px; border: 1px solid #e5e7eb;">${escapeHtml(item.value)}</td>
        </tr>
      `).join('')
    : `<tr><td colspan="2" style="padding: 12px; border: 1px solid #e5e7eb;">Yanıt verisi bulunamadı.</td></tr>`;

  const textRows = rows.length
    ? rows.map((item) => `- ${item.label}: ${item.value}`).join('\n')
    : 'Yanıt verisi bulunamadı.';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
    </head>
    <body style="font-family: Arial, sans-serif; background: #f3f4f6; padding: 24px; color: #111827;">
      <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;">
        <div style="padding: 24px; border-bottom: 1px solid #e5e7eb;">
          <h2 style="margin: 0 0 8px; font-size: 20px;">${escapeHtml(title)}</h2>
          <p style="margin: 0; color: #6b7280;">Yeni form gönderimi alındı.</p>
        </div>
        <div style="padding: 24px;">
          <p style="margin: 0 0 16px;"><strong>Gönderim Tarihi:</strong> ${escapeHtml(formattedDate)}</p>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb;">
            <tbody>
              ${htmlRows}
            </tbody>
          </table>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `${title}\nYeni form gönderimi alındı.\nGönderim Tarihi: ${formattedDate}\n\n${textRows}`;

  return { html, text };
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

function buildFormEventPayload(formDoc) {
  if (!formDoc) {
    return null;
  }

  const doc = typeof formDoc.toObject === 'function'
    ? formDoc.toObject({ depopulate: true })
    : formDoc;

  const updatedAt = doc.updatedAt instanceof Date
    ? doc.updatedAt.toISOString()
    : new Date().toISOString();

  return {
    formId: doc._id ? doc._id.toString() : null,
    slug: doc.slug,
    status: doc.status,
    version: doc.version,
    visibility: doc.visibility,
    title: doc.title,
    submissionCount: doc.submissionCount ?? null,
    updatedAt
  };
}

function normalizeFormSettings(settings = {}) {
  const normalized = { ...settings };
  const legacyEnabled = settings.enableNotifications;
  const legacyRecipients = Array.isArray(settings.notificationEmails) ? settings.notificationEmails : [];
  const legacyRequireAuth = settings.requireAuthentication;
  const requireAuth = settings.requireAuth;

  const emailNotifications = {
    ...(settings.emailNotifications || {})
  };

  if (emailNotifications.enabled === undefined && legacyEnabled !== undefined) {
    emailNotifications.enabled = Boolean(legacyEnabled);
  }

  if ((!Array.isArray(emailNotifications.recipients) || emailNotifications.recipients.length === 0) && legacyRecipients.length > 0) {
    emailNotifications.recipients = legacyRecipients;
  }

  normalized.emailNotifications = emailNotifications;

  if (requireAuth === undefined && legacyRequireAuth !== undefined) {
    normalized.requireAuth = Boolean(legacyRequireAuth);
  }

  if (legacyRequireAuth === undefined && requireAuth !== undefined) {
    normalized.requireAuthentication = Boolean(requireAuth);
  }

  return normalized;
}

function applyEmailNotificationCompatibility(settings = {}) {
  const normalized = { ...settings };
  const emailNotifications = normalized.emailNotifications;
  const legacyRequireAuth = normalized.requireAuthentication;

  if (emailNotifications && typeof emailNotifications === 'object') {
    if (typeof emailNotifications.enabled === 'boolean') {
      normalized.enableNotifications = emailNotifications.enabled;
    }

    if (Array.isArray(emailNotifications.recipients)) {
      normalized.notificationEmails = emailNotifications.recipients;
    }
  }

  if (legacyRequireAuth !== undefined && normalized.requireAuth === undefined) {
    normalized.requireAuth = Boolean(legacyRequireAuth);
  }

  return normalized;
}

async function recordFormEvent({
  tenantId,
  type,
  form,
  userId,
  source = 'admin-ui',
  payloadExtras = {},
  metadataExtras = {}
}) {
  if (!tenantId || !type) {
    return;
  }

  const normalizedUserId = userId ? userId.toString() : null;
  const basePayload = buildFormEventPayload(form) || {};
  const payload = { ...basePayload, ...(payloadExtras || {}) };

  const metadata = {
    source,
    ...metadataExtras
  };

  if (!metadata.triggeredBy) {
    metadata.triggeredBy = normalizedUserId ? 'user' : 'system';
  }

  if (normalizedUserId) {
    metadata.userId = normalizedUserId;
  }

  Object.keys(metadata).forEach((key) => {
    if (metadata[key] === undefined || metadata[key] === null) {
      delete metadata[key];
    }
  });

  try {
    const eventId = await emitDomainEvent(tenantId, type, payload, metadata);
    if (eventId) {
      triggerWebhooksForTenant(tenantId);
    }
  } catch (error) {
    console.error('[formService] Failed to emit domain event', { tenantId, type, error });
  }
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
  const normalizedSettings = applyEmailNotificationCompatibility(
    normalizeFormSettings(settings || {})
  );

  const form = new FormDefinition({
    tenantId,
    title,
    slug: uniqueSlug,
    description: description || {},
    fields: normalizedFields,
    settings: normalizedSettings,
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

  await recordFormEvent({
    tenantId,
    type: 'form.created',
    form,
    userId,
    source: 'admin-ui'
  });
  
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
    const normalizedSettings = applyEmailNotificationCompatibility(
      normalizeFormSettings(settings || {})
    );

    // Deep merge settings, especially for nested objects like emailNotifications
    const mergedSettings = { ...form.settings.toObject?.() || form.settings };

    Object.keys(normalizedSettings).forEach(key => {
      if (typeof normalizedSettings[key] === 'object' && normalizedSettings[key] !== null && !Array.isArray(normalizedSettings[key])) {
        // Deep merge for nested objects like emailNotifications, webhooks
        mergedSettings[key] = {
          ...(mergedSettings[key] || {}),
          ...normalizedSettings[key],
        };
      } else {
        mergedSettings[key] = normalizedSettings[key];
      }
    });

    form.settings = mergedSettings;
    form.markModified('settings');
    form.markModified('settings.emailNotifications');
    form.markModified('settings.webhooks');
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

  await recordFormEvent({
    tenantId,
    type: 'form.updated',
    form,
    userId,
    source: 'admin-ui'
  });
  
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

  form.settings = normalizeFormSettings(form.settings || {});
  
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

  form.settings = normalizeFormSettings(form.settings || {});
  
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
  await recordFormEvent({
    tenantId,
    type: 'form.submitted',
    form,
    userId: metadata.userId,
    source: metadata.source || 'form',
    payloadExtras: {
      response: {
        responseId: response._id ? response._id.toString() : null,
        status: response.status,
        submittedAt: response.createdAt instanceof Date ? response.createdAt.toISOString() : new Date().toISOString(),
        data: response.data,
        locale: response.locale,
        source: response.source,
        userAgent: response.userAgent,
        userEmail: response.userEmail,
        userName: response.userName,
        referrer: response.referrer,
        device: response.device,
        geo: response.geo,
        ipHash: response.ip
      }
    },
    metadataExtras: {
      triggeredBy: metadata.userId ? 'user' : 'integration',
      requestId: metadata.requestId
    }
  });

  // Send email notifications if enabled
  try {
    // Re-fetch response to check if notification was already sent (prevents duplicate emails)
    const freshResponse = await FormResponse.findById(response._id).lean();
    if (freshResponse?.notificationSent) {
      console.log(`[formService] Email notification already sent for response ${response._id}, skipping`);
      return response;
    }

    const emailSettings = form.settings?.emailNotifications || {};
    const legacyEnabled = form.settings?.enableNotifications;
    const legacyRecipients = form.settings?.notificationEmails || [];
    const notificationsEnabled = emailSettings.enabled ?? legacyEnabled;
    const recipientSource = Array.isArray(emailSettings.recipients) && emailSettings.recipients.length > 0
      ? emailSettings.recipients
      : legacyRecipients;

    if (notificationsEnabled && recipientSource.length > 0) {
      const recipients = resolveRecipientsFromForm({
        form,
        data,
        recipients: recipientSource
      });

      if (recipients.length > 0) {
        const locale = response.locale || metadata.locale || 'tr';
        const { html, text } = buildSubmissionEmail({
          form,
          data,
          locale,
          submittedAt: response.createdAt
        });

        const defaultSubject = locale?.startsWith('tr')
          ? 'Yeni form gönderimi'
          : 'New form submission';

        const subject = (emailSettings.subject && emailSettings.subject.trim())
          ? emailSettings.subject.trim()
          : `${defaultSubject} - ${extractTitle(form.title)}`;

        let replyTo = emailSettings.replyTo?.trim();

        // Resolve replyTo from form field if it's a field reference
        if (replyTo && replyTo.startsWith('{field:') && replyTo.endsWith('}')) {
          const fieldId = replyTo.slice(7, -1); // Extract field ID from {field:xxx}
          const field = form.fields.find(f => f.id === fieldId);
          if (field) {
            const fieldValue = data?.[field.name];
            if (fieldValue && isValidEmail(fieldValue)) {
              replyTo = fieldValue.trim();
            } else {
              replyTo = undefined; // Invalid or empty email from form field
            }
          } else {
            replyTo = undefined; // Field not found
          }
        }

        if (!replyTo) {
          try {
            const smtpSettings = await tenantSettingsService.getSmtpCredentials(tenantId);
            replyTo = smtpSettings?.fromEmail || undefined;
          } catch (error) {
            replyTo = undefined;
          }
        }

        // Use atomic update to prevent race conditions - mark as sending first
        const updateResult = await FormResponse.updateOne(
          { _id: response._id, notificationSent: { $ne: true } },
          { $set: { notificationSent: true, notificationSentAt: new Date() } }
        );

        // If no document was modified, another process already sent the email
        if (updateResult.modifiedCount === 0) {
          console.log(`[formService] Email notification already being sent for response ${response._id}, skipping`);
          return response;
        }

        // Now send the email
        await mailService.sendMail({
          to: recipients.join(', '),
          subject,
          html,
          text,
          replyTo
        }, tenantId);

        console.log(`[formService] Email notification sent for response ${response._id}`);
      }
    }
  } catch (error) {
    console.error('[formService] Failed to send form notification email:', error);
    // If email sending failed, reset the notificationSent flag so it can be retried
    try {
      await FormResponse.updateOne(
        { _id: response._id },
        { $set: { notificationSent: false, notificationError: error.message } }
      );
    } catch (resetError) {
      console.error('[formService] Failed to reset notificationSent flag:', resetError);
    }
  }

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
