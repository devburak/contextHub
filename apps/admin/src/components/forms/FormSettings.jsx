import { useState } from 'react';
import { Switch } from '@headlessui/react';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

export default function FormSettings({ settings, formInfo, formFields = [], selectedLanguage = 'tr', onSettingsUpdate, onFormInfoUpdate }) {
  const [activeSection, setActiveSection] = useState('general');

  // Language label
  const langLabel = selectedLanguage === 'tr' ? 'Türkçe' : 'English';

  // Get email fields from form
  const emailFields = formFields.filter(field => field.type === 'email');

  // Add/remove form field email to recipients
  const toggleFieldEmail = (fieldId) => {
    const fieldEmail = `{field:${fieldId}}`;
    const recipients = settings.emailNotifications?.recipients || [];
    
    if (recipients.includes(fieldEmail)) {
      // Remove
      handleSettingChange('emailNotifications.recipients', 
        recipients.filter(r => r !== fieldEmail)
      );
    } else {
      // Add
      handleSettingChange('emailNotifications.recipients', 
        [...recipients, fieldEmail]
      );
    }
  };

  const isFieldEmailSelected = (fieldId) => {
    const fieldEmail = `{field:${fieldId}}`;
    return settings.emailNotifications?.recipients?.includes(fieldEmail) || false;
  };

  const handleSettingChange = (path, value) => {
    const keys = path.split('.');
    if (keys.length === 1) {
      onSettingsUpdate({ [keys[0]]: value });
    } else if (keys.length === 2) {
      // Ensure parent object exists with fallback to empty object
      const parentObj = settings[keys[0]] || {};
      onSettingsUpdate({
        [keys[0]]: {
          ...parentObj,
          [keys[1]]: value,
        },
      });
    } else if (keys.length === 3) {
      // Ensure both parent and nested objects exist with fallbacks
      const parentObj = settings[keys[0]] || {};
      const nestedObj = parentObj[keys[1]] || {};
      onSettingsUpdate({
        [keys[0]]: {
          ...parentObj,
          [keys[1]]: {
            ...nestedObj,
            [keys[2]]: value,
          },
        },
      });
    }
  };

  const addRecipient = () => {
    const recipients = [...(settings.emailNotifications?.recipients || []), ''];
    handleSettingChange('emailNotifications.recipients', recipients);
  };

  const removeRecipient = (index) => {
    const recipients = settings.emailNotifications.recipients.filter((_, i) => i !== index);
    handleSettingChange('emailNotifications.recipients', recipients);
  };

  const updateRecipient = (index, value) => {
    const recipients = [...settings.emailNotifications.recipients];
    recipients[index] = value;
    handleSettingChange('emailNotifications.recipients', recipients);
  };

  const addFileType = () => {
    const fileTypes = [...(settings.allowedFileTypes || []), ''];
    onSettingsUpdate({ allowedFileTypes: fileTypes });
  };

  const removeFileType = (index) => {
    const fileTypes = settings.allowedFileTypes.filter((_, i) => i !== index);
    onSettingsUpdate({ allowedFileTypes: fileTypes });
  };

  const updateFileType = (index, value) => {
    const fileTypes = [...settings.allowedFileTypes];
    fileTypes[index] = value;
    onSettingsUpdate({ allowedFileTypes: fileTypes });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="space-y-8">
        {/* Form Info Section */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Form Bilgileri</h3>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Form Başlığı ({langLabel}) *
              </label>
              <input
                type="text"
                value={formInfo.title?.[selectedLanguage] || ''}
                onChange={(e) => onFormInfoUpdate({ title: { ...formInfo.title, [selectedLanguage]: e.target.value } })}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Açıklama ({langLabel})
              </label>
              <textarea
                value={formInfo.description?.[selectedLanguage] || ''}
                onChange={(e) => onFormInfoUpdate({ description: { ...formInfo.description, [selectedLanguage]: e.target.value } })}
                rows={3}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slug (URL için)
              </label>
              <input
                type="text"
                value={formInfo.slug || ''}
                onChange={(e) => onFormInfoUpdate({ slug: e.target.value })}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="iletisim-formu"
              />
              <p className="mt-1 text-sm text-gray-500">
                Boş bırakılırsa otomatik oluşturulur
              </p>
            </div>
          </div>
        </div>

        {/* Submit Button Settings */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Gönder Butonu</h3>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Buton Metni ({langLabel})
              </label>
              <input
                type="text"
                value={settings.submitButtonText?.[selectedLanguage] || ''}
                onChange={(e) => handleSettingChange(`submitButtonText.${selectedLanguage}`, e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Success Message */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Başarı Mesajı</h3>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Başarı Mesajı ({langLabel})
              </label>
              <textarea
                value={settings.successMessage?.[selectedLanguage] || ''}
                onChange={(e) => handleSettingChange(`successMessage.${selectedLanguage}`, e.target.value)}
                rows={2}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Yönlendirme URL
              </label>
              <input
                type="url"
                value={settings.redirectUrl || ''}
                onChange={(e) => handleSettingChange('redirectUrl', e.target.value)}
                placeholder="https://example.com/tesekkurler"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
              <p className="mt-1 text-sm text-gray-500">
                Form gönderildikten sonra yönlendirilecek sayfa
              </p>
            </div>
          </div>
        </div>

        {/* Form Behavior */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Form Davranışı</h3>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-900">
                  Çoklu Gönderim İzni
                </label>
                <p className="text-sm text-gray-500">
                  Kullanıcılar birden fazla kez gönderebilir
                </p>
              </div>
              <Switch
                checked={settings.allowMultipleSubmissions || false}
                onChange={(checked) => handleSettingChange('allowMultipleSubmissions', checked)}
                className={`${
                  settings.allowMultipleSubmissions ? 'bg-indigo-600' : 'bg-gray-200'
                } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
              >
                <span
                  className={`${
                    settings.allowMultipleSubmissions ? 'translate-x-6' : 'translate-x-1'
                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </Switch>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-900">
                  Kimlik Doğrulama Gerekli
                </label>
                <p className="text-sm text-gray-500">
                  Sadece giriş yapmış kullanıcılar gönderebilir
                </p>
              </div>
              <Switch
                checked={settings.requireAuthentication || false}
                onChange={(checked) => handleSettingChange('requireAuthentication', checked)}
                className={`${
                  settings.requireAuthentication ? 'bg-indigo-600' : 'bg-gray-200'
                } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
              >
                <span
                  className={`${
                    settings.requireAuthentication ? 'translate-x-6' : 'translate-x-1'
                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </Switch>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-900">
                  CAPTCHA Etkin
                </label>
                <p className="text-sm text-gray-500">
                  Spam koruması için CAPTCHA ekle
                </p>
              </div>
              <Switch
                checked={settings.enableCaptcha || false}
                onChange={(checked) => handleSettingChange('enableCaptcha', checked)}
                className={`${
                  settings.enableCaptcha ? 'bg-indigo-600' : 'bg-gray-200'
                } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
              >
                <span
                  className={`${
                    settings.enableCaptcha ? 'translate-x-6' : 'translate-x-1'
                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </Switch>
            </div>
          </div>
        </div>

        {/* File Upload Settings */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Dosya Yükleme Ayarları</h3>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-900">
                  Dosya Yükleme Etkin
                </label>
                <p className="text-sm text-gray-500">
                  Formda dosya yükleme alanlarına izin ver
                </p>
              </div>
              <Switch
                checked={settings.enableFileUpload || false}
                onChange={(checked) => handleSettingChange('enableFileUpload', checked)}
                className={`${
                  settings.enableFileUpload ? 'bg-indigo-600' : 'bg-gray-200'
                } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
              >
                <span
                  className={`${
                    settings.enableFileUpload ? 'translate-x-6' : 'translate-x-1'
                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </Switch>
            </div>

            {settings.enableFileUpload && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Maksimum Dosya Boyutu (MB)
                  </label>
                  <input
                    type="number"
                    value={settings.maxFileSize || 10}
                    onChange={(e) => handleSettingChange('maxFileSize', parseInt(e.target.value))}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      İzin Verilen Dosya Türleri
                    </label>
                    <button
                      onClick={addFileType}
                      className="inline-flex items-center px-2 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      <PlusIcon className="h-3 w-3 mr-1" />
                      Ekle
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(settings.allowedFileTypes || []).map((type, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={type}
                          onChange={(e) => updateFileType(index, e.target.value)}
                          placeholder=".pdf, .jpg, image/*"
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        />
                        <button
                          onClick={() => removeFileType(index)}
                          className="text-red-400 hover:text-red-600"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Boş bırakılırsa tüm dosya türlerine izin verilir
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Email Notifications */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">E-posta Bildirimleri</h3>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-900">
                  E-posta Bildirimleri Etkin
                </label>
                <p className="text-sm text-gray-500">
                  Form gönderildiğinde e-posta gönder
                </p>
              </div>
              <Switch
                checked={settings.emailNotifications?.enabled || false}
                onChange={(checked) => handleSettingChange('emailNotifications.enabled', checked)}
                className={`${
                  settings.emailNotifications?.enabled ? 'bg-indigo-600' : 'bg-gray-200'
                } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
              >
                <span
                  className={`${
                    settings.emailNotifications?.enabled ? 'translate-x-6' : 'translate-x-1'
                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </Switch>
            </div>

            {settings.emailNotifications?.enabled && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Alıcı E-posta Adresleri
                    </label>
                    <button
                      onClick={addRecipient}
                      className="inline-flex items-center px-2 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      <PlusIcon className="h-3 w-3 mr-1" />
                      Sabit E-posta Ekle
                    </button>
                  </div>

                  {/* Form alanlarından e-posta seçimi */}
                  {emailFields.length > 0 && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <p className="text-xs font-medium text-blue-900 mb-2">
                        Form Alanlarından E-posta:
                      </p>
                      <div className="space-y-2">
                        {emailFields.map((field) => (
                          <label key={field.id} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={isFieldEmailSelected(field.id)}
                              onChange={() => toggleFieldEmail(field.id)}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mr-2"
                            />
                            <span className="text-sm text-gray-700">
                              {typeof field.label === 'string' 
                                ? field.label 
                                : field.label?.[selectedLanguage] || field.label?.tr || field.label?.en || 'E-posta Alanı'}
                            </span>
                            <span className="ml-2 text-xs text-gray-500">
                              (Kullanıcının girdiği e-posta)
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sabit e-posta adresleri */}
                  <div className="space-y-2">
                    {(settings.emailNotifications.recipients || [])
                      .filter(r => !r.startsWith('{field:'))
                      .map((recipient, index) => {
                        const actualIndex = settings.emailNotifications.recipients.indexOf(recipient);
                        return (
                          <div key={actualIndex} className="flex items-center space-x-2">
                            <input
                              type="email"
                              value={recipient}
                              onChange={(e) => updateRecipient(actualIndex, e.target.value)}
                              placeholder="email@example.com"
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                            />
                            <button
                              onClick={() => removeRecipient(actualIndex)}
                              className="text-red-400 hover:text-red-600"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })
                    }
                  </div>
                  {(settings.emailNotifications.recipients || []).filter(r => !r.startsWith('{field:')).length === 0 && emailFields.length === 0 && (
                    <p className="text-sm text-gray-500 italic">
                      Henüz alıcı eklenmedi. Yukarıdaki butonu kullanarak sabit e-posta adresi ekleyebilirsiniz.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    E-posta Konusu
                  </label>
                  <input
                    type="text"
                    value={settings.emailNotifications.subject || ''}
                    onChange={(e) => handleSettingChange('emailNotifications.subject', e.target.value)}
                    placeholder="Yeni form gönderimi"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Yanıt Adresi (Reply-To)
                  </label>

                  {/* Form alanlarından e-posta seçimi for Reply-To */}
                  {emailFields.length > 0 && (
                    <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-md">
                      <p className="text-xs font-medium text-green-900 mb-2">
                        Form Alanından Yanıt Adresi:
                      </p>
                      <div className="space-y-2">
                        {emailFields.map((field) => {
                          const fieldRef = `{field:${field.id}}`;
                          const isSelected = settings.emailNotifications?.replyTo === fieldRef;
                          return (
                            <label key={field.id} className="flex items-center">
                              <input
                                type="radio"
                                name="replyToSource"
                                checked={isSelected}
                                onChange={() => handleSettingChange('emailNotifications.replyTo', fieldRef)}
                                className="border-gray-300 text-indigo-600 focus:ring-indigo-500 mr-2"
                              />
                              <span className="text-sm text-gray-700">
                                {typeof field.label === 'string'
                                  ? field.label
                                  : field.label?.[selectedLanguage] || field.label?.tr || field.label?.en || 'E-posta Alanı'}
                              </span>
                              <span className="ml-2 text-xs text-gray-500">
                                (Kullanıcının girdiği e-posta)
                              </span>
                            </label>
                          );
                        })}
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="replyToSource"
                            checked={!settings.emailNotifications?.replyTo?.startsWith('{field:')}
                            onChange={() => handleSettingChange('emailNotifications.replyTo', '')}
                            className="border-gray-300 text-indigo-600 focus:ring-indigo-500 mr-2"
                          />
                          <span className="text-sm text-gray-700">Sabit e-posta adresi kullan</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Sabit e-posta input - sadece form alanı seçili değilse göster */}
                  {!settings.emailNotifications?.replyTo?.startsWith('{field:') && (
                    <input
                      type="email"
                      value={settings.emailNotifications?.replyTo || ''}
                      onChange={(e) => handleSettingChange('emailNotifications.replyTo', e.target.value)}
                      placeholder="Boş bırakılırsa tenant ayarlarından alınır"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  )}

                  {settings.emailNotifications?.replyTo?.startsWith('{field:') && (
                    <p className="text-sm text-green-600 bg-green-50 p-2 rounded">
                      Yanıt adresi olarak kullanıcının form alanına girdiği e-posta kullanılacak.
                    </p>
                  )}

                  <p className="mt-1 text-sm text-gray-500">
                    Opsiyonel. Boş bırakılırsa tenant ayarlarındaki varsayılan e-posta kullanılır.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Webhooks */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Webhook Entegrasyonu</h3>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-900">
                  Webhook Etkin
                </label>
                <p className="text-sm text-gray-500">
                  Form olayları için webhook URL'ine POST gönder
                </p>
              </div>
              <Switch
                checked={settings.webhooks?.enabled || false}
                onChange={(checked) => handleSettingChange('webhooks.enabled', checked)}
                className={`${
                  settings.webhooks?.enabled ? 'bg-indigo-600' : 'bg-gray-200'
                } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`}
              >
                <span
                  className={`${
                    settings.webhooks?.enabled ? 'translate-x-6' : 'translate-x-1'
                  } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </Switch>
            </div>

            {settings.webhooks?.enabled && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Webhook URL
                  </label>
                  <input
                    type="url"
                    value={settings.webhooks.url || ''}
                    onChange={(e) => handleSettingChange('webhooks.url', e.target.value)}
                    placeholder="https://example.com/webhook"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Dinlenecek Olaylar
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.webhooks.events?.includes('submission.created')}
                        onChange={(e) => {
                          const events = e.target.checked
                            ? [...(settings.webhooks.events || []), 'submission.created']
                            : (settings.webhooks.events || []).filter(ev => ev !== 'submission.created');
                          handleSettingChange('webhooks.events', events);
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Form Gönderimi</span>
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
