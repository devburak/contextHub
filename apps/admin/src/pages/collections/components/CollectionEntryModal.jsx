import { Fragment, useEffect, useMemo, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Taslak' },
  { value: 'published', label: 'Yayında' },
  { value: 'archived', label: 'Arşiv' }
];

const formatDateForInput = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const formatDateTimeForInput = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const iso = date.toISOString();
  return iso.slice(0, 16);
};

const parseCommaSeparated = (input) => {
  if (!input) return undefined;
  if (Array.isArray(input)) return input.map((item) => `${item}`);
  return input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const ensureArray = (value) => {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  return [value];
};

function getFieldLabel(field) {
  return field.label?.tr || field.label?.en || field.key;
}

export function CollectionEntryModal({
  isOpen,
  onClose,
  collection,
  entry,
  onSubmit,
  isSubmitting = false
}) {
  const initialData = useMemo(() => entry?.data || {}, [entry]);
  const [data, setData] = useState(initialData);
  const [status, setStatus] = useState(entry?.status || 'draft');
  const [slug, setSlug] = useState(entry?.slug || '');
  const [relationsText, setRelationsText] = useState(() => (entry?.relations ? JSON.stringify(entry.relations, null, 2) : ''));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setData(initialData);
      setStatus(entry?.status || 'draft');
      setSlug(entry?.slug || '');
      setRelationsText(entry?.relations ? JSON.stringify(entry.relations, null, 2) : '');
      setError(null);
    }
  }, [isOpen, initialData, entry]);

  const handleFieldUpdate = (fieldKey, value) => {
    setData((prev) => ({ ...prev, [fieldKey]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    try {
      let relations;
      if (relationsText && relationsText.trim()) {
        relations = JSON.parse(relationsText);
      }

      const payloadData = {};

      (collection?.fields || []).forEach((field) => {
        const rawValue = data[field.key];
        if (rawValue === undefined || rawValue === null || rawValue === '') {
          return;
        }

        switch (field.type) {
          case 'number': {
            const parsed = Number(rawValue);
            if (!Number.isFinite(parsed)) {
              throw new Error(`${field.key} alanı için sayı değeri gerekli`);
            }
            payloadData[field.key] = parsed;
            break;
          }
          case 'boolean':
            payloadData[field.key] = Boolean(rawValue);
            break;
          case 'enum': {
            if (field.settings?.multiple) {
              payloadData[field.key] = Array.isArray(rawValue) ? rawValue : ensureArray(rawValue);
            } else {
              payloadData[field.key] = Array.isArray(rawValue) ? rawValue[0] : rawValue;
            }
            break;
          }
          case 'ref':
          case 'media': {
            if (field.settings?.multiple) {
              payloadData[field.key] = Array.isArray(rawValue)
                ? rawValue
                : parseCommaSeparated(rawValue);
            } else {
              payloadData[field.key] = Array.isArray(rawValue) ? rawValue[0] : rawValue;
            }
            break;
          }
          case 'geojson': {
            if (typeof rawValue === 'string') {
              payloadData[field.key] = JSON.parse(rawValue);
            } else {
              payloadData[field.key] = rawValue;
            }
            break;
          }
          default:
            payloadData[field.key] = rawValue;
        }
      });

      const payload = {
        data: payloadData,
        status,
        slug: slug || undefined,
        relations
      };

      setError(null);
      onSubmit?.(payload);
    } catch (err) {
      setError(err.message || 'Kayıt gönderilirken hata oluştu');
    }
  };

  const renderFieldInput = (field) => {
    const value = data[field.key];

    switch (field.type) {
      case 'text':
        return (
          <textarea
            rows={4}
            value={value ?? ''}
            onChange={(event) => handleFieldUpdate(field.key, event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        );
      case 'number':
        return (
          <input
            type="number"
            value={value ?? ''}
            onChange={(event) => handleFieldUpdate(field.key, event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        );
      case 'boolean':
        return (
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => handleFieldUpdate(field.key, event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        );
      case 'date':
        return (
          <input
            type="date"
            value={formatDateForInput(value)}
            onChange={(event) => handleFieldUpdate(field.key, event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        );
      case 'datetime':
        return (
          <input
            type="datetime-local"
            value={formatDateTimeForInput(value)}
            onChange={(event) => handleFieldUpdate(field.key, event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        );
      case 'enum':
        if (field.settings?.multiple) {
          const selected = Array.isArray(value) ? value : ensureArray(value) || [];
          return (
            <select
              multiple
              value={selected}
              onChange={(event) => {
                const nextValues = Array.from(event.target.selectedOptions).map((option) => option.value);
                handleFieldUpdate(field.key, nextValues);
              }}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {(field.options || []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label?.tr || option.label?.en || option.value}
                </option>
              ))}
            </select>
          );
        }
        return (
          <select
            value={value ?? ''}
            onChange={(event) => handleFieldUpdate(field.key, event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="">Seçiniz</option>
            {(field.options || []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label?.tr || option.label?.en || option.value}
              </option>
            ))}
          </select>
        );
      case 'ref':
      case 'media':
        if (field.settings?.multiple) {
          const listValue = Array.isArray(value) ? value.join(', ') : value || '';
          return (
            <input
              type="text"
              value={listValue}
              onChange={(event) => handleFieldUpdate(field.key, event.target.value)}
              placeholder="Her ID arasında virgül kullanın"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          );
        }
        return (
          <input
            type="text"
            value={Array.isArray(value) ? value[0] ?? '' : value ?? ''}
            onChange={(event) => handleFieldUpdate(field.key, event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        );
      case 'geojson':
        return (
          <textarea
            rows={4}
            value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)}
            onChange={(event) => handleFieldUpdate(field.key, event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        );
      default:
        return (
          <input
            type="text"
            value={value ?? ''}
            onChange={(event) => handleFieldUpdate(field.key, event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        );
    }
  };

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={isSubmitting ? () => {} : onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-900/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white p-6 text-left shadow-xl transition-all">
                <div className="flex items-start justify-between">
                  <div>
                    <Dialog.Title className="text-lg font-semibold text-gray-900">
                      {entry ? 'Kaydı Düzenle' : 'Yeni Kayıt Oluştur'}
                    </Dialog.Title>
                    <p className="mt-1 text-sm text-gray-500">
                      {collection?.name?.tr || collection?.key}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="rounded-md text-gray-400 hover:text-gray-600 focus:outline-none"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Slug</label>
                      <input
                        type="text"
                        value={slug}
                        onChange={(event) => setSlug(event.target.value)}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        placeholder="ornek-slug"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Durum</label>
                      <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {(collection?.fields || []).map((field) => (
                      <div key={field.key} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-sm font-semibold text-gray-900">{getFieldLabel(field)}</label>
                            <p className="text-xs text-gray-500">{field.key} · {field.type}</p>
                          </div>
                          {field.required && <span className="text-xs font-semibold text-red-500">Zorunlu</span>}
                        </div>
                        <div className="mt-3">
                          {renderFieldInput(field)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">İlişkiler (JSON)</label>
                    <textarea
                      rows={4}
                      value={relationsText}
                      onChange={(event) => setRelationsText(event.target.value)}
                      placeholder={`{
  "media": ["mediaId"]
}`}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      İsteğe bağlı olarak içerik, medya veya diğer koleksiyon kayıtlarını burada ilişkilendirebilirsiniz.
                    </p>
                  </div>

                  {error && (
                    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isSubmitting}
                      className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      İptal
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-400"
                    >
                      {isSubmitting && (
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                      )}
                      {entry ? 'Kaydı Güncelle' : 'Kaydı Oluştur'}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

export default CollectionEntryModal;
