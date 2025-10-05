import { apiClient } from '../api.js';

const BASE = '/forms';

/**
 * List forms with filters and pagination
 */
export async function listForms({ page = 1, limit = 20, filters = {} } = {}) {
  const params = { page, limit };
  if (filters.status) params.status = filters.status;
  if (filters.search) params.search = filters.search;

  const response = await apiClient.get(BASE, { params });
  return response.data;
}

/**
 * Get a single form by ID
 */
export async function getForm({ id }) {
  const response = await apiClient.get(`${BASE}/${id}`);
  return response.data.form;
}

/**
 * Create a new form
 */
export async function createForm({ data }) {
  const response = await apiClient.post(BASE, data);
  return response.data.form;
}

/**
 * Update an existing form
 */
export async function updateForm({ id, data }) {
  const response = await apiClient.put(`${BASE}/${id}`, data);
  return response.data.form;
}

/**
 * Publish a form
 */
export async function publishForm({ id }) {
  const response = await apiClient.post(`${BASE}/${id}/publish`);
  return response.data.form;
}

/**
 * Archive a form
 */
export async function archiveForm({ id }) {
  const response = await apiClient.post(`${BASE}/${id}/archive`);
  return response.data.form;
}

/**
 * Delete a form
 */
export async function deleteForm({ id }) {
  const response = await apiClient.delete(`${BASE}/${id}`);
  return response.data;
}

/**
 * Get version history for a form
 */
export async function getFormVersions({ id, page = 1, limit = 20 } = {}) {
  const response = await apiClient.get(`${BASE}/${id}/versions`, {
    params: { page, limit }
  });
  return response.data;
}

/**
 * Restore a form from a specific version
 */
export async function restoreFormVersion({ id, version }) {
  const response = await apiClient.post(`${BASE}/${id}/restore/${version}`);
  return response.data.form;
}

/**
 * Duplicate a form
 */
export async function duplicateForm({ id, title }) {
  const response = await apiClient.post(`${BASE}/${id}/duplicate`, { title });
  return response.data.form;
}

/**
 * Check if a slug is available
 */
export async function checkFormSlug({ slug, formId }) {
  const response = await apiClient.get(`${BASE}/check-slug`, {
    params: { slug, formId }
  });
  return response.data;
}

/**
 * Forms API object with all methods
 */
export const formsApi = {
  listForms: (params) => listForms(params || {}),
  getForm: (id) => getForm({ id }),
  createForm: (data) => createForm({ data }),
  updateForm: (id, data) => updateForm({ id, data }),
  publishForm: (id) => publishForm({ id }),
  archiveForm: (id) => archiveForm({ id }),
  deleteForm: (id) => deleteForm({ id }),
  getFormVersions: (id, params = {}) => getFormVersions({ id, ...params }),
  restoreFormVersion: (id, version) => restoreFormVersion({ id, version }),
  duplicateForm: (id, title) => duplicateForm({ id, title }),
  checkFormSlug: (slug, formId) => checkFormSlug({ slug, formId }),
};
