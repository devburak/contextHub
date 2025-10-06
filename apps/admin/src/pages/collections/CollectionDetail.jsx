import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listCollectionTypes,
  updateCollectionType,
  listCollectionEntries,
  createCollectionEntry,
  updateCollectionEntry,
  deleteCollectionEntry
} from '../../lib/api/collections.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import CollectionDefinitionForm from './components/CollectionDefinitionForm.jsx';
import CollectionEntryModal from './components/CollectionEntryModal.jsx';
import { PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function getEntryTitle(entry, collection) {
  if (entry.indexed?.title) return entry.indexed.title;
  const slugField = collection?.settings?.slugField;
  if (slugField && entry.data?.[slugField]) {
    return entry.data[slugField];
  }
  if (entry.slug) return entry.slug;
  return entry._id;
}

const statusBadge = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-green-100 text-green-700',
  archived: 'bg-orange-100 text-orange-700'
};

export default function CollectionDetail() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { token, activeTenantId } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [showEditForm, setShowEditForm] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 350);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('-createdAt');
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const { data: collections = [], isLoading: isCollectionsLoading, isError: isCollectionsError } = useQuery(
    ['collections', { tenant: activeTenantId }],
    () => listCollectionTypes(),
    { enabled: Boolean(token && activeTenantId) }
  );

  const collection = useMemo(() => collections.find((item) => item.key === key), [collections, key]);

  const entriesQuery = useQuery(
    ['collection-entries', { key, page, status: statusFilter, search: debouncedSearch, sort }],
    () => listCollectionEntries({
      collectionKey: key,
      page,
      limit: 20,
      status: statusFilter || undefined,
      q: debouncedSearch || undefined,
      sort
    }),
    {
      enabled: Boolean(collection)
    }
  );

  const updateCollectionMutation = useMutation((payload) => updateCollectionType(key, payload), {
    onSuccess: () => {
      toast.success('Koleksiyon güncellendi');
      queryClient.invalidateQueries(['collections']);
      setShowEditForm(false);
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error.message || 'Koleksiyon güncellenemedi';
      toast.error(message);
    }
  });

  const createEntryMutation = useMutation((payload) => createCollectionEntry(key, payload), {
    onSuccess: () => {
      toast.success('Kayıt oluşturuldu');
      queryClient.invalidateQueries(['collection-entries']);
      setEntryModalOpen(false);
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error.message || 'Kayıt oluşturulamadı';
      toast.error(message);
    }
  });

  const updateEntryMutation = useMutation(
    ({ entryId, payload }) => updateCollectionEntry(key, entryId, payload),
    {
      onSuccess: () => {
        toast.success('Kayıt güncellendi');
        queryClient.invalidateQueries(['collection-entries']);
        setEntryModalOpen(false);
      },
      onError: (error) => {
        const message = error?.response?.data?.message || error.message || 'Kayıt güncellenemedi';
        toast.error(message);
      }
    }
  );

  const deleteEntryMutation = useMutation((entryId) => deleteCollectionEntry(key, entryId), {
    onSuccess: () => {
      toast.success('Kayıt silindi');
      queryClient.invalidateQueries(['collection-entries']);
    },
    onError: (error) => {
      const message = error?.response?.data?.message || error.message || 'Kayıt silinemedi';
      toast.error(message);
    }
  });

  useEffect(() => {
    if (!isCollectionsLoading && !collection && !isCollectionsError) {
      toast.error('Koleksiyon bulunamadı');
      navigate('/collections');
    }
  }, [collection, isCollectionsLoading, isCollectionsError, navigate, toast]);

  if (isCollectionsLoading || !collection) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
          <p className="text-sm text-gray-500">Koleksiyon yükleniyor...</p>
        </div>
      </div>
    );
  }

  const entries = entriesQuery.data?.items || [];
  const pagination = entriesQuery.data?.pagination || { page: 1, pages: 1 };

  const handleEntrySubmit = (payload) => {
    if (editingEntry) {
      updateEntryMutation.mutate({ entryId: editingEntry._id, payload });
    } else {
      createEntryMutation.mutate(payload);
    }
  };

  const handleDelete = (entryId) => {
    if (deleteConfirmId !== entryId) {
      setDeleteConfirmId(entryId);
      return;
    }
    deleteEntryMutation.mutate(entryId, {
      onSettled: () => setDeleteConfirmId(null)
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{collection.name?.tr || collection.key}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600">/{collection.key}</span>
            <span>· {collection.fields?.length || 0} alan</span>
            {collection.settings?.slugField && <span>· slug: {collection.settings.slugField}</span>}
          </div>
        </div>
        <button
          onClick={() => setShowEditForm((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <PencilIcon className="h-4 w-4" />
          Koleksiyonu Düzenle
        </button>
      </div>

      {showEditForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Koleksiyon Tanımı</h2>
          <p className="mt-1 text-sm text-gray-500">Alanları güncelleyin, slug ve sıralama ayarlarını yapılandırın.</p>
          <div className="mt-4">
            <CollectionDefinitionForm
              initialValues={collection}
              mode="edit"
              onSubmit={updateCollectionMutation.mutate}
              isSubmitting={updateCollectionMutation.isLoading}
              submitLabel="Güncellemeyi Kaydet"
              onCancel={() => setShowEditForm(false)}
            />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Kayıtlar</h2>
            <p className="mt-1 text-sm text-gray-500">Listedeki kayıtları filtreleyebilir, düzenleyebilir veya silebilirsiniz.</p>
          </div>
          <button
            onClick={() => {
              setEditingEntry(null);
              setEntryModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
          >
            <PlusIcon className="h-4 w-4" />
            Yeni Kayıt
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700">Durum</label>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">Tümü</option>
              <option value="draft">Taslak</option>
              <option value="published">Yayında</option>
              <option value="archived">Arşiv</option>
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700">Sırala</label>
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="-createdAt">En yeni</option>
              <option value="createdAt">En eski</option>
              <option value="-indexed.date">Tarih (yeni)</option>
              <option value="indexed.date">Tarih (eski)</option>
              <option value="indexed.title">Başlık (A-Z)</option>
              <option value="-indexed.title">Başlık (Z-A)</option>
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700">Ara</label>
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Başlık, slug veya alan değeri..."
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>

        <div className="mt-6">
          {entriesQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-2">
                <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
                <p className="text-sm text-gray-500">Kayıtlar yükleniyor...</p>
              </div>
            </div>
          ) : entries.length ? (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Başlık</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Slug</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Durum</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Güncelleme</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {entries.map((entry) => {
                    const statusClass = statusBadge[entry.status] || statusBadge.draft;
                    return (
                      <tr key={entry._id}>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <div className="font-medium">{getEntryTitle(entry, collection)}</div>
                          <div className="text-xs text-gray-500">{entry._id}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 font-mono">{entry.slug || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingEntry(entry);
                                setEntryModalOpen(true);
                              }}
                              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Düzenle
                            </button>
                            <button
                              onClick={() => handleDelete(entry._id)}
                              className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${deleteConfirmId === entry._id ? 'border-red-300 bg-red-50 text-red-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                            >
                              {deleteConfirmId === entry._id ? 'Emin misiniz?' : (
                                <span className="inline-flex items-center gap-1">
                                  <TrashIcon className="h-4 w-4" /> Sil
                                </span>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12 text-center text-sm text-gray-500">
              Henüz kayıt bulunmuyor. İlk kaydı eklemek için yukarıdaki "Yeni Kayıt" düğmesini kullanabilirsiniz.
            </div>
          )}
        </div>

        {pagination.pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <div>
              Sayfa {pagination.page} / {pagination.pages}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={page <= 1}
                className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Önceki
              </button>
              <button
                onClick={() => setPage((prev) => Math.min(prev + 1, pagination.pages))}
                disabled={page >= pagination.pages}
                className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sonraki
              </button>
            </div>
          </div>
        )}
      </div>

      <CollectionEntryModal
        isOpen={entryModalOpen}
        onClose={() => {
          if (!createEntryMutation.isLoading && !updateEntryMutation.isLoading) {
            setEntryModalOpen(false);
            setEditingEntry(null);
          }
        }}
        collection={collection}
        entry={editingEntry}
        onSubmit={handleEntrySubmit}
        isSubmitting={createEntryMutation.isLoading || updateEntryMutation.isLoading}
      />
    </div>
  );
}
