import { Fragment, useState } from 'react';
import { Dialog, Transition, Menu } from '@headlessui/react';
import {
  XMarkIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  DevicePhoneMobileIcon,
  ComputerDesktopIcon,
  UserIcon,
  EnvelopeIcon,
  MapPinIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import {
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon
} from '@heroicons/react/20/solid';
import clsx from 'clsx';

export default function ResponseDetailModal({ response, form, isLoading, onClose, onDelete, onHardDelete, onStatusChange }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  if (isLoading || !response) {
    return (
      <Transition.Root show={true} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={onClose}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
          </Transition.Child>

          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                enterTo="opacity-100 translate-y-0 sm:scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              >
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl sm:p-6">
                  <div className="text-center py-12">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
                    <p className="mt-4 text-sm text-gray-500">Yanıt detayları yükleniyor...</p>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
    );
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const statusOptions = [
    { value: 'pending', label: 'Beklemede', icon: ClockIcon, color: 'yellow' },
    { value: 'processed', label: 'İşlendi', icon: CheckCircleIcon, color: 'green' },
    { value: 'spam', label: 'Spam', icon: ExclamationTriangleIcon, color: 'red' },
    { value: 'deleted', label: 'Silindi', icon: XCircleIcon, color: 'gray' },
  ];

  const getStatusStyle = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200',
      processed: 'bg-green-100 text-green-700 hover:bg-green-200',
      spam: 'bg-red-100 text-red-700 hover:bg-red-200',
      deleted: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    };
    return styles[status] || styles.pending;
  };

  const currentStatus = statusOptions.find(s => s.value === response.status) || statusOptions[0];
  const StatusIcon = currentStatus.icon;

  const getDeviceIcon = (deviceType) => {
    switch (deviceType) {
      case 'mobile':
        return DevicePhoneMobileIcon;
      case 'tablet':
        return DevicePhoneMobileIcon;
      case 'desktop':
        return ComputerDesktopIcon;
      default:
        return ComputerDesktopIcon;
    }
  };

  const getFieldInfo = (fieldName) => {
    // First try fieldMetadata (from backend enrichment)
    if (response.fieldMetadata?.[fieldName]) {
      return response.fieldMetadata[fieldName];
    }

    // Fallback to form.fields (if available)
    const field = form?.fields?.find(f => f.name === fieldName);
    if (field) {
      return {
        id: field.id,
        type: field.type,
        label: field.label,
        options: field.options
      };
    }

    return null;
  };

  const extractFieldLabel = (fieldName) => {
    const fieldInfo = getFieldInfo(fieldName);
    if (fieldInfo?.label) {
      if (typeof fieldInfo.label === 'string') return fieldInfo.label;
      return fieldInfo.label.tr || fieldInfo.label.en || fieldName;
    }
    return fieldName;
  };

  const renderFieldValue = (fieldName, value) => {
    const fieldInfo = getFieldInfo(fieldName);

    // Handle arrays (checkbox, multi-select)
    if (Array.isArray(value)) {
      if (fieldInfo?.options && fieldInfo.options.length > 0) {
        // Map values to labels if options are available
        const labels = value.map(v => {
          const option = fieldInfo.options.find(opt => opt.value === v);
          if (option?.label) {
            return typeof option.label === 'string'
              ? option.label
              : option.label.tr || option.label.en || v;
          }
          return v;
        });
        return labels.join(', ');
      }
      return value.join(', ');
    }

    // Handle select/radio with options
    if (fieldInfo?.type === 'select' || fieldInfo?.type === 'radio') {
      if (fieldInfo.options && fieldInfo.options.length > 0) {
        const option = fieldInfo.options.find(opt => opt.value === value);
        if (option?.label) {
          return typeof option.label === 'string'
            ? option.label
            : option.label.tr || option.label.en || value;
        }
      }
    }

    // Handle boolean (checkbox single)
    if (typeof value === 'boolean') {
      return value ? 'Evet' : 'Hayır';
    }

    // Handle null/undefined
    if (value === null || value === undefined) {
      return '-';
    }

    // Default: string representation
    return String(value);
  };

  const getFieldTypeLabel = (fieldName) => {
    const fieldInfo = getFieldInfo(fieldName);
    const typeLabels = {
      text: 'Metin',
      email: 'E-posta',
      phone: 'Telefon',
      number: 'Sayı',
      textarea: 'Uzun Metin',
      select: 'Seçim',
      radio: 'Radyo Düğmesi',
      checkbox: 'Onay Kutusu',
      date: 'Tarih',
      file: 'Dosya',
      rating: 'Değerlendirme',
      hidden: 'Gizli',
      section: 'Bölüm'
    };
    return fieldInfo?.type ? typeLabels[fieldInfo.type] || fieldInfo.type : '';
  };

  const DeviceIcon = response.device?.type ? getDeviceIcon(response.device.type) : ComputerDesktopIcon;

  // Get form fields to use (from response or form prop)
  const formFields = response.form?.fields || form?.fields || [];

  return (
    <Transition.Root show={true} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl sm:p-6">
                {/* Header */}
                <div className="absolute right-0 top-0 pr-4 pt-4">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500"
                    onClick={onClose}
                  >
                    <span className="sr-only">Kapat</span>
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="sm:flex sm:items-start">
                  <div className="w-full">
                    <div className="flex items-center justify-between mb-6">
                      <Dialog.Title as="h3" className="text-xl font-semibold leading-6 text-gray-900">
                        Yanıt Detayları
                      </Dialog.Title>

                      {/* Status Dropdown */}
                      <Menu as="div" className="relative inline-block text-left">
                        <Menu.Button
                          className={clsx(
                            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors',
                            getStatusStyle(response.status)
                          )}
                        >
                          <StatusIcon className="h-4 w-4" />
                          {currentStatus.label}
                          <ChevronDownIcon className="h-3.5 w-3.5 ml-0.5" />
                        </Menu.Button>

                        <Transition
                          as={Fragment}
                          enter="transition ease-out duration-100"
                          enterFrom="transform opacity-0 scale-95"
                          enterTo="transform opacity-100 scale-100"
                          leave="transition ease-in duration-75"
                          leaveFrom="transform opacity-100 scale-100"
                          leaveTo="transform opacity-0 scale-95"
                        >
                          <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                            <div className="py-1">
                              {statusOptions.map((option) => {
                                const OptionIcon = option.icon;
                                return (
                                  <Menu.Item key={option.value}>
                                    {({ active }) => (
                                      <button
                                        onClick={() => {
                                          if (option.value !== response.status) {
                                            onStatusChange(response._id, option.value);
                                          }
                                        }}
                                        className={clsx(
                                          active ? 'bg-gray-100' : '',
                                          response.status === option.value ? 'font-semibold' : '',
                                          'w-full text-left px-4 py-2 text-sm text-gray-700 flex items-center gap-2'
                                        )}
                                      >
                                        <OptionIcon className="h-4 w-4" />
                                        {option.label}
                                        {response.status === option.value && (
                                          <CheckCircleIcon className="ml-auto h-4 w-4 text-green-600" />
                                        )}
                                      </button>
                                    )}
                                  </Menu.Item>
                                );
                              })}
                            </div>
                          </Menu.Items>
                        </Transition>
                      </Menu>
                    </div>

                    {/* Metadata Section */}
                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                      <h4 className="text-sm font-medium text-gray-900 mb-3">Metadata</h4>
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <dt className="text-xs font-medium text-gray-500">Tarih</dt>
                          <dd className="mt-1 text-sm text-gray-900">{formatDate(response.createdAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-gray-500">Kaynak</dt>
                          <dd className="mt-1 text-sm text-gray-900 capitalize">{response.source || 'api'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-gray-500">Dil</dt>
                          <dd className="mt-1 text-sm text-gray-900 uppercase">{response.locale || 'en'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-gray-500">Form Versiyonu</dt>
                          <dd className="mt-1 text-sm text-gray-900">v{response.formVersion}</dd>
                        </div>
                      </dl>
                    </div>

                    {/* User Info Section (if available) */}
                    {(response.userName || response.userEmail) && (
                      <div className="bg-blue-50 rounded-lg p-4 mb-6">
                        <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                          <UserIcon className="h-4 w-4" />
                          Kullanıcı Bilgileri
                        </h4>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {response.userName && (
                            <div>
                              <dt className="text-xs font-medium text-gray-500">Ad</dt>
                              <dd className="mt-1 text-sm text-gray-900">{response.userName}</dd>
                            </div>
                          )}
                          {response.userEmail && (
                            <div>
                              <dt className="text-xs font-medium text-gray-500 flex items-center gap-1">
                                <EnvelopeIcon className="h-3 w-3" />
                                E-posta
                              </dt>
                              <dd className="mt-1 text-sm text-gray-900">{response.userEmail}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    )}

                    {/* Device & Location Section */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                      {/* Device Info */}
                      {response.device && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                            <DeviceIcon className="h-4 w-4" />
                            Cihaz Bilgileri
                          </h4>
                          <dl className="space-y-2">
                            {response.device.type && (
                              <div>
                                <dt className="text-xs font-medium text-gray-500">Tip</dt>
                                <dd className="mt-1 text-sm text-gray-900 capitalize">{response.device.type}</dd>
                              </div>
                            )}
                            {response.device.os && (
                              <div>
                                <dt className="text-xs font-medium text-gray-500">İşletim Sistemi</dt>
                                <dd className="mt-1 text-sm text-gray-900">{response.device.os}</dd>
                              </div>
                            )}
                            {response.device.browser && (
                              <div>
                                <dt className="text-xs font-medium text-gray-500">Tarayıcı</dt>
                                <dd className="mt-1 text-sm text-gray-900">{response.device.browser}</dd>
                              </div>
                            )}
                          </dl>
                        </div>
                      )}

                      {/* Geo Info */}
                      {response.geo && (response.geo.country || response.geo.city) && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                            <MapPinIcon className="h-4 w-4" />
                            Konum Bilgileri
                          </h4>
                          <dl className="space-y-2">
                            {response.geo.country && (
                              <div>
                                <dt className="text-xs font-medium text-gray-500">Ülke</dt>
                                <dd className="mt-1 text-sm text-gray-900">{response.geo.country}</dd>
                              </div>
                            )}
                            {response.geo.city && (
                              <div>
                                <dt className="text-xs font-medium text-gray-500">Şehir</dt>
                                <dd className="mt-1 text-sm text-gray-900">{response.geo.city}</dd>
                              </div>
                            )}
                          </dl>
                        </div>
                      )}
                    </div>

                    {/* Form Data Section */}
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-4">Form Verileri</h4>
                      <dl className="space-y-5">
                        {/* Show all form fields, including unanswered ones */}
                        {formFields.map((field) => {
                          const fieldName = field.name;
                          const value = response.data[fieldName];
                          const fieldInfo = getFieldInfo(fieldName);
                          const typeLabel = getFieldTypeLabel(fieldName);
                          const label = extractFieldLabel(fieldName);

                          // Extract placeholder and helpText
                          const placeholder = fieldInfo?.placeholder
                            ? (typeof fieldInfo.placeholder === 'string'
                                ? fieldInfo.placeholder
                                : fieldInfo.placeholder.tr || fieldInfo.placeholder.en)
                            : null;

                          const helpText = fieldInfo?.helpText
                            ? (typeof fieldInfo.helpText === 'string'
                                ? fieldInfo.helpText
                                : fieldInfo.helpText.tr || fieldInfo.helpText.en)
                            : null;

                          const isRequired = fieldInfo?.required || field.required;
                          const isFilled = value !== undefined && value !== null && value !== '';

                          return (
                            <div
                              key={fieldName}
                              className={clsx(
                                "border-l-2 pl-4 pb-3 border-b border-gray-100 last:border-b-0",
                                isFilled ? "border-l-green-500" : "border-l-gray-300"
                              )}
                            >
                              <dt className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-700">
                                    {label}
                                  </span>
                                  {isRequired && (
                                    <span className="text-xs text-red-600 font-medium">*</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {!isFilled && (
                                    <span className="text-xs text-gray-400 italic">
                                      Doldurulmadı
                                    </span>
                                  )}
                                  {typeLabel && (
                                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                      {typeLabel}
                                    </span>
                                  )}
                                </div>
                              </dt>

                              {/* Help Text / Placeholder */}
                              {(placeholder || helpText) && (
                                <div className="mb-2 text-xs text-gray-500">
                                  {helpText && <div className="italic">💡 {helpText}</div>}
                                  {placeholder && !helpText && <div className="italic">Placeholder: {placeholder}</div>}
                                </div>
                              )}

                              {/* Field Value */}
                              <dd className={clsx(
                                "text-sm whitespace-pre-wrap break-words",
                                isFilled ? "text-gray-900 font-medium" : "text-gray-400 italic"
                              )}>
                                {isFilled ? renderFieldValue(fieldName, value) : '-'}
                              </dd>
                            </div>
                          );
                        })}

                        {/* Show any extra fields in response.data that aren't in form definition */}
                        {Object.entries(response.data).map(([key, value]) => {
                          const existsInForm = formFields.some(f => f.name === key);
                          if (existsInForm) return null;

                          const typeLabel = getFieldTypeLabel(key);
                          return (
                            <div
                              key={key}
                              className="border-l-2 border-l-orange-500 pl-4 pb-3 border-b border-gray-100 last:border-b-0"
                            >
                              <dt className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-gray-700">
                                  {extractFieldLabel(key)}
                                  <span className="text-xs text-orange-600 ml-2">(Eski/Silinmiş Alan)</span>
                                </span>
                                {typeLabel && (
                                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                    {typeLabel}
                                  </span>
                                )}
                              </dt>
                              <dd className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                                {renderFieldValue(key, value)}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                    </div>

                    {/* Actions */}
                    <div className="mt-6 flex items-center justify-end gap-3">
                      {response.status !== 'deleted' && (
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(true)}
                          className="inline-flex items-center gap-2 rounded-md bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
                        >
                          <TrashIcon className="h-4 w-4" />
                          Sil
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                      >
                        Kapat
                      </button>
                    </div>
                  </div>
                </div>

                {/* Delete Confirmation Dialog */}
                <Transition.Root show={showDeleteConfirm} as={Fragment}>
                  <Dialog as="div" className="relative z-[60]" onClose={() => setShowDeleteConfirm(false)}>
                    <Transition.Child
                      as={Fragment}
                      enter="ease-out duration-300"
                      enterFrom="opacity-0"
                      enterTo="opacity-100"
                      leave="ease-in duration-200"
                      leaveFrom="opacity-100"
                      leaveTo="opacity-0"
                    >
                      <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
                    </Transition.Child>

                    <div className="fixed inset-0 z-10 overflow-y-auto">
                      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <Transition.Child
                          as={Fragment}
                          enter="ease-out duration-300"
                          enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                          enterTo="opacity-100 translate-y-0 sm:scale-100"
                          leave="ease-in duration-200"
                          leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                          leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        >
                          <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                            <div className="sm:flex sm:items-start">
                              <div className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                                <ExclamationTriangleIcon className="h-6 w-6 text-red-600" aria-hidden="true" />
                              </div>
                              <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                                <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
                                  Yanıtı Sil
                                </Dialog.Title>
                                <div className="mt-2 space-y-3">
                                  <p className="text-sm text-gray-500">
                                    Bu yanıtı nasıl silmek istersiniz?
                                  </p>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex items-start gap-2">
                                      <span className="font-medium text-orange-700">Geri Dönüşümlü:</span>
                                      <span className="text-gray-600">Yanıt "Silindi" durumuna alınır, gerekirse geri getirilebilir.</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                      <span className="font-medium text-red-700">Kalıcı:</span>
                                      <span className="text-gray-600">Yanıt veritabanından tamamen silinir. <strong>Geri alınamaz!</strong></span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse gap-3">
                              <button
                                type="button"
                                className="inline-flex w-full justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 sm:w-auto"
                                onClick={() => {
                                  setShowDeleteConfirm(false);
                                  onHardDelete(response._id);
                                }}
                              >
                                Kalıcı Sil
                              </button>
                              <button
                                type="button"
                                className="inline-flex w-full justify-center rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 sm:w-auto"
                                onClick={() => {
                                  setShowDeleteConfirm(false);
                                  onDelete(response._id);
                                }}
                              >
                                Geri Dönüşümlü Sil
                              </button>
                              <button
                                type="button"
                                className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                                onClick={() => setShowDeleteConfirm(false)}
                              >
                                İptal
                              </button>
                            </div>
                          </Dialog.Panel>
                        </Transition.Child>
                      </div>
                    </div>
                  </Dialog>
                </Transition.Root>

              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
