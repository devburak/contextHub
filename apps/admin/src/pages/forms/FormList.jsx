import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listForms, deleteForm } from '../../lib/api/forms';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { 
  ChevronDownIcon, 
  PlusIcon,
  DocumentTextIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon, ClockIcon, ArchiveBoxIcon } from '@heroicons/react/20/solid';

export default function FormList() {
  const { token, activeTenantId } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Query forms
  const { data, isLoading, isError, refetch } = useQuery(
    ['forms', { tenant: activeTenantId, page, status, search: debouncedSearch }],
    () => listForms({
      page,
      limit: 20,
      filters: {
        status,
        search: debouncedSearch,
      },
    }),
    {
      keepPreviousData: true,
      enabled: !!token && !!activeTenantId,
    }
  );

  const forms = data?.items || [];
  const pagination = data?.pagination || { page: 1, pages: 1 };

  const handleDelete = async (id) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      return;
    }

    try {
      await deleteForm({ id });
      refetch();
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Failed to delete form:', error);
      alert('Form silinemedi. Lütfen tekrar deneyin.');
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-700',
      published: 'bg-green-100 text-green-700',
      archived: 'bg-orange-100 text-orange-700',
    };

    const icons = {
      draft: ClockIcon,
      published: CheckCircleIcon,
      archived: ArchiveBoxIcon,
    };

    const labels = {
      draft: 'Taslak',
      published: 'Yayında',
      archived: 'Arşiv',
    };

    const Icon = icons[status] || ClockIcon;

    return (
      <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium', styles[status])}>
        <Icon className="h-3.5 w-3.5" />
        {labels[status]}
      </span>
    );
  };

  const extractTitle = (title) => {
    if (typeof title === 'string') return title;
    if (typeof title === 'object' && title !== null) {
      return title.tr || title.en || Object.values(title)[0] || 'Başlıksız Form';
    }
    return 'Başlıksız Form';
  };

  const filterInputClass = 'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-400';

  if (isError) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Formlar yüklenirken bir hata oluştu</h3>
            <button
              onClick={() => refetch()}
              className="mt-2 text-sm font-medium text-red-600 hover:text-red-500"
            >
              Tekrar dene
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Formlar</h1>
          <p className="mt-1 text-sm text-gray-500">
            Formlarınızı oluşturun, düzenleyin ve yönetin
          </p>
        </div>
        <Link
          to="/forms/new"
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
        >
          <PlusIcon className="h-5 w-5" />
          Yeni Form
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Durum</label>
          <div className="relative mt-1 w-44">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className={clsx(filterInputClass, 'appearance-none pr-9')}
            >
              <option value="">Hepsi</option>
              <option value="draft">Taslak</option>
              <option value="published">Yayında</option>
              <option value="archived">Arşiv</option>
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Ara</label>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Form başlığı veya slug..."
            className={clsx('mt-1 w-72', filterInputClass)}
          />
        </div>

        {(status || search) && (
          <button
            onClick={() => {
              setStatus('');
              setSearch('');
              setPage(1);
            }}
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Filtreleri Temizle
          </button>
        )}
      </div>

      {/* Forms Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
            <p className="mt-2 text-sm text-gray-500">Formlar yükleniyor...</p>
          </div>
        </div>
      ) : forms.length === 0 ? (
        <div className="text-center py-12">
          <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Form bulunamadı</h3>
          <p className="mt-1 text-sm text-gray-500">
            {search || status ? 'Arama kriterlerinize uygun form bulunamadı.' : 'Henüz form oluşturmadınız.'}
          </p>
          {!search && !status && (
            <div className="mt-6">
              <Link
                to="/forms/new"
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
              >
                <PlusIcon className="h-5 w-5" />
                İlk Formunuzu Oluşturun
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {forms.map((form) => (
              <div
                key={form._id}
                className="relative flex flex-col rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Status Badge */}
                <div className="absolute top-4 right-4">
                  {getStatusBadge(form.status)}
                </div>

                {/* Form Info */}
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 line-clamp-2 pr-20">
                    {extractTitle(form.title)}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {form.slug}
                  </p>

                  <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                    <span>{form.fields?.length || 0} alan</span>
                    <span>•</span>
                    <span>{form.submissionCount || 0} yanıt</span>
                  </div>

                  {form.description && (
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                      {typeof form.description === 'string' 
                        ? form.description 
                        : form.description?.tr || form.description?.en || ''}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 flex items-center gap-2 pt-4 border-t border-gray-100">
                  <Link
                    to={`/forms/${form._id}`}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                  >
                    <PencilIcon className="h-4 w-4" />
                    Düzenle
                  </Link>
                  
                  {form.status === 'published' && (
                    <Link
                      to={`/forms/${form._id}/responses`}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                      title="Yanıtları Görüntüle"
                    >
                      <EyeIcon className="h-4 w-4" />
                      {form.submissionCount || 0}
                    </Link>
                  )}

                  <button
                    onClick={() => handleDelete(form._id)}
                    className={clsx(
                      'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium',
                      deleteConfirmId === form._id
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    )}
                    title={deleteConfirmId === form._id ? 'Silmek için tekrar tıklayın' : 'Sil'}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>

                {/* Last Updated */}
                <div className="mt-3 text-xs text-gray-400">
                  Son güncelleme: {new Date(form.updatedAt).toLocaleDateString('tr-TR')}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
              <div className="flex flex-1 justify-between sm:hidden">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Önceki
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page === pagination.pages}
                  className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Sonraki
                </button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Toplam <span className="font-medium">{pagination.total}</span> formdan{' '}
                    <span className="font-medium">{(page - 1) * 20 + 1}</span> -{' '}
                    <span className="font-medium">{Math.min(page * 20, pagination.total)}</span> arası gösteriliyor
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                      className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Önceki</span>
                      <ChevronDownIcon className="h-5 w-5 rotate-90" aria-hidden="true" />
                    </button>
                    {[...Array(pagination.pages)].map((_, i) => {
                      const pageNum = i + 1;
                      if (
                        pageNum === 1 ||
                        pageNum === pagination.pages ||
                        (pageNum >= page - 1 && pageNum <= page + 1)
                      ) {
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setPage(pageNum)}
                            className={clsx(
                              'relative inline-flex items-center px-4 py-2 text-sm font-semibold',
                              pageNum === page
                                ? 'z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                                : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                            )}
                          >
                            {pageNum}
                          </button>
                        );
                      } else if (pageNum === page - 2 || pageNum === page + 2) {
                        return (
                          <span
                            key={pageNum}
                            className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300"
                          >
                            ...
                          </span>
                        );
                      }
                      return null;
                    })}
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page === pagination.pages}
                      className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="sr-only">Sonraki</span>
                      <ChevronDownIcon className="h-5 w-5 -rotate-90" aria-hidden="true" />
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
