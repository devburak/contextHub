import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import MediaPickerModal from '../../contents/components/MediaPickerModal.jsx';
import ContentPickerModal from '../../contents/components/ContentPickerModal.jsx';
import RefFieldAutocomplete from './RefFieldAutocomplete.jsx';
import RichTextField from './RichTextField.jsx';

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

const getMediaId = (mediaItem) => {
  if (!mediaItem) return null;
  if (typeof mediaItem === 'string') return mediaItem;
  return mediaItem._id || mediaItem.id || null;
};

const getMediaTitle = (mediaItem) => {
  if (!mediaItem || typeof mediaItem === 'string') return null;
  return mediaItem.originalName || mediaItem.fileName || mediaItem.title || mediaItem.altText || null;
};

const getMediaThumbnail = (mediaItem) => {
  if (!mediaItem || typeof mediaItem === 'string') return null;
  return mediaItem.variants?.find((variant) => variant.name === 'thumbnail')?.url || mediaItem.thumbnailUrl || mediaItem.url || null;
};

const sanitizeRelations = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const cleaned = {};

  for (const [key, val] of Object.entries(value)) {
    if (Array.isArray(val)) {
      if (val.length) {
        cleaned[key] = val;
      }
      continue;
    }

    if (val && typeof val === 'object') {
      const nested = sanitizeRelations(val);
      if (Object.keys(nested).length) {
        cleaned[key] = nested;
      }
      continue;
    }

    if (val !== undefined && val !== null && val !== '') {
      cleaned[key] = val;
    }
  }

  return cleaned;
};

const formatRelationsText = (relations) => {
  const normalized = sanitizeRelations(relations);
  return Object.keys(normalized).length ? JSON.stringify(normalized, null, 2) : '';
};

const parseRelationsText = (text) => {
  if (!text || !text.trim()) {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error('İlişkiler alanında geçerli bir JSON kullanmalısın.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('İlişkiler alanı bir JSON nesnesi olmalıdır.');
  }

  return parsed;
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
  const initialRelations = useMemo(() => entry?.relations || {}, [entry]);
  const [data, setData] = useState(initialData);
  const [status, setStatus] = useState(entry?.status || 'draft');
  const [slug, setSlug] = useState(entry?.slug || '');
  const [relations, setRelations] = useState(initialRelations);
  const [relationsText, setRelationsText] = useState(() => formatRelationsText(initialRelations));
  const [relationsParseError, setRelationsParseError] = useState(null);
  const [mediaPickerTarget, setMediaPickerTarget] = useState(null);
  const [selectedMediaById, setSelectedMediaById] = useState({});
  const [isContentPickerOpen, setContentPickerOpen] = useState(false);
  const [error, setError] = useState(null);
  const initialFocusRef = useRef(null);
  const isMediaPickerOpen = Boolean(mediaPickerTarget);

  useEffect(() => {
    if (isOpen) {
      setData(initialData);
      setStatus(entry?.status || 'draft');
      setSlug(entry?.slug || '');
      const nextRelations = entry?.relations || {};
      setRelations(nextRelations);
      setRelationsText(formatRelationsText(nextRelations));
      setRelationsParseError(null);
      setSelectedMediaById({});
      setError(null);
    } else {
      setMediaPickerTarget(null);
      setContentPickerOpen(false);
    }
  }, [isOpen, initialData, entry]);

  const handleFieldUpdate = useCallback((fieldKey, valueOrUpdater) => {
    setData((prev) => ({
      ...prev,
      [fieldKey]: typeof valueOrUpdater === 'function' ? valueOrUpdater(prev[fieldKey]) : valueOrUpdater
    }));
  }, []);

  const applyRelationsUpdate = useCallback((updater) => {
    setRelations((prev) => {
      const base = prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...prev } : {};
      const nextRaw = updater(base);
      const next = sanitizeRelations(nextRaw);
      const formatted = formatRelationsText(next);
      setRelationsText(formatted);
      setRelationsParseError(null);
      return next;
    });
  }, []);

  const mediaIds = ensureArray(relations?.media)?.map((item) => `${item}`) || [];
  const contentIds = ensureArray(relations?.contents)?.map((item) => `${item}`) || [];

  const rememberMediaItems = useCallback((items) => {
    const list = Array.isArray(items) ? items : [items];
    const pairs = list
      .map((item) => [getMediaId(item), item])
      .filter(([id, item]) => id && item && typeof item === 'object');
    if (!pairs.length) return;

    setSelectedMediaById((prev) => {
      const next = { ...prev };
      pairs.forEach(([id, item]) => {
        next[`${id}`] = item;
      });
      return next;
    });
  }, []);

  const addMediaRelations = useCallback(
    (ids) => {
      const nextIds = ensureArray(ids)?.map((item) => `${item}`).filter(Boolean) || [];
      if (!nextIds.length) return;

      applyRelationsUpdate((next) => {
        const current = ensureArray(next.media)?.map((item) => `${item}`) || [];
        next.media = Array.from(new Set([...current, ...nextIds]));
        return next;
      });
    },
    [applyRelationsUpdate]
  );

  const handleMediaSelect = useCallback(
    (mediaItem, event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      const selectedItems = Array.isArray(mediaItem) ? mediaItem : [mediaItem];
      const selectedIds = selectedItems.map(getMediaId).filter(Boolean).map((id) => `${id}`);
      if (!selectedIds.length) return;

      rememberMediaItems(selectedItems);

      if (mediaPickerTarget?.kind === 'field') {
        const previousIds = ensureArray(data[mediaPickerTarget.fieldKey])?.map(getMediaId).filter(Boolean).map((id) => `${id}`) || [];

        handleFieldUpdate(mediaPickerTarget.fieldKey, (currentValue) => {
          if (!mediaPickerTarget.multiple) {
            return selectedIds[0];
          }
          const current = ensureArray(currentValue)?.map((item) => `${item}`) || [];
          return Array.from(new Set([...current, ...selectedIds]));
        });

        applyRelationsUpdate((next) => {
          const current = ensureArray(next.media)?.map((item) => `${item}`) || [];
          const base = mediaPickerTarget.multiple
            ? current
            : current.filter((mediaId) => !previousIds.includes(mediaId));
          next.media = Array.from(new Set([...base, ...selectedIds]));
          return next;
        });
      } else {
        addMediaRelations(selectedIds);
      }

      setTimeout(() => {
        setMediaPickerTarget(null);
      }, 0);
    },
    [addMediaRelations, applyRelationsUpdate, data, handleFieldUpdate, mediaPickerTarget, rememberMediaItems]
  );

  const handleRemoveMedia = useCallback(
    (mediaId) => {
      applyRelationsUpdate((next) => {
        const current = ensureArray(next.media)?.map((item) => `${item}`) || [];
        const filtered = current.filter((item) => item !== `${mediaId}`);
        if (filtered.length) {
          next.media = filtered;
        } else {
          delete next.media;
        }
        return next;
      });
    },
    [applyRelationsUpdate]
  );

  const handleRemoveMediaFieldValue = useCallback(
    (field, mediaId) => {
      handleFieldUpdate(field.key, (currentValue) => {
        if (field.settings?.multiple) {
          const current = ensureArray(currentValue)?.map((item) => `${item}`) || [];
          return current.filter((item) => item !== `${mediaId}`);
        }
        return '';
      });

      handleRemoveMedia(mediaId);
    },
    [handleFieldUpdate, handleRemoveMedia]
  );

  const handleContentSelect = useCallback(
    (contentItem, event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      const contentId = contentItem?._id || contentItem?.id;
      if (!contentId) return;
      applyRelationsUpdate((next) => {
        const current = ensureArray(next.contents)?.map((item) => `${item}`) || [];
        if (current.includes(`${contentId}`)) {
          return next;
        }
        next.contents = [...current, `${contentId}`];
        return next;
      });
      setTimeout(() => {
        setContentPickerOpen(false);
      }, 0);
    },
    [applyRelationsUpdate]
  );

  const handleRemoveContent = useCallback(
    (contentId) => {
      applyRelationsUpdate((next) => {
        const current = ensureArray(next.contents)?.map((item) => `${item}`) || [];
        const filtered = current.filter((item) => item !== `${contentId}`);
        if (filtered.length) {
          next.contents = filtered;
        } else {
          delete next.contents;
        }
        return next;
      });
    },
    [applyRelationsUpdate]
  );

  const handleRelationsTextChange = (event) => {
    setRelationsText(event.target.value);
    if (relationsParseError) {
      setRelationsParseError(null);
    }
  };

  const handleRelationsTextBlur = () => {
    try {
      const parsed = parseRelationsText(relationsText);
      const normalized = sanitizeRelations(parsed);
      setRelations(normalized);
      setRelationsText(formatRelationsText(normalized));
      setRelationsParseError(null);
    } catch (parseError) {
      setRelationsParseError(parseError.message);
    }
  };

  const openMediaPickerForField = (field) => {
    setMediaPickerTarget({
      kind: 'field',
      fieldKey: field.key,
      multiple: Boolean(field.settings?.multiple)
    });
  };

  const openMediaPickerForRelations = () => {
    setMediaPickerTarget({
      kind: 'relations',
      multiple: false
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    try {
      let relationsPayload;
      const hasRelationsText = relationsText && relationsText.trim();
      const hasRelationsState = relations && typeof relations === 'object' && Object.keys(relations).length;
      
      if (hasRelationsText) {
        try {
          const parsed = sanitizeRelations(parseRelationsText(relationsText));
          setRelations(parsed);
          setRelationsParseError(null);
          // Backend'e her zaman tüm ilişki alanlarını gönder
          relationsPayload = {
            contents: parsed.contents || [],
            media: parsed.media || [],
            refs: parsed.refs || []
          };
        } catch (parseError) {
          setRelationsParseError(parseError.message);
          throw parseError;
        }
      } else if (hasRelationsState) {
        const sanitized = sanitizeRelations(relations);
        setRelationsText(formatRelationsText(sanitized));
        setRelationsParseError(null);
        // Backend'e her zaman tüm ilişki alanlarını gönder
        relationsPayload = {
          contents: sanitized.contents || [],
          media: sanitized.media || [],
          refs: sanitized.refs || []
        };
      } else {
        // İlişkiler tamamen boş - tüm alanları boş array olarak gönder
        relationsPayload = {
          contents: [],
          media: [],
          refs: []
        };
        setRelationsParseError(null);
      }

      const payloadData = {};

      (collection?.fields || []).forEach((field) => {
        const rawValue = data[field.key];
        if (rawValue === undefined || rawValue === null || rawValue === '' || (Array.isArray(rawValue) && !rawValue.length)) {
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
          case 'richText': {
            // RichTextField { json, html } nesnesi üretir; olduğu gibi gönderilir.
            if (rawValue && typeof rawValue === 'object' && rawValue.json) {
              payloadData[field.key] = { json: rawValue.json, html: rawValue.html || '' };
            }
            break;
          }
          default:
            payloadData[field.key] = rawValue;
        }
      });

      const mediaFieldRelationIds = new Set(relationsPayload.media || []);
      (collection?.fields || []).forEach((field) => {
        if (field.type !== 'media') return;
        const storedValue = payloadData[field.key];
        ensureArray(storedValue)?.forEach((mediaId) => {
          if (mediaId) {
            mediaFieldRelationIds.add(`${mediaId}`);
          }
        });
      });
      relationsPayload.media = Array.from(mediaFieldRelationIds);

      const payload = {
        data: payloadData,
        status,
        slug: slug || undefined,
        // İlişkileri her zaman gönder - boş olsa bile
        relations: relationsPayload
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
        return (
          <RefFieldAutocomplete
            refTarget={field.ref}
            value={value}
            onChange={(newValue) => handleFieldUpdate(field.key, newValue)}
            multiple={field.settings?.multiple}
            placeholder={`${field.ref || 'Hedef koleksiyon'} içinden seçim yapın`}
          />
        );
      case 'media':
        {
          const selectedIds = ensureArray(value)?.map(getMediaId).filter(Boolean).map((item) => `${item}`) || [];

          return (
            <div className="space-y-3">
              {selectedIds.length ? (
                <ul className="space-y-2">
                  {selectedIds.map((mediaId) => {
                    const mediaItem = selectedMediaById[mediaId];
                    const thumbnail = getMediaThumbnail(mediaItem);
                    const title = getMediaTitle(mediaItem);

                    return (
                      <li
                        key={mediaId}
                        className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          {thumbnail ? (
                            <img
                              src={thumbnail}
                              alt={title || 'Seçili medya'}
                              className="h-10 w-14 flex-none rounded border border-gray-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-14 flex-none items-center justify-center rounded border border-gray-200 bg-gray-50 text-xs text-gray-400">
                              Medya
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900">{title || 'Seçili medya'}</p>
                            <p className="truncate font-mono text-xs text-gray-500">{mediaId}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMediaFieldValue(field, mediaId)}
                          className="inline-flex flex-none items-center rounded-md border border-transparent bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                        >
                          <TrashIcon className="mr-1 h-4 w-4" />
                          Kaldır
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                  Medya kütüphanesinden bir varlık seçilmedi.
                </div>
              )}

              <button
                type="button"
                onClick={() => openMediaPickerForField(field)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {selectedIds.length && !field.settings?.multiple ? 'Medyayı değiştir' : 'Medya seç'}
              </button>
            </div>
          );
        }
      case 'richText':
        return (
          <RichTextField
            key={`${entry?._id || 'new'}-${field.key}`}
            value={value}
            onChange={(nextValue) => handleFieldUpdate(field.key, nextValue)}
            placeholder={`${getFieldLabel(field)} içeriğini yazın…`}
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
    <>
      <MediaPickerModal
        isOpen={isMediaPickerOpen}
        mode="any"
        showUpload={false}
        multiple={Boolean(mediaPickerTarget?.multiple)}
        onClose={() => setMediaPickerTarget(null)}
        onSelect={handleMediaSelect}
      />
      <ContentPickerModal
        isOpen={isContentPickerOpen}
        selectedIds={contentIds}
        onClose={() => setContentPickerOpen(false)}
        onSelect={handleContentSelect}
      />

      <Transition show={isOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={(isSubmitting || isMediaPickerOpen || isContentPickerOpen) ? () => {} : onClose}
          initialFocus={initialFocusRef}
        >
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
                        ref={initialFocusRef}
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

                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">Medya ilişkileri</h3>
                          <p className="text-xs text-gray-500">Seçtiğin medya kimlikleri JSON alanına otomatik eklenir.</p>
                        </div>
                        <button
                          type="button"
                          onClick={openMediaPickerForRelations}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Medya seç
                        </button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {mediaIds.length ? (
                          <ul className="space-y-2">
                            {mediaIds.map((mediaId) => (
                              <li
                                key={mediaId}
                                className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm"
                              >
                                <span className="font-mono text-xs text-gray-700">{mediaId}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMedia(mediaId)}
                                  className="inline-flex items-center rounded-md border border-transparent bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                                >
                                  <TrashIcon className="mr-1 h-4 w-4" />
                                  Kaldır
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-gray-500">Henüz medya ilişkisi eklenmedi.</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">İçerik ilişkileri</h3>
                          <p className="text-xs text-gray-500">İçerik kayıtlarını seçerek JSON alanına ekleyebilirsin.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setContentPickerOpen(true)}
                          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          İçerik seç
                        </button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {contentIds.length ? (
                          <ul className="space-y-2">
                            {contentIds.map((contentId) => (
                              <li
                                key={contentId}
                                className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 text-sm"
                              >
                                <span className="font-mono text-xs text-gray-700">{contentId}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveContent(contentId)}
                                  className="inline-flex items-center rounded-md border border-transparent bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100"
                                >
                                  <TrashIcon className="mr-1 h-4 w-4" />
                                  Kaldır
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-gray-500">Henüz içerik ilişkisi eklenmedi.</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">İlişkiler (JSON)</label>
                      <textarea
                        rows={4}
                        value={relationsText}
                        onChange={handleRelationsTextChange}
                        onBlur={handleRelationsTextBlur}
                        placeholder={`{
  "media": ["mediaId"],
  "contents": ["contentId"],
  "refs": [{ "collectionKey": "diğer", "entryId": "kayitId" }]
}`}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        UI üzerinden yaptığın seçimler bu alana yansır; dilersen farklı ilişkileri JSON olarak elle ekleyebilirsin.
                      </p>
                      {relationsParseError && (
                        <p className="mt-1 text-xs font-medium text-red-600">{relationsParseError}</p>
                      )}
                    </div>
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
    </>
  );
}

export default CollectionEntryModal;
