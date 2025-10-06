import React from 'react';

export default function ContentEditor({ content = {}, onChange }) {
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
              Form Title
            </label>
            <input
              type="text"
              value={content.title || ''}
              onChange={(e) => handleUpdate('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Subscribe to newsletter"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Submit Button Text
            </label>
            <input
              type="text"
              value={content.submitText || 'Submit'}
              onChange={(e) => handleUpdate('submitText', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Form Fields (JSON)
            </label>
            <textarea
              value={JSON.stringify(content.fields || [], null, 2)}
              onChange={(e) => {
                try {
                  handleUpdate('fields', JSON.parse(e.target.value));
                } catch (err) {
                  // Invalid JSON, ignore
                }
              }}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
              placeholder='[{"name": "email", "type": "email", "label": "Email", "required": true}]'
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
    </div>
  );
}
