import { useEffect, useMemo, useState } from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

const FIELD_TYPES = [
  { value: 'string', label: 'Metin' },
  { value: 'text', label: 'Uzun Metin' },
  { value: 'number', label: 'Sayı' },
  { value: 'boolean', label: 'Mantıksal' },
  { value: 'date', label: 'Tarih' },
  { value: 'datetime', label: 'Tarih & Saat' },
  { value: 'enum', label: 'Seçim (Enum)' },
  { value: 'ref', label: 'Referans' },
  { value: 'media', label: 'Medya' },
  { value: 'geojson', label: 'Coğrafi (GeoJSON)' }
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Aktif' },
  { value: 'archived', label: 'Arşivlenmiş' }
];

const createClientId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const DEFAULT_FIELD = () => ({
  clientId: createClientId(),
  key: '',
  type: 'string',
  labelTr: '',
  labelEn: '',
  descriptionTr: '',
  descriptionEn: '',
  required: false,
  unique: false,
  indexed: false,
  refTarget: '',
  enumOptions: '',
  multiple: false
});

const slugifyKey = (value = '') => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/-{2,}/g, '-');

const buildLocaleMap = (tr, en) => {
  const map = {};
  if (tr) map.tr = tr;
  if (en) map.en = en;
  return Object.keys(map).length ? map : undefined;
};

function parseEnumOptions(options = []) {
  if (!Array.isArray(options) || !options.length) {
    return '';
  }

  return options
    .map((option) => {
      const labelTr = option.label?.tr || option.label?.tr_TR || '';
      const labelEn = option.label?.en || option.label?.en_US || '';
      const labels = [];
      if (labelTr) labels.push(`tr:${labelTr}`);
      if (labelEn) labels.push(`en:${labelEn}`);
      const suffix = labels.length ? ` | ${labels.join(', ')}` : '';
      return `${option.value}${suffix}`;
    })
    .join('\n');
}

function buildEnumOptions(input = '') {
  if (!input) return undefined;

  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawValue, rawLabels] = line.split('|').map((part) => part.trim());
      const value = slugifyKey(rawValue);
      const labelMap = {};
      if (rawLabels) {
        rawLabels.split(',').forEach((segment) => {
          const [locale, localeLabel] = segment.split(':').map((part) => part.trim());
          if (locale && localeLabel) {
            labelMap[locale] = localeLabel;
          }
        });
      }
      return {
        value,
        label: Object.keys(labelMap).length ? labelMap : undefined
      };
    });
}

function mapFieldsFromCollection(collection) {
  if (!collection?.fields) {
    return [DEFAULT_FIELD()];
  }

  const mapped = collection.fields.map((field) => ({
    clientId: createClientId(),
    key: field.key || '',
    type: field.type || 'string',
    labelTr: field.label?.tr || field.label?.tr_TR || '',
    labelEn: field.label?.en || field.label?.en_US || '',
    descriptionTr: field.description?.tr || field.description?.tr_TR || '',
    descriptionEn: field.description?.en || field.description?.en_US || '',
    required: Boolean(field.required),
    unique: Boolean(field.unique),
    indexed: Boolean(field.indexed),
    refTarget: field.ref || '',
    enumOptions: field.type === 'enum' ? parseEnumOptions(field.options) : '',
    multiple: Boolean(field.settings?.multiple)
  }));

  return mapped.length ? mapped : [DEFAULT_FIELD()];
}

export function CollectionDefinitionForm({
  initialValues,
  mode = 'create',
  isSubmitting = false,
  submitLabel,
  onSubmit,
  onCancel
}) {
  const [key, setKey] = useState(initialValues?.key || '');
  const [nameTr, setNameTr] = useState(initialValues?.name?.tr || '');
  const [nameEn, setNameEn] = useState(initialValues?.name?.en || '');
  const [descriptionTr, setDescriptionTr] = useState(initialValues?.description?.tr || '');
  const [descriptionEn, setDescriptionEn] = useState(initialValues?.description?.en || '');
  const [slugField, setSlugField] = useState(initialValues?.settings?.slugField || '');
  const [defaultSortKey, setDefaultSortKey] = useState(initialValues?.settings?.defaultSort?.key || '');
  const [defaultSortDir, setDefaultSortDir] = useState(initialValues?.settings?.defaultSort?.dir || 'asc');
  const [enableVersioning, setEnableVersioning] = useState(Boolean(initialValues?.settings?.enableVersioning));
  const [allowDrafts, setAllowDrafts] = useState(initialValues?.settings?.allowDrafts ?? true);
  const [previewUrlTemplate, setPreviewUrlTemplate] = useState(initialValues?.settings?.previewUrlTemplate || '');
  const [status, setStatus] = useState(initialValues?.status || 'active');
  const [fields, setFields] = useState(() => mapFieldsFromCollection(initialValues));
  const [selectedLanguage, setSelectedLanguage] = useState('tr');

  useEffect(() => {
    if (initialValues) {
      setFields(mapFieldsFromCollection(initialValues));
    }
  }, [initialValues]);


  const selectableSlugFields = useMemo(() => fields.map((field) => field.key).filter(Boolean), [fields]);

  const handleAddField = () => {
    setFields((prev) => [...prev, DEFAULT_FIELD()]);
  };

  const handleRemoveField = (clientId) => {
    setFields((prev) => (prev.length > 1 ? prev.filter((field) => field.clientId !== clientId) : prev));
  };

  const handleFieldChange = (clientId, patch) => {
    setFields((prev) => prev.map((field) => (field.clientId === clientId ? { ...field, ...patch } : field)));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const normalizedKey = mode === 'create' ? slugifyKey(key) : key;

    const payload = {
      key: normalizedKey,
      name: buildLocaleMap(nameTr, nameEn),
      description: buildLocaleMap(descriptionTr, descriptionEn),
      status,
      fields: fields
        .filter((field) => field.key)
        .map((field) => ({
          key: field.key.trim(),
          type: field.type,
          label: buildLocaleMap(field.labelTr, field.labelEn),
          description: buildLocaleMap(field.descriptionTr, field.descriptionEn),
          required: field.required,
          unique: field.unique,
          indexed: field.indexed,
          ref: field.type === 'ref' ? field.refTarget.trim() || undefined : undefined,
          options: field.type === 'enum' ? buildEnumOptions(field.enumOptions) : undefined,
          settings: field.type === 'enum' || field.type === 'ref' || field.type === 'media'
            ? { multiple: field.multiple }
            : undefined
        })),
      settings: {
        slugField: slugField || undefined,
        defaultSort: defaultSortKey ? { key: defaultSortKey, dir: defaultSortDir } : undefined,
        enableVersioning,
        allowDrafts,
        previewUrlTemplate: previewUrlTemplate || undefined
      }
    };

    if (mode === 'edit') {
      delete payload.key;
    }

    onSubmit?.(payload);
  };

  const handleKeyBlur = () => {
    if (mode === 'create') {
      setKey((prev) => slugifyKey(prev));
    }
  };

  const renderFieldCard = (field) => {
    const isTurkish = selectedLanguage === 'tr';
    const labelKey = isTurkish ? 'labelTr' : 'labelEn';
    const descriptionKey = isTurkish ? 'descriptionTr' : 'descriptionEn';
    const labelPlaceholder = isTurkish ? 'Örn. Başkan' : 'e.g. Chairperson';
    const descriptionPlaceholder = isTurkish ? 'Örn. alan açıklaması' : 'Field description';

    return (
      <div key={field.clientId} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Alan</h4>
          <p className="text-xs text-gray-500">Alan anahtarı küçük harf ve tire ile olmalı.</p>
        </div>
        <button
          type="button"
          onClick={() => handleRemoveField(field.clientId)}
          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
        >
          <TrashIcon className="h-4 w-4" />
          Sil
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">Alan Anahtarı</label>
          <input
            type="text"
            value={field.key}
            onChange={(event) => handleFieldChange(field.clientId, { key: event.target.value })}
            onBlur={(event) => handleFieldChange(field.clientId, { key: slugifyKey(event.target.value) })}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="ornegin-donem"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Tip</label>
          <select
            value={field.type}
            onChange={(event) => {
              const nextType = event.target.value;
              const patch = { type: nextType };
              if (nextType !== 'enum') {
                patch.enumOptions = '';
              }
              if (nextType !== 'ref') {
                patch.refTarget = '';
              }
              if (!['enum', 'ref', 'media'].includes(nextType)) {
                patch.multiple = false;
              }
              handleFieldChange(field.clientId, patch);
            }}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {FIELD_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700">{`Başlık (${isTurkish ? 'TR' : 'EN'})`}</label>
        <input
          type="text"
          value={field[labelKey] || ''}
          onChange={(event) => handleFieldChange(field.clientId, { [labelKey]: event.target.value })}
          placeholder={labelPlaceholder}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700">{`Açıklama (${isTurkish ? 'TR' : 'EN'})`}</label>
        <textarea
          rows={2}
          value={field[descriptionKey] || ''}
          onChange={(event) => handleFieldChange(field.clientId, { [descriptionKey]: event.target.value })}
          placeholder={descriptionPlaceholder}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {field.type === 'ref' && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">Hedef Koleksiyon (key)</label>
          <input
            type="text"
            value={field.refTarget}
            onChange={(event) => handleFieldChange(field.clientId, { refTarget: slugifyKey(event.target.value) })}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="ornek: donem"
          />
        </div>
      )}

      {field.type === 'enum' && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            Enum Seçenekleri
          </label>
          <p className="mt-1 text-xs text-gray-500">
            Her satıra bir değer yazın. İsteğe bağlı olarak "| tr:Başlık, en:Title" formatında etiket ekleyebilirsiniz.
          </p>
          <textarea
            rows={4}
            value={field.enumOptions}
            onChange={(event) => handleFieldChange(field.clientId, { enumOptions: event.target.value })}
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder={`ornegin-baskan | tr:Başkan\nornek-uye | tr:Üye, en:Member`}
          />
        </div>
      )}

      {['enum', 'ref', 'media'].includes(field.type) && (
        <div className="mt-4 flex items-center gap-2">
          <input
            id={`multiple-${field.clientId}`}
            type="checkbox"
            checked={field.multiple}
            onChange={(event) => handleFieldChange(field.clientId, { multiple: event.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor={`multiple-${field.clientId}`} className="text-sm font-medium text-gray-700">
            Birden fazla değer desteklensin
          </label>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(event) => handleFieldChange(field.clientId, { required: event.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Zorunlu Alan
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={field.unique}
            onChange={(event) => handleFieldChange(field.clientId, { unique: event.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Tekil (unique)
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={field.indexed}
            onChange={(event) => handleFieldChange(field.clientId, { indexed: event.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Sorgulanabilir (index)
        </label>
      </div>
    </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">Koleksiyon Anahtarı</label>
          <input
            type="text"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            onBlur={handleKeyBlur}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100"
            placeholder="ornek-koleksiyon"
            disabled={mode === 'edit'}
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

      <div className="mb-4 flex justify-end">
        <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
          <button
            type="button"
            onClick={() => setSelectedLanguage('tr')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${selectedLanguage === 'tr' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            🇹🇷 TR
          </button>
          <button
            type="button"
            onClick={() => setSelectedLanguage('en')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${selectedLanguage === 'en' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            🇬🇧 EN
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            {selectedLanguage === 'tr' ? 'İsim (TR)' : 'İsim (EN)'}
          </label>
          <input
            type="text"
            value={selectedLanguage === 'tr' ? nameTr : nameEn}
            onChange={(event) => {
              const value = event.target.value;
              if (selectedLanguage === 'tr') {
                setNameTr(value);
              } else {
                setNameEn(value);
              }
            }}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder={selectedLanguage === 'tr' ? 'Yönetim Kurulu Üyesi' : 'Board Member'}
            required={selectedLanguage === 'tr'}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            {selectedLanguage === 'tr' ? 'Açıklama (TR)' : 'Açıklama (EN)'}
          </label>
          <textarea
            rows={2}
            value={selectedLanguage === 'tr' ? descriptionTr : descriptionEn}
            onChange={(event) => {
              const value = event.target.value;
              if (selectedLanguage === 'tr') {
                setDescriptionTr(value);
              } else {
                setDescriptionEn(value);
              }
            }}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder={selectedLanguage === 'tr' ? 'Koleksiyon kısa açıklaması' : 'Collection summary'}
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-900">Koleksiyon Ayarları</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Slug Alanı</label>
            <select
              value={slugField}
              onChange={(event) => setSlugField(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">Belirtilmemiş</option>
              {selectableSlugFields.map((fieldKey) => (
                <option key={fieldKey} value={fieldKey}>{fieldKey}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Varsayılan Sıralama</label>
            <div className="mt-1 flex gap-2">
              <select
                value={defaultSortKey}
                onChange={(event) => setDefaultSortKey(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">Zaman (sondan → başa)</option>
                <option value="title">Başlık</option>
                <option value="date">Tarih</option>
                {selectableSlugFields.map((fieldKey) => (
                  <option key={fieldKey} value={fieldKey}>{fieldKey}</option>
                ))}
              </select>
              <select
                value={defaultSortDir}
                onChange={(event) => setDefaultSortDir(event.target.value)}
                className="w-36 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="asc">Artan</option>
                <option value="desc">Azalan</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="enable-versioning"
              type="checkbox"
              checked={enableVersioning}
              onChange={(event) => setEnableVersioning(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="enable-versioning" className="text-sm font-medium text-gray-700">
              Versiyonlama açılsın
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="allow-drafts"
              type="checkbox"
              checked={allowDrafts}
              onChange={(event) => setAllowDrafts(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="allow-drafts" className="text-sm font-medium text-gray-700">
              Taslak durumuna izin ver
            </label>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Önizleme URL Şablonu</label>
            <input
              type="text"
              value={previewUrlTemplate}
              onChange={(event) => setPreviewUrlTemplate(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="https://site.com/{slug}"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Alanlar</h3>
            <p className="text-xs text-gray-500">Alan tiplerine göre giriş formları ve doğrulamalar otomatik oluşacak.</p>
          </div>
          <button
            type="button"
            onClick={handleAddField}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
          >
            <PlusIcon className="h-4 w-4" />
            Alan Ekle
          </button>
        </div>

        <div className="space-y-4">
          {fields.map(renderFieldCard)}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Vazgeç
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-400"
        >
          {isSubmitting && (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
          )}
          {submitLabel || (mode === 'create' ? 'Koleksiyon Oluştur' : 'Koleksiyonu Güncelle')}
        </button>
      </div>
    </form>
  );
}

export default CollectionDefinitionForm;
