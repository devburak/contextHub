import { apiClient } from '../api.js';

const BASE = '/collections';

export async function listCollectionTypes({ status } = {}) {
  const response = await apiClient.get(BASE, {
    params: status ? { status } : undefined
  });
  return response.data.collections || [];
}

export async function createCollectionType(data) {
  const response = await apiClient.post(BASE, data);
  return response.data.collection;
}

export async function updateCollectionType(key, data) {
  const response = await apiClient.put(`${BASE}/${key}`, data);
  return response.data.collection;
}

export async function listCollectionEntries({ collectionKey, page = 1, limit = 20, status, q, sort, filter } = {}) {
  if (!collectionKey) {
    throw new Error('collectionKey is required');
  }

  const params = { page, limit };
  if (status) params.status = status;
  if (q) params.q = q;
  if (sort) params.sort = sort;
  if (filter && typeof filter === 'object') {
    params.filter = filter;
  }

  const response = await apiClient.get(`${BASE}/${collectionKey}/entries`, { params });
  return response.data;
}

export async function createCollectionEntry(collectionKey, payload) {
  if (!collectionKey) {
    throw new Error('collectionKey is required');
  }
  const response = await apiClient.post(`${BASE}/${collectionKey}/entries`, payload);
  return response.data.entry;
}

export async function updateCollectionEntry(collectionKey, entryId, payload) {
  if (!collectionKey || !entryId) {
    throw new Error('collectionKey and entryId are required');
  }
  const response = await apiClient.put(`${BASE}/${collectionKey}/entries/${entryId}`, payload);
  return response.data.entry;
}

export async function deleteCollectionEntry(collectionKey, entryId) {
  if (!collectionKey || !entryId) {
    throw new Error('collectionKey and entryId are required');
  }
  await apiClient.delete(`${BASE}/${collectionKey}/entries/${entryId}`);
  return true;
}

export const collectionsApi = {
  listCollectionTypes,
  createCollectionType,
  updateCollectionType,
  listCollectionEntries,
  createCollectionEntry,
  updateCollectionEntry,
  deleteCollectionEntry
};
