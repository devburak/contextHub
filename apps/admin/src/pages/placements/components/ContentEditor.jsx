import React, { useEffect, useMemo, useState } from 'react';
import { listForms } from '../../../lib/api/forms.js';

export default function ContentEditor({ content = {}, onChange }) {
  const [forms, setForms] = useState([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [formsError, setFormsError] = useState('');

  useEffect(() => {
    if (content.type !== 'form') {
      return;
    }

    let cancelled = false;
    async function loadForms() {
      setFormsLoading(true);
      setFormsError('');
      try {
        const result = await listForms({
          page: 1,
          limit: 100,
          filters: { status: 'published' }
        });
        if (!cancelled) {
          setForms(result.forms || result.items || []);
        }
      } catch (error) {
        if (!cancelled) {
          setFormsError(error?.response?.data?.message || 'Formlar yüklenemedi.');
        }
      } finally {
        if (!cancelled) {
          setFormsLoading(false);
        }
      }
    }

    loadForms();

    return () => {
      cancelled = true;
    };
  }, [content.type]);

  const selectedForm = useMemo(
    () => forms.find((form) => (form._id || form.id) === content.formId),
    [forms, content.formId]
  );

  const handleUpdate = (field, value) => {
    onChange({
      ...content,
      [field]: value
    });
  };

  return (
    <div className="space-y-4">
      {/* Content Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Content Type
        </label>
        <select
          value={content.type || 'text'}
          onChange={(e) => handleUpdate('type', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="text">Text & CTA</option>
          <option value="html">Custom HTML</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="form">Form</option>
          <option value="component">Component</option>
          <option value="external">External URL</option>
        </select>
      </div>

      {/* Text Content */}
      {content.type === 'text' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title
            </label>
            <input
              type="text"
              value={content.title || ''}
              onChange={(e) => handleUpdate('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Welcome to our site!"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message
            </label>
            <textarea
              value={content.message || ''}
              onChange={(e) => handleUpdate('message', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Get 20% off your first order..."
            />
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Call to Action</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-2">Button Text</label>
                <input
                  type="text"
                  value={content.cta?.text || ''}
                  onChange={(e) => handleUpdate('cta', { ...content.cta, text: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Shop Now"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-2">URL</label>
                <input
                  type="text"
                  value={content.cta?.url || ''}
                  onChange={(e) => handleUpdate('cta', { ...content.cta, url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="/shop"
                />
              </div>
            </div>

            <div className="mt-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={content.cta?.newTab || false}
                  onChange={(e) => handleUpdate('cta', { ...content.cta, newTab: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-600">Open in new tab</span>
              </label>
            </div>
          </div>
        </>
      )}

      {/* HTML Content */}
      {content.type === 'html' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            HTML Content
          </label>
          <textarea
            value={content.html || ''}
            onChange={(e) => handleUpdate('html', e.target.value)}
            rows={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
            placeholder="<div>Your custom HTML...</div>"
          />
        </div>
      )}

      {/* Image Content */}
      {content.type === 'image' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Image URL
            </label>
            <input
              type="text"
              value={content.imageUrl || ''}
              onChange={(e) => handleUpdate('imageUrl', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Alt Text
            </label>
            <input
              type="text"
              value={content.alt || ''}
              onChange={(e) => handleUpdate('alt', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Image description"
            />
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Link (optional)</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-2">Link Text</label>
                <input
                  type="text"
                  value={content.cta?.text || ''}
                  onChange={(e) => handleUpdate('cta', { ...content.cta, text: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-2">URL</label>
                <input
                  type="text"
                  value={content.cta?.url || ''}
                  onChange={(e) => handleUpdate('cta', { ...content.cta, url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Video Content */}
      {content.type === 'video' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Video URL
            </label>
            <input
              type="text"
              value={content.videoUrl || ''}
              onChange={(e) => handleUpdate('videoUrl', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="https://..."
            />
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={content.autoplay || false}
                onChange={(e) => handleUpdate('autoplay', e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-600">Autoplay</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={content.controls !== false}
                onChange={(e) => handleUpdate('controls', e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-600">Show Controls</span>
            </label>
          </div>
        </>
      )}

      {/* Form Content */}
      {content.type === 'form' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ContextHub Formu
            </label>
            <select
              value={content.formId || ''}
              onChange={(e) => {
                const form = forms.find((item) => (item._id || item.id) === e.target.value);
                onChange({
                  ...content,
                  formId: e.target.value,
                  title: content.title || form?.title || '',
                  submitText: content.submitText || form?.settings?.submitButtonText || ''
                });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              disabled={formsLoading}
            >
              <option value="">{formsLoading ? 'Formlar yükleniyor...' : 'Form seçin'}</option>
              {forms.map((form) => (
                <option key={form._id || form.id} value={form._id || form.id}>
                  {typeof form.title === 'string' ? form.title : form.title?.tr || form.title?.en || form.slug}
                </option>
              ))}
            </select>
            {formsError && <p className="mt-1 text-sm text-red-600">{formsError}</p>}
            {selectedForm && (
              <p className="mt-1 text-xs text-gray-500">
                Slug: {selectedForm.slug} · Alan sayısı: {selectedForm.fields?.length || 0}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Başlık override
            </label>
            <input
              type="text"
              value={content.title || ''}
              onChange={(e) => handleUpdate('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Boş bırakılırsa form başlığı kullanılır"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Submit Button Text override
            </label>
            <input
              type="text"
              value={content.submitText || ''}
              onChange={(e) => handleUpdate('submitText', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Boş bırakılırsa form ayarı kullanılır"
            />
          </div>
        </>
      )}

      {/* Component Content */}
      {content.type === 'component' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Component ID
          </label>
          <input
            type="text"
            value={content.componentId || ''}
            onChange={(e) => handleUpdate('componentId', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="custom-promo-component"
          />
          <p className="text-sm text-gray-500 mt-1">
            Component must be registered in your app
          </p>
        </div>
      )}

      {/* External Content */}
      {content.type === 'external' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            External URL
          </label>
          <input
            type="url"
            value={content.externalUrl || ''}
            onChange={(e) => handleUpdate('externalUrl', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="https://example.com/embed"
          />
          <p className="text-sm text-gray-500 mt-1">
            Render tarafında iframe veya uygulamaya özel component ile kullanılabilir.
          </p>
        </div>
      )}
    </div>
  );
}
