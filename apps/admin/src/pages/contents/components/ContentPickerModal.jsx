import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { listContents } from '../../../lib/api/contents.js';

const STATUS_LABELS = {
  draft: 'Taslak',
  published: 'Yayında',
  archived: 'Arşiv'
};

function useDebouncedValue(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default function ContentPickerModal({
  isOpen,
  onClose,
  onSelect,
  selectedIds = []
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 400);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setPage(1);
    }
  }, [isOpen]);

  const queryKey = useMemo(
    () => [
      'content-picker-list',
      {
        page,
        search: debouncedSearch || undefined
      }
    ],
    [page, debouncedSearch]
  );

  const contentsQuery = useQuery(
    queryKey,
    () =>
      listContents({
        page,
        limit: 12,
        filters: {
          search: debouncedSearch || undefined
        }
      }),
    {
      enabled: isOpen,
      keepPreviousData: true
    }
  );

  const items = contentsQuery.data?.items ?? [];
  const pagination = contentsQuery.data?.pagination ?? {
    page: 1,
    pages: 1,
    total: 0,
    limit: 12
  };

  const handleSelect = (item, event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (onSelect) {
      onSelect(item, event);
    }
  };

  const isSelected = (id) => selectedIds.includes(id);

  const canGoPrev = page > 1;
  const canGoNext = page < (pagination.pages || 1);

  if (!isOpen) {
    return null;
  }

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-[70]"
        onClose={onClose}
        initialFocus={searchInputRef}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-900/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-gray-900">
                      İçerik seç
                    </Dialog.Title>
                    <p className="mt-1 text-sm text-gray-500">
                      İçerik kayıtlarını arayarak ilişkiler alanına ekleyebilirsin.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <span className="sr-only">Kapat</span>
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="px-6 py-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative w-full sm:max-w-sm">
                      <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                      <input
                        ref={searchInputRef}
                        type="search"
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value);
                          setPage(1);
                        }}
                        placeholder="Başlık veya slug ara"
                        className="w-full rounded-md border border-gray-300 pl-10 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                    {contentsQuery.isFetching && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        Yenileniyor
                      </div>
                    )}
                  </div>

                  <div className="mt-5">
                    {contentsQuery.isLoading ? (
                      <div className="flex h-40 items-center justify-center text-sm text-gray-500">
                        İçerikler yükleniyor...
                      </div>
                    ) : contentsQuery.isError ? (
                      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        İçerikler alınırken hata oluştu.
                      </div>
                    ) : items.length ? (
                      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
                        {items.map((item) => {
                          const id = item._id?.toString?.() || item._id || item.id;
                          return (
                            <li key={id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">
                                  {item.title || 'Başlıksız içerik'}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {item.slug || 'Slug yok'} · {STATUS_LABELS[item.status] || item.status || 'Durum yok'}
                                </p>
                                <p className="mt-1 text-[11px] font-mono text-gray-400">{id}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {isSelected(id) && (
                                  <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                                    Seçili
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(event) => handleSelect(item, event)}
                                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                >
                                  Ekle
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="flex h-40 flex-col items-center justify-center rounded-md border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                        Sonuç bulunamadı.
                        <span className="mt-1 text-xs">Arama kriterlerini değiştirerek tekrar dene.</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex flex-col items-center gap-3 border-t border-gray-200 pt-4 text-xs text-gray-500 sm:flex-row sm:justify-between">
                    <div>
                      Toplam {pagination.total ?? items.length} kayıt
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => canGoPrev && setPage((prev) => Math.max(prev - 1, 1))}
                        disabled={!canGoPrev}
                        className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Önceki
                      </button>
                      <span>
                        Sayfa {pagination.page} / {pagination.pages || 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => canGoNext && setPage((prev) => prev + 1)}
                        disabled={!canGoNext}
                        className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Sonraki
                      </button>
                    </div>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
