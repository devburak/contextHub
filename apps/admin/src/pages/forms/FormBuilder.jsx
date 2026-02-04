import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formsApi } from '../../lib/api/forms';
import { useAuth } from '../../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import {
  ArrowLeftIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import FieldPalette from '../../components/forms/FieldPalette';
import FormCanvas from '../../components/forms/FormCanvas';
import FieldInspector from '../../components/forms/FieldInspector';
import FormSettings from '../../components/forms/FormSettings';

export default function FormBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenant } = useAuth();
  const [activeTab, setActiveTab] = useState('build'); // build, settings, preview
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('tr'); // tr, en
  const [validationErrors, setValidationErrors] = useState([]);

  // Helper function to format error paths in Turkish
  const formatErrorPath = (path) => {
    const pathMap = {
      'title': 'Form Başlığı',
      'description': 'Açıklama',
      'slug': 'URL',
      'fields': 'Alanlar',
      'settings': 'Ayarlar',
      'emailNotifications': 'E-posta Bildirimleri',
      'recipients': 'Alıcılar',
      'subject': 'Konu',
      'replyTo': 'Yanıt Adresi',
      'webhooks': 'Webhook',
      'url': 'URL',
      'events': 'Olaylar',
      'submitButtonText': 'Gönder Butonu',
      'successMessage': 'Başarı Mesajı',
      'redirectUrl': 'Yönlendirme URL',
      'submitLimit': 'Gönderim Limiti',
      'maxFileSize': 'Maksimum Dosya Boyutu',
      'allowedFileTypes': 'İzin Verilen Dosya Tipleri',
      'name': 'Alan Adı',
      'label': 'Etiket',
      'type': 'Tip',
      'placeholder': 'Yer Tutucu',
      'helpText': 'Yardım Metni',
      'validation': 'Validasyon',
      'options': 'Seçenekler'
    };

    return path.map((segment, index) => {
      // If it's a number, it's an array index
      if (!isNaN(segment)) {
        return `#${parseInt(segment) + 1}`;
      }
      // Use Turkish translation if available
      return pathMap[segment] || segment;
    }).join(' → ');
  };

  // Form state
  const [formData, setFormData] = useState({
    title: { tr: '', en: '' },
    description: { tr: '', en: '' },
    slug: '',
    fields: [],
    settings: {
      submitButtonText: { tr: 'Gönder', en: 'Submit' },
      successMessage: { tr: 'Form başarıyla gönderildi', en: 'Form submitted successfully' },
      redirectUrl: '',
      allowMultipleSubmissions: false,
      requireAuthentication: false,
      enableCaptcha: false,
      enableFileUpload: false,
      maxFileSize: 10,
      allowedFileTypes: [],
      emailNotifications: {
        enabled: false,
        recipients: [],
        subject: '',
        replyTo: '',
      },
      webhooks: {
        enabled: false,
        url: '',
        events: ['submission.created'],
      },
    },
  });

  // Fetch form data if editing
  const { data: form, isLoading: isLoadingForm } = useQuery({
    queryKey: ['form', id],
    queryFn: () => formsApi.getForm(id),
    enabled: !!id && id !== 'new',
  });

  // Check if we're really loading (only when editing existing form)
  const isLoading = isLoadingForm && id !== 'new';

  // Initialize form data when editing
  useEffect(() => {
    if (form) {
      // Default values for emailNotifications to prevent undefined issues
      const defaultEmailNotifications = {
        enabled: false,
        recipients: [],
        subject: '',
        replyTo: '',
      };

      // Default values for webhooks
      const defaultWebhooks = {
        enabled: false,
        url: '',
        events: ['submission.created'],
      };

      setFormData({
        title: form.title,
        description: form.description || { tr: '', en: '' },
        slug: form.slug,
        fields: form.fields || [],
        settings: {
          ...formData.settings,
          ...form.settings,
          emailNotifications: {
            ...defaultEmailNotifications,
            ...(form.settings?.emailNotifications || {}),
          },
          webhooks: {
            ...defaultWebhooks,
            ...(form.settings?.webhooks || {}),
          },
        },
      });
    }
  }, [form]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (id && id !== 'new') {
        return formsApi.updateForm(id, data);
      } else {
        return formsApi.createForm(data);
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['forms']);
      queryClient.invalidateQueries(['form', id]);
      setHasUnsavedChanges(false);
      setValidationErrors([]); // Clear errors on success
      if (id === 'new') {
        navigate(`/forms/${data._id}`, { replace: true });
      }
    },
    onError: (error) => {
      console.error('=== FORM SAVE ERROR DEBUG ===');
      console.error('1. Full error object:', error);
      console.error('2. Error response:', error.response);
      console.error('3. Response data:', error.response?.data);
      console.error('4. Response data details:', error.response?.data?.details);
      console.error('5. Details type:', typeof error.response?.data?.details);
      console.error('6. Details is array?:', Array.isArray(error.response?.data?.details));
      console.error('=== END DEBUG ===');
      
      // Validation hatalarını state'e kaydet
      if (error.response?.data?.details && Array.isArray(error.response.data.details)) {
        console.log('Setting validation errors from details:', error.response.data.details);
        setValidationErrors(error.response.data.details);
      } else {
        console.log('No details array, using fallback error');
        setValidationErrors([{
          path: ['general'],
          message: error.response?.data?.message || error.message
        }]);
      }
    },
  });

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: () => formsApi.publishForm(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['forms']);
      queryClient.invalidateQueries(['form', id]);
    },
  });

  // Handle field selection
  const handleFieldSelect = (fieldId) => {
    setSelectedFieldId(fieldId);
  };

  // Handle field add from palette
  const handleFieldAdd = (fieldType) => {
    const newField = {
      id: uuidv4(),
      type: fieldType,
      label: { tr: 'Yeni Alan', en: 'New Field' },
      name: `field_${Date.now()}`,
      placeholder: { tr: '', en: '' },
      helpText: { tr: '', en: '' },
      required: false,
      validation: {},
      options: fieldType === 'select' || fieldType === 'radio' || fieldType === 'checkbox' 
        ? [{ label: { tr: 'Seçenek 1', en: 'Option 1' }, value: 'option1' }]
        : undefined,
    };

    setFormData(prev => ({
      ...prev,
      fields: [...prev.fields, newField],
    }));
    setSelectedFieldId(newField.id);
    setHasUnsavedChanges(true);
  };

  // Handle field update
  const handleFieldUpdate = (fieldId, updates) => {
    console.log('Field update:', { fieldId, updates });
    setFormData(prev => {
      const updatedFields = prev.fields.map(field => {
        if (field.id === fieldId) {
          const updated = { ...field, ...updates };
          console.log('Updated field:', updated);
          return updated;
        }
        return field;
      });
      return {
        ...prev,
        fields: updatedFields,
      };
    });
    setHasUnsavedChanges(true);
  };

  // Handle field delete
  const handleFieldDelete = (fieldId) => {
    setFormData(prev => ({
      ...prev,
      fields: prev.fields.filter(field => field.id !== fieldId),
    }));
    if (selectedFieldId === fieldId) {
      setSelectedFieldId(null);
    }
    setHasUnsavedChanges(true);
  };

  // Handle field reorder
  const handleFieldReorder = (newFields) => {
    setFormData(prev => ({
      ...prev,
      fields: newFields,
    }));
    setHasUnsavedChanges(true);
  };

  // Handle settings update with deep merge for nested objects
  const handleSettingsUpdate = (updates) => {
    setFormData(prev => {
      const newSettings = { ...prev.settings };

      Object.keys(updates).forEach(key => {
        if (typeof updates[key] === 'object' && updates[key] !== null && !Array.isArray(updates[key])) {
          // Deep merge for nested objects like emailNotifications, webhooks
          newSettings[key] = {
            ...(prev.settings[key] || {}),
            ...updates[key],
          };
        } else {
          newSettings[key] = updates[key];
        }
      });

      return {
        ...prev,
        settings: newSettings,
      };
    });
    setHasUnsavedChanges(true);
  };

  // Handle form info update
  const handleFormInfoUpdate = (updates) => {
    setFormData(prev => ({
      ...prev,
      ...updates,
    }));
    setHasUnsavedChanges(true);
  };

  // Handle save
  const handleSave = () => {
    console.log('=== SAVING FORM ===');
    console.log('Form data:', JSON.stringify(formData, null, 2));
    console.log('Fields:', formData.fields);
    formData.fields.forEach((field, index) => {
      console.log(`Field ${index}:`, {
        id: field.id,
        type: field.type,
        name: field.name,
        label: field.label
      });
    });
    console.log('=== END ===');
    saveMutation.mutate(formData);
  };

  // Handle publish
  const handlePublish = () => {
    if (id && id !== 'new') {
      publishMutation.mutate();
    } else {
      // Save first, then publish
      saveMutation.mutate(formData, {
        onSuccess: (data) => {
          formsApi.publishForm(data._id).then(() => {
            queryClient.invalidateQueries(['forms']);
            queryClient.invalidateQueries(['form', data._id]);
          });
        },
      });
    }
  };

  // Handle duplicate
  const handleDuplicate = () => {
    if (id && id !== 'new') {
      formsApi.duplicateForm(id).then((data) => {
        queryClient.invalidateQueries(['forms']);
        navigate(`/forms/${data._id}`);
      });
    }
  };

  // Get selected field
  const selectedField = formData.fields.find(f => f.id === selectedFieldId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/forms')}
              className="text-gray-400 hover:text-gray-600"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <div>
              <input
                type="text"
                value={formData.title.tr || ''}
                onChange={(e) => handleFormInfoUpdate({ title: { ...formData.title, tr: e.target.value } })}
                placeholder="Form Başlığı"
                className="text-lg font-medium text-gray-900 border-0 border-b border-transparent hover:border-gray-300 focus:border-indigo-600 focus:ring-0 px-0"
              />
              <p className="text-sm text-gray-500 mt-1">
                {form?.status === 'published' ? 'Yayında' : form?.status === 'archived' ? 'Arşivlendi' : 'Taslak'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Language Selector */}
            <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
              <button
                onClick={() => setSelectedLanguage('tr')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedLanguage === 'tr'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                🇹🇷 TR
              </button>
              <button
                onClick={() => setSelectedLanguage('en')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedLanguage === 'en'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                🇬🇧 EN
              </button>
            </div>

            {id && id !== 'new' && (
              <>
                <button
                  onClick={handleDuplicate}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <DocumentDuplicateIcon className="h-4 w-4 mr-2" />
                  Kopyala
                </button>
                <button
                  onClick={() => setActiveTab('preview')}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <EyeIcon className="h-4 w-4 mr-2" />
                  Önizle
                </button>
              </>
            )}
            
            <button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || saveMutation.isPending}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveMutation.isPending ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              ) : (
                <CheckIcon className="h-4 w-4 mr-2" />
              )}
              Kaydet
            </button>

            {form?.status !== 'published' && (
              <button
                onClick={handlePublish}
                disabled={publishMutation.isPending}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
              >
                Yayınla
              </button>
            )}
          </div>
        </div>

        {/* Validation Errors Banner */}
        {validationErrors.length > 0 && (
          <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <XMarkIcon className="h-5 w-5 text-red-400" />
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-red-800">
                  Form kaydedilemedi. Lütfen aşağıdaki hataları düzeltin:
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <ul className="list-disc list-inside space-y-1">
                    {validationErrors.map((error, index) => (
                      <li key={index}>
                        <span className="font-medium">{formatErrorPath(error.path)}</span>: {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="ml-auto pl-3">
                <button
                  onClick={() => setValidationErrors([])}
                  className="inline-flex rounded-md bg-red-50 p-1.5 text-red-500 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 focus:ring-offset-red-50"
                >
                  <span className="sr-only">Kapat</span>
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mt-4 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('build')}
              className={`${
                activeTab === 'build'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
            >
              Form Oluştur
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`${
                activeTab === 'settings'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
            >
              Ayarlar
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`${
                activeTab === 'preview'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
            >
              Önizleme
            </button>
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'build' && (
          <div className="h-full flex">
            {/* Field Palette */}
            <div className="w-64 border-r border-gray-200 bg-gray-50 overflow-y-auto">
              <FieldPalette onFieldAdd={handleFieldAdd} />
            </div>

            {/* Form Canvas */}
            <div className="flex-1 overflow-y-auto bg-white">
              <FormCanvas
                fields={formData.fields}
                selectedFieldId={selectedFieldId}
                onFieldSelect={handleFieldSelect}
                onFieldReorder={handleFieldReorder}
                onFieldDelete={handleFieldDelete}
              />
            </div>

            {/* Field Inspector */}
            {selectedField && (
              <div className="w-80 border-l border-gray-200 bg-gray-50 overflow-y-auto">
                <FieldInspector
                  field={selectedField}
                  selectedLanguage={selectedLanguage}
                  onFieldUpdate={(updates) => handleFieldUpdate(selectedField.id, updates)}
                  onClose={() => setSelectedFieldId(null)}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="h-full overflow-y-auto">
            <FormSettings
              settings={formData.settings}
              formInfo={{ title: formData.title, description: formData.description, slug: formData.slug }}
              formFields={formData.fields}
              selectedLanguage={selectedLanguage}
              onSettingsUpdate={handleSettingsUpdate}
              onFormInfoUpdate={handleFormInfoUpdate}
            />
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="h-full overflow-y-auto bg-gray-50 p-8">
            <div className="max-w-3xl mx-auto bg-white rounded-lg shadow p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {formData.title.tr || 'Form Başlığı'}
              </h2>
              {formData.description.tr && (
                <p className="text-gray-600 mb-6">{formData.description.tr}</p>
              )}
              
              <div className="space-y-6">
                {formData.fields.map((field) => (
                  <div key={field.id}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label.tr || field.label.en}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {field.helpText?.tr && (
                      <p className="text-sm text-gray-500 mb-2">{field.helpText.tr}</p>
                    )}
                    
                    {/* Simple preview rendering */}
                    {['text', 'email', 'phone', 'number'].includes(field.type) && (
                      <input
                        type={field.type}
                        placeholder={field.placeholder?.tr}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        disabled
                      />
                    )}
                    
                    {field.type === 'textarea' && (
                      <textarea
                        placeholder={field.placeholder?.tr}
                        rows={4}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        disabled
                      />
                    )}
                    
                    {field.type === 'select' && (
                      <select className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" disabled>
                        <option>Seçiniz...</option>
                        {field.options?.map((opt, idx) => (
                          <option key={idx} value={opt.value}>
                            {opt.label.tr || opt.label.en}
                          </option>
                        ))}
                      </select>
                    )}
                    
                    {field.type === 'checkbox' && field.options && (
                      <div className="space-y-2">
                        {field.options.map((opt, idx) => (
                          <div key={idx} className="flex items-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              disabled
                            />
                            <label className="ml-2 text-sm text-gray-700">
                              {opt.label.tr || opt.label.en}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {field.type === 'radio' && field.options && (
                      <div className="space-y-2">
                        {field.options.map((opt, idx) => (
                          <div key={idx} className="flex items-center">
                            <input
                              type="radio"
                              name={field.name}
                              className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              disabled
                            />
                            <label className="ml-2 text-sm text-gray-700">
                              {opt.label.tr || opt.label.en}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {field.type === 'date' && (
                      <input
                        type="date"
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        disabled
                      />
                    )}
                    
                    {field.type === 'file' && (
                      <input
                        type="file"
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700"
                        disabled
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <button
                  type="button"
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  disabled
                >
                  {formData.settings.submitButtonText.tr}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
