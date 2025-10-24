import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getForm, getFormResponses, getFormResponse, deleteFormResponse, markResponseAsSpam } from '../../lib/api/forms';
import { useAuth } from '../../contexts/AuthContext.jsx';
import clsx from 'clsx';
import {
  ChevronDownIcon,
  ArrowLeftIcon,
  EyeIcon,
  TrashIcon,
  FunnelIcon,
  NoSymbolIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';
import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  XCircleIcon
} from '@heroicons/react/20/solid';
import ResponseDetailModal from '../../components/forms/ResponseDetailModal';

export default function FormResponses() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, activeTenantId } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [selectedResponseId, setSelectedResponseId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Query form
  const { data: form, isLoading: isFormLoading } = useQuery(
    ['form', { id, tenant: activeTenantId }],
    () => getForm({ id }),
    {
      enabled: !!token && !!activeTenantId && !!id,
    }
  );

  // Query responses
  const { data, isLoading, isError, refetch } = useQuery(
    ['formResponses', { formId: id, tenant: activeTenantId, page, status, startDate, endDate }],
    () => getFormResponses({
      id,
      page,
      limit: 20,
      filters: {
        status,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      },
    }),
    {
      keepPreviousData: true,
      enabled: !!token && !!activeTenantId && !!id,
    }
  );

  // Query single response detail (when modal is open)
  const { data: responseDetail, isLoading: isResponseLoading } = useQuery(
    ['formResponse', { formId: id, responseId: selectedResponseId, tenant: activeTenantId }],
    async () => {
      const detail = await getFormResponse({ formId: id, responseId: selectedResponseId });
      console.log('Response detail from API:', detail);
      console.log('Response data keys:', detail?.data ? Object.keys(detail.data) : 'NO DATA');
      return detail;
    },
    {
      enabled: !!token && !!activeTenantId && !!id && !!selectedResponseId,
    }
  );

  const responses = data?.items || [];
  const pagination = data?.pagination || { page: 1, pages: 1 };
  const formFromResponses = data?.form; // Backend'den gelen form bilgisi (response ile birlikte)

  const handleDelete = async (responseId) => {
    if (deleteConfirmId !== responseId) {
      setDeleteConfirmId(responseId);
      return;
    }

    try {
      await deleteFormResponse({ formId: id, responseId });
      refetch();
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Failed to delete response:', error);
      alert('Yanıt silinemedi. Lütfen tekrar deneyin.');
    }
  };

  const handleHardDelete = async (responseId) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/forms/${id}/responses/${responseId}/permanent`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Tenant-ID': activeTenantId,
        },
      });

      if (!response.ok) {
        throw new Error('Kalıcı silme işlemi başarısız oldu');
      }

      // Yanıtları yenile
      refetch();
    } catch (error) {
      console.error('Failed to permanently delete response:', error);
      alert(`Yanıt kalıcı olarak silinemedi. Lütfen tekrar deneyin. (${error.message})`);
    }
  };

  const handleMarkAsSpam = async (responseId) => {
    try {
      await markResponseAsSpam({ formId: id, responseId });
      refetch();
    } catch (error) {
      console.error('Failed to mark as spam:', error);
      alert('Spam olarak işaretlenemedi. Lütfen tekrar deneyin.');
    }
  };

  const handleStatusChange = async (responseId, newStatus) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/forms/${id}/responses/${responseId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Tenant-ID': activeTenantId,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Status güncellenemedi');
      }

      // Yanıtları yenile
      refetch();
    } catch (error) {
      console.error('Failed to update status:', error);
      alert(`Durum güncellenemedi. Lütfen tekrar deneyin. (${error.message})`);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-700',
      processed: 'bg-green-100 text-green-700',
      spam: 'bg-red-100 text-red-700',
      deleted: 'bg-gray-100 text-gray-700',
    };

    const icons = {
      pending: ClockIcon,
      processed: CheckCircleIcon,
      spam: ExclamationTriangleIcon,
      deleted: XCircleIcon,
    };

    const labels = {
      pending: 'Beklemede',
      processed: 'İşlendi',
      spam: 'Spam',
      deleted: 'Silindi',
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

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('tr-TR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filterInputClass = 'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-gray-400';

  if (isFormLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-2 text-sm text-gray-500">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Yanıtlar yüklenirken bir hata oluştu</h3>
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
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/forms')}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Form Yanıtları
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {form ? extractTitle(form.title) : 'Yükleniyor...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">
              {pagination.total || 0}
            </div>
            <div className="text-xs text-gray-500">Toplam Yanıt</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <FunnelIcon className="h-5 w-5 text-gray-400" />
          <h3 className="text-sm font-medium text-gray-900">Filtreler</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Durum</label>
            <div className="relative">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className={clsx(filterInputClass, 'appearance-none pr-9')}
              >
                <option value="">Hepsi</option>
                <option value="pending">Beklemede</option>
                <option value="processed">İşlendi</option>
                <option value="spam">Spam</option>
                <option value="deleted">Silindi</option>
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Başlangıç Tarihi</label>
            <div className="relative">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className={filterInputClass}
              />
              <CalendarIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bitiş Tarihi</label>
            <div className="relative">
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className={filterInputClass}
              />
              <CalendarIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>

          <div className="flex items-end">
            {(status || startDate || endDate) && (
              <button
                onClick={() => {
                  setStatus('');
                  setStartDate('');
                  setEndDate('');
                  setPage(1);
                }}
                className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                Filtreleri Temizle
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Responses Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
            <p className="mt-2 text-sm text-gray-500">Yanıtlar yükleniyor...</p>
          </div>
        </div>
      ) : responses.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <NoSymbolIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Yanıt bulunamadı</h3>
          <p className="mt-1 text-sm text-gray-500">
            {status || startDate || endDate ? 'Filtrelere uygun yanıt bulunamadı.' : 'Henüz bu forma yanıt verilmemiş.'}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tarih
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Durum
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Kaynak
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Önizleme
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      İşlemler
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {responses.map((response) => (
                    <tr key={response._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(response.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(response.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="capitalize">{response.source || 'api'}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div className="max-w-xs truncate">
                          {Object.entries(response.data).slice(0, 2).map(([key, value]) => (
                            <div key={key} className="truncate">
                              <span className="font-medium">{key}:</span> {String(value)}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedResponseId(response._id)}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-900"
                            title="Detayları Görüntüle"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>

                          {response.status !== 'spam' && (
                            <button
                              onClick={() => handleMarkAsSpam(response._id)}
                              className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-900"
                              title="Spam Olarak İşaretle"
                            >
                              <ExclamationTriangleIcon className="h-4 w-4" />
                            </button>
                          )}

                          <button
                            onClick={() => handleDelete(response._id)}
                            className={clsx(
                              'inline-flex items-center gap-1',
                              deleteConfirmId === response._id
                                ? 'text-red-700 font-bold'
                                : 'text-red-600 hover:text-red-900'
                            )}
                            title={deleteConfirmId === response._id ? 'Silmek için tekrar tıklayın' : 'Sil'}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 rounded-lg">
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
                    Toplam <span className="font-medium">{pagination.total}</span> yanıttan{' '}
                    <span className="font-medium">{(page - 1) * 20 + 1}</span> -{' '}
                    <span className="font-medium">{Math.min(page * 20, pagination.total)}</span> arası gösteriliyor
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                      className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronDownIcon className="h-5 w-5 rotate-90" />
                    </button>
                    {[...Array(Math.min(pagination.pages, 7))].map((_, i) => {
                      let pageNum;
                      if (pagination.pages <= 7) {
                        pageNum = i + 1;
                      } else if (page <= 4) {
                        pageNum = i + 1;
                      } else if (page >= pagination.pages - 3) {
                        pageNum = pagination.pages - 6 + i;
                      } else {
                        pageNum = page - 3 + i;
                      }

                      return (
                        <button
                          key={i}
                          onClick={() => setPage(pageNum)}
                          className={clsx(
                            'relative inline-flex items-center px-4 py-2 text-sm font-semibold',
                            pageNum === page
                              ? 'z-10 bg-blue-600 text-white'
                              : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'
                          )}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page === pagination.pages}
                      className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronDownIcon className="h-5 w-5 -rotate-90" />
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Response Detail Modal */}
      {selectedResponseId && (
        <ResponseDetailModal
          response={responseDetail}
          form={formFromResponses || form} // Önce liste endpoint'inden gelen form'u kullan
          isLoading={isResponseLoading}
          onClose={() => setSelectedResponseId(null)}
          onDelete={(responseId) => {
            handleDelete(responseId);
            setSelectedResponseId(null);
          }}
          onHardDelete={(responseId) => {
            handleHardDelete(responseId);
            setSelectedResponseId(null);
          }}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
