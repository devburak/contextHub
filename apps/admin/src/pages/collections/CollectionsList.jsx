import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PlusCircleIcon, ArrowRightIcon, TrashIcon } from '@heroicons/react/24/outline';
import { listCollectionTypes, createCollectionType, deleteCollectionType } from '../../lib/api/collections.js';
import { useApiError } from '../../lib/useApiError.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext.jsx';
import CollectionDefinitionForm from './components/CollectionDefinitionForm.jsx';

const statusConfig = {
  active: {
    labelKey: 'status.active',
    className: 'bg-green-100 text-green-700'
  },
  archived: {
    labelKey: 'status.archived',
    className: 'bg-gray-100 text-gray-600'
  }
};

export default function CollectionsList() {
  const { isAuthenticated, activeTenantId } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const describeError = useApiError();
  const queryClient = useQueryClient();
  const [isFormExpanded, setFormExpanded] = useState(false);
  const [deleteConfirmKey, setDeleteConfirmKey] = useState(null);

  const { data: collections = [], isLoading, isError, refetch } = useQuery(
    ['collections', { tenant: activeTenantId }],
    () => listCollectionTypes(),
    {
      enabled: Boolean(isAuthenticated && activeTenantId)
    }
  );

  const createMutation = useMutation((payload) => createCollectionType(payload), {
    onSuccess: () => {
      toast.success(t('collection.create_success'));
      queryClient.invalidateQueries(['collections']);
      setFormExpanded(false);
    },
    onError: (error) => {
      toast.error(describeError(error, 'collection.create_failed'));
    }
  });

  const deleteMutation = useMutation((collectionKey) => deleteCollectionType(collectionKey), {
    onSuccess: () => {
      toast.success(t('collection.delete_success'));
      queryClient.invalidateQueries(['collections']);
      setDeleteConfirmKey(null);
    },
    onError: (error) => {
      toast.error(describeError(error, 'collection.delete_failed'));
    }
  });

  const handleCreate = (payload) => {
    createMutation.mutate(payload);
  };

  const handleDelete = (collectionKey) => {
    if (deleteConfirmKey !== collectionKey) {
      setDeleteConfirmKey(collectionKey);
      return;
    }
    deleteMutation.mutate(collectionKey);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('collection.list_title')}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('collection.list_subtitle')}
          </p>
        </div>
        <button
          onClick={() => setFormExpanded((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
        >
          <PlusCircleIcon className="h-5 w-5" />
          {t('collection.new')}
        </button>
      </div>

      {isError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{t('collection.list_load_failed')}</p>
          <button
            onClick={() => refetch()}
            className="mt-2 text-sm font-semibold text-red-600 hover:text-red-500"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white py-12">
              <div className="flex flex-col items-center">
                <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-r-transparent" />
                <p className="mt-3 text-sm text-gray-500">{t('collection.list_loading')}</p>
              </div>
            </div>
          ) : collections.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {collections.map((collection) => {
                const statusMeta = statusConfig[collection.status] || statusConfig.active;
                const fieldCount = collection.fields?.length || 0;
                const canDelete = collection.status !== 'active';
                return (
                  <article
                    key={collection.key}
                    className="relative flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
                  >
                    <Link to={`/collections/${collection.key}`} className="group block min-h-0 flex-1">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h2 className="text-lg font-semibold text-gray-900">
                              {collection.name?.tr || collection.name?.en || collection.key}
                            </h2>
                            <p className="mt-1 text-sm text-gray-500">/{collection.key}</p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusMeta.className}`}>
                            {t(statusMeta.labelKey)}
                          </span>
                        </div>
                        {collection.description?.tr && (
                          <p className="mt-3 text-sm text-gray-600 line-clamp-3">{collection.description.tr}</p>
                        )}
                      </div>
                    </Link>
                    <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-sm text-gray-500">
                      <span>{t('collection.field_count', { count: fieldCount })}</span>
                      <div className="inline-flex items-center gap-2">
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(collection.key)}
                            disabled={deleteMutation.isLoading && deleteConfirmKey === collection.key}
                            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
                              deleteConfirmKey === collection.key
                                ? 'border-red-300 bg-red-50 text-red-600'
                                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            {deleteConfirmKey === collection.key ? t('collection.delete_confirm_short') : (
                              <>
                                <TrashIcon className="h-4 w-4" />
                                {t('common.delete')}
                              </>
                            )}
                          </button>
                        )}
                        <Link to={`/collections/${collection.key}`} className="inline-flex items-center gap-1 font-medium text-blue-600">
                          {t('common.details')}
                          <ArrowRightIcon className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center">
              <h3 className="text-lg font-semibold text-gray-900">{t('collection.empty_title')}</h3>
              <p className="mt-2 text-sm text-gray-500">
                {t('collection.empty_hint')}
              </p>
            </div>
          )}
        </section>

        <aside className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${isFormExpanded ? '' : 'hidden lg:block'}`}>
          <h2 className="text-base font-semibold text-gray-900">{t('collection.create_panel_title')}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {t('collection.create_panel_hint')}
          </p>
          <div className="mt-4">
            <CollectionDefinitionForm
              initialValues={{ status: 'active', fields: [] }}
              onSubmit={handleCreate}
              isSubmitting={createMutation.isLoading}
              submitLabel={t('collection.create_submit')}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
