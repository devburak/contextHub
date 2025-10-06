import { useState, Fragment } from 'react';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Switch } from '@headlessui/react';

export default function FieldInspector({ field, selectedLanguage = 'tr', onFieldUpdate, onClose }) {
  const [activeTab, setActiveTab] = useState('basic'); // basic, validation, advanced

  // Language labels
  const langLabel = selectedLanguage === 'tr' ? 'Türkçe' : 'English';

  // Handle text field changes
  const handleChange = (path, value) => {
    const keys = path.split('.');
    if (keys.length === 1) {
      onFieldUpdate({ [keys[0]]: value });
    } else if (keys.length === 2) {
      onFieldUpdate({
        [keys[0]]: {
          ...field[keys[0]],
          [keys[1]]: value,
        },
      });
    } else if (keys.length === 3) {
      onFieldUpdate({
        [keys[0]]: {
          ...field[keys[0]],
          [keys[1]]: {
            ...field[keys[0]]?.[keys[1]],
            [keys[2]]: value,
          },
        },
      });
    }
  };

  // Handle option changes (for select, radio, checkbox)
  const handleOptionChange = (index, lang, value) => {
    const newOptions = [...(field.options || [])];
    newOptions[index] = {
      ...newOptions[index],
      label: {
        ...newOptions[index].label,
        [lang]: value,
      },
    };
    onFieldUpdate({ options: newOptions });
  };

  const handleOptionValueChange = (index, value) => {
    const newOptions = [...(field.options || [])];
    newOptions[index] = {
      ...newOptions[index],
      value: value,
    };
    onFieldUpdate({ options: newOptions });
  };

  const addOption = () => {
    const newOptions = [
      ...(field.options || []),
      {
        label: { tr: `Seçenek ${(field.options?.length || 0) + 1}`, en: `Option ${(field.options?.length || 0) + 1}` },
        value: `option${(field.options?.length || 0) + 1}`,
      },
    ];
    onFieldUpdate({ options: newOptions });
  };

  const removeOption = (index) => {
    const newOptions = field.options.filter((_, i) => i !== index);
    onFieldUpdate({ options: newOptions });
  };

  const hasOptions = ['select', 'radio', 'checkbox'].includes(field.type);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Alan Özellikleri</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('basic')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'basic'
              ? 'border-b-2 border-indigo-500 text-indigo-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Temel
        </button>
        <button
          onClick={() => setActiveTab('validation')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'validation'
              ? 'border-b-2 border-indigo-500 text-indigo-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Doğrulama
        </button>
        <button
          onClick={() => setActiveTab('advanced')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'advanced'
              ? 'border-b-2 border-indigo-500 text-indigo-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Gelişmiş
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'basic' && (
          <>
            {/* Field Type */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Alan Türü
              </label>
              <input
                type="text"
                value={field.type}
                disabled
                className="block w-full rounded-md border-gray-300 bg-gray-50 text-sm"
              />
            </div>

            {/* Field Name */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Alan Adı (name) *
              </label>
              <input
                type="text"
                value={field.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              />
            </div>

            {/* Label */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Etiket ({langLabel}) *
              </label>
              <input
                type="text"
                value={field.label[selectedLanguage] || ''}
                onChange={(e) => handleChange(`label.${selectedLanguage}`, e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              />
            </div>

            {/* Placeholder */}
            {!['checkbox', 'radio', 'section'].includes(field.type) && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Placeholder ({langLabel})
                </label>
                <input
                  type="text"
                  value={field.placeholder?.[selectedLanguage] || ''}
                  onChange={(e) => handleChange(`placeholder.${selectedLanguage}`, e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                />
              </div>
            )}

            {/* Help Text */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Yardım Metni ({langLabel})
              </label>
              <textarea
                value={field.helpText?.[selectedLanguage] || ''}
                onChange={(e) => handleChange(`helpText.${selectedLanguage}`, e.target.value)}
                rows={2}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              />
            </div>

            {/* Required */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">
                Zorunlu Alan
              </label>
              <Switch
                checked={field.required || false}
                onChange={(checked) => onFieldUpdate({ required: checked })}
                className={`${
                  field.required ? 'bg-indigo-600' : 'bg-gray-200'
                } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
              >
                <span
                  className={`${
                    field.required ? 'translate-x-6' : 'translate-x-1'
                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </Switch>
            </div>

            {/* Options (for select, radio, checkbox) */}
            {hasOptions && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-gray-700">
                    Seçenekler
                  </label>
                  <button
                    onClick={addOption}
                    className="inline-flex items-center px-2 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    <PlusIcon className="h-3 w-3 mr-1" />
                    Ekle
                  </button>
                </div>
                <div className="space-y-3">
                  {(field.options || []).map((option, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-700">
                          Seçenek {index + 1}
                        </span>
                        {field.options.length > 1 && (
                          <button
                            onClick={() => removeOption(index)}
                            className="text-red-400 hover:text-red-600"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={option.label[selectedLanguage] || ''}
                        onChange={(e) => handleOptionChange(index, selectedLanguage, e.target.value)}
                        placeholder={`${langLabel} Etiket`}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-xs mb-2"
                      />
                      <input
                        type="text"
                        value={option.value}
                        onChange={(e) => handleOptionValueChange(index, e.target.value)}
                        placeholder="Değer (value)"
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'validation' && (
          <>
            {/* Min Length */}
            {['text', 'textarea', 'email', 'phone'].includes(field.type) && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Minimum Uzunluk
                </label>
                <input
                  type="number"
                  value={field.validation?.minLength || ''}
                  onChange={(e) => handleChange('validation.minLength', parseInt(e.target.value) || undefined)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                />
              </div>
            )}

            {/* Max Length */}
            {['text', 'textarea', 'email', 'phone'].includes(field.type) && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Maksimum Uzunluk
                </label>
                <input
                  type="number"
                  value={field.validation?.maxLength || ''}
                  onChange={(e) => handleChange('validation.maxLength', parseInt(e.target.value) || undefined)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                />
              </div>
            )}

            {/* Min/Max Value (for number) */}
            {field.type === 'number' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Minimum Değer
                  </label>
                  <input
                    type="number"
                    value={field.validation?.min || ''}
                    onChange={(e) => handleChange('validation.min', parseFloat(e.target.value) || undefined)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Maksimum Değer
                  </label>
                  <input
                    type="number"
                    value={field.validation?.max || ''}
                    onChange={(e) => handleChange('validation.max', parseFloat(e.target.value) || undefined)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </>
            )}

            {/* Pattern */}
            {['text', 'email', 'phone'].includes(field.type) && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Regex Deseni
                </label>
                <input
                  type="text"
                  value={field.validation?.pattern || ''}
                  onChange={(e) => handleChange('validation.pattern', e.target.value)}
                  placeholder="^[A-Za-z]+$"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm font-mono"
                />
                <p className="mt-1 text-xs text-gray-500">
                  JavaScript regex deseni
                </p>
              </div>
            )}

            {/* Custom Error Message */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Özel Hata Mesajı ({langLabel})
              </label>
              <input
                type="text"
                value={field.validation?.errorMessage?.[selectedLanguage] || ''}
                onChange={(e) => handleChange(`validation.errorMessage.${selectedLanguage}`, e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              />
            </div>
          </>
        )}

        {activeTab === 'advanced' && (
          <>
            {/* Default Value */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Varsayılan Değer
              </label>
              <input
                type="text"
                value={field.defaultValue || ''}
                onChange={(e) => handleChange('defaultValue', e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              />
            </div>

            {/* CSS Class */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                CSS Sınıfı
              </label>
              <input
                type="text"
                value={field.className || ''}
                onChange={(e) => handleChange('className', e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              />
            </div>

            {/* Width */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Genişlik
              </label>
              <select
                value={field.width || 'full'}
                onChange={(e) => handleChange('width', e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              >
                <option value="full">Tam Genişlik</option>
                <option value="half">Yarım</option>
                <option value="third">Üçte Bir</option>
                <option value="quarter">Çeyrek</option>
              </select>
            </div>

            {/* Read Only */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">
                Salt Okunur
              </label>
              <Switch
                checked={field.readOnly || false}
                onChange={(checked) => onFieldUpdate({ readOnly: checked })}
                className={`${
                  field.readOnly ? 'bg-indigo-600' : 'bg-gray-200'
                } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
              >
                <span
                  className={`${
                    field.readOnly ? 'translate-x-6' : 'translate-x-1'
                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </Switch>
            </div>

            {/* Disabled */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">
                Devre Dışı
              </label>
              <Switch
                checked={field.disabled || false}
                onChange={(checked) => onFieldUpdate({ disabled: checked })}
                className={`${
                  field.disabled ? 'bg-indigo-600' : 'bg-gray-200'
                } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
              >
                <span
                  className={`${
                    field.disabled ? 'translate-x-6' : 'translate-x-1'
                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </Switch>
            </div>

            {/* Hidden */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">
                Gizli
              </label>
              <Switch
                checked={field.hidden || false}
                onChange={(checked) => onFieldUpdate({ hidden: checked })}
                className={`${
                  field.hidden ? 'bg-indigo-600' : 'bg-gray-200'
                } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
              >
                <span
                  className={`${
                    field.hidden ? 'translate-x-6' : 'translate-x-1'
                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </Switch>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
