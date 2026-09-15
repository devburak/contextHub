import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import CollectionKeyAutocomplete from './CollectionKeyAutocomplete.jsx';

// `value` alanları API'ye giden tip tanımlayıcılarıdır ve çevrilmez;
// yalnızca ekranda gösterilen etiketler çeviri anahtarıyla tutulur.
const FIELD_TYPES = [
  { value: 'string', labelKey: 'collection.type_string' },
  { value: 'text', labelKey: 'collection.type_text' },
  { value: 'richText', labelKey: 'collection.type_rich_text' },
  { value: 'number', labelKey: 'collection.type_number' },
  { value: 'boolean', labelKey: 'collection.type_boolean' },
  { value: 'date', labelKey: 'collection.type_date' },
  { value: 'datetime', labelKey: 'collection.type_datetime' },
  { value: 'enum', labelKey: 'collection.type_enum' },
  { value: 'ref', labelKey: 'collection.type_ref' },
  { value: 'media', labelKey: 'collection.type_media' },
  { value: 'geojson', labelKey: 'collection.type_geojson' }
];

const STATUS_OPTIONS = [
  { value: 'active', labelKey: 'status.active' },
  { value: 'archived', labelKey: 'status.archived' }
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
  const { t } = useTranslation();
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


  // richText alanları slug / sıralama için anlamlı olmadığından bu listelerden hariç tutulur.
  const selectableSlugFields = useMemo(
    () => fields.filter((field) => field.type !== 'richText').map((field) => field.key).filter(Boolean),
    [fields]
  );

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
    // TR/EN ayrımı düzenlenen *içerik* dilini gösterir; arayüz dilinden bağımsızdır.
    const isTurkish = selectedLanguage === 'tr';
    const localeCode = isTurkish ? 'TR' : 'EN';
    const labelKey = isTurkish ? 'labelTr' : 'labelEn';
    const descriptionKey = isTurkish ? 'descriptionTr' : 'descriptionEn';
    const labelPlaceholder = t(isTurkish ? 'collection.field_label_placeholder_tr' : 'collection.field_label_placeholder_en');
    const descriptionPlaceholder = t(isTurkish ? 'collection.field_description_placeholder_tr' : 'collection.field_description_placeholder_en');

    return (
      <div key={field.clientId} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">{t('collection.field_card_title')}</h4>
          <p className="text-xs text-gray-500">{t('collection.field_key_hint')}</p>
        </div>
        <button
          type="button"
          onClick={() => handleRemoveField(field.clientId)}
          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
        >
          <TrashIcon className="h-4 w-4" />
          {t('common.delete')}
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('collection.field_key_label')}</label>
          <input
            type="text"
            value={field.key}
            onChange={(event) => handleFieldChange(field.clientId, { key: event.target.value })}
            onBlur={(event) => handleFieldChange(field.clientId, { key: slugifyKey(event.target.value) })}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder={t('collection.field_key_placeholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('common.type')}</label>
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
              if (nextType === 'richText') {
                // richText için unique/indexed anlamsız; bayrakları temizle.
                patch.unique = false;
                patch.indexed = false;
              }
              handleFieldChange(field.clientId, patch);
            }}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {FIELD_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700">{t('collection.field_label_with_locale', { locale: localeCode })}</label>
        <input
          type="text"
          value={field[labelKey] || ''}
          onChange={(event) => handleFieldChange(field.clientId, { [labelKey]: event.target.value })}
          placeholder={labelPlaceholder}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700">{t('collection.description_with_locale', { locale: localeCode })}</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('collection.ref_target_label')}
          </label>
          <CollectionKeyAutocomplete
            value={field.refTarget}
            onChange={(newValue) => handleFieldChange(field.clientId, { refTarget: slugifyKey(newValue) })}
            placeholder={t('collection.ref_target_placeholder')}
            excludeKey={key}
          />
        </div>
      )}

      {field.type === 'enum' && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700">
            {t('collection.enum_options_label')}
          </label>
          <p className="mt-1 text-xs text-gray-500">
            {t('collection.enum_options_hint')}
          </p>
          <textarea
            rows={4}
            value={field.enumOptions}
            onChange={(event) => handleFieldChange(field.clientId, { enumOptions: event.target.value })}
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder={t('collection.enum_options_placeholder')}
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
            {t('collection.field_multiple')}
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
          {t('collection.field_required')}
        </label>
        {field.type !== 'richText' && (
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={field.unique}
              onChange={(event) => handleFieldChange(field.clientId, { unique: event.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {t('collection.field_unique')}
          </label>
        )}
        {field.type !== 'richText' && (
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={field.indexed}
              onChange={(event) => handleFieldChange(field.clientId, { indexed: event.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {t('collection.field_indexed')}
          </label>
        )}
      </div>
    </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('collection.key_label')}</label>
          <input
            type="text"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            onBlur={handleKeyBlur}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100"
            placeholder={t('collection.key_placeholder')}
            disabled={mode === 'edit'}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">{t('common.status')}</label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
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
            {t('collection.name_with_locale', { locale: selectedLanguage === 'tr' ? 'TR' : 'EN' })}
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
            placeholder={t(selectedLanguage === 'tr' ? 'collection.name_placeholder_tr' : 'collection.name_placeholder_en')}
            required={selectedLanguage === 'tr'}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            {t('collection.description_with_locale', { locale: selectedLanguage === 'tr' ? 'TR' : 'EN' })}
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
            placeholder={t(selectedLanguage === 'tr' ? 'collection.description_placeholder_tr' : 'collection.description_placeholder_en')}
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-900">{t('collection.settings_title')}</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('collection.slug_field_label')}</label>
            <select
              value={slugField}
              onChange={(event) => setSlugField(event.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">{t('collection.slug_field_none')}</option>
              {selectableSlugFields.map((fieldKey) => (
                <option key={fieldKey} value={fieldKey}>{fieldKey}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">{t('collection.default_sort_label')}</label>
            <div className="mt-1 flex gap-2">
              <select
                value={defaultSortKey}
                onChange={(event) => setDefaultSortKey(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">{t('collection.sort_recent_first')}</option>
                <option value="title">{t('common.title')}</option>
                <option value="date">{t('common.date')}</option>
                {selectableSlugFields.map((fieldKey) => (
                  <option key={fieldKey} value={fieldKey}>{fieldKey}</option>
                ))}
              </select>
              <select
                value={defaultSortDir}
                onChange={(event) => setDefaultSortDir(event.target.value)}
                className="w-36 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="asc">{t('collection.sort_asc')}</option>
                <option value="desc">{t('collection.sort_desc')}</option>
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
              {t('collection.enable_versioning')}
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
              {t('collection.allow_drafts')}
            </label>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">{t('collection.preview_url_label')}</label>
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
            <h3 className="text-sm font-semibold text-gray-900">{t('collection.fields_title')}</h3>
            <p className="text-xs text-gray-500">{t('collection.fields_hint')}</p>
          </div>
          <button
            type="button"
            onClick={handleAddField}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
          >
            <PlusIcon className="h-4 w-4" />
            {t('collection.add_field')}
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
            {t('common.cancel')}
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
          {submitLabel || t(mode === 'create' ? 'collection.create_submit' : 'collection.update_submit')}
        </button>
      </div>
    </form>
  );
}

export default CollectionDefinitionForm;
