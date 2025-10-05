import React from 'react';

export default function UIConfig({ ui = {}, trigger = {}, onUIChange, onTriggerChange }) {
  const handleUIUpdate = (field, value) => {
    onUIChange({
      ...ui,
      [field]: value
    });
  };

  const handleTriggerUpdate = (field, value) => {
    onTriggerChange({
      ...trigger,
      [field]: value
    });
  };

  return (
    <div className="space-y-6">
      {/* UI Variant */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          UI Variant
        </label>
        <select
          value={ui.variant || 'modal'}
          onChange={(e) => handleUIUpdate('variant', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="modal">Modal (Centered)</option>
          <option value="banner-top">Banner - Top</option>
          <option value="banner-bottom">Banner - Bottom</option>
          <option value="slide-in-right">Slide In - Right</option>
          <option value="slide-in-left">Slide In - Left</option>
          <option value="corner-popup">Corner Popup</option>
          <option value="fullscreen-takeover">Fullscreen Takeover</option>
          <option value="inline">Inline Content</option>
        </select>
      </div>

      {/* Position */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Position
        </label>
        <select
          value={ui.position || 'fixed'}
          onChange={(e) => handleUIUpdate('position', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="fixed">Fixed</option>
          <option value="absolute">Absolute</option>
          <option value="relative">Relative</option>
          <option value="sticky">Sticky</option>
        </select>
      </div>

      {/* Width & Height */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Width
          </label>
          <input
            type="text"
            value={ui.width || ''}
            onChange={(e) => handleUIUpdate('width', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="500px or 80%"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Height
          </label>
          <input
            type="text"
            value={ui.height || ''}
            onChange={(e) => handleUIUpdate('height', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="auto or 300px"
          />
        </div>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Background Color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={ui.backgroundColor || '#ffffff'}
              onChange={(e) => handleUIUpdate('backgroundColor', e.target.value)}
              className="w-12 h-10 rounded border border-gray-300"
            />
            <input
              type="text"
              value={ui.backgroundColor || '#ffffff'}
              onChange={(e) => handleUIUpdate('backgroundColor', e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Text Color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={ui.textColor || '#000000'}
              onChange={(e) => handleUIUpdate('textColor', e.target.value)}
              className="w-12 h-10 rounded border border-gray-300"
            />
            <input
              type="text"
              value={ui.textColor || '#000000'}
              onChange={(e) => handleUIUpdate('textColor', e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Button Color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={ui.buttonColor || '#007bff'}
              onChange={(e) => handleUIUpdate('buttonColor', e.target.value)}
              className="w-12 h-10 rounded border border-gray-300"
            />
            <input
              type="text"
              value={ui.buttonColor || '#007bff'}
              onChange={(e) => handleUIUpdate('buttonColor', e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Styling */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Border Radius
          </label>
          <input
            type="text"
            value={ui.borderRadius || ''}
            onChange={(e) => handleUIUpdate('borderRadius', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="8px"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Padding
          </label>
          <input
            type="text"
            value={ui.padding || ''}
            onChange={(e) => handleUIUpdate('padding', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            placeholder="24px"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Z-Index
          </label>
          <input
            type="number"
            value={ui.zIndex || 9999}
            onChange={(e) => handleUIUpdate('zIndex', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
      </div>

      {/* Offset (for positioned variants) */}
      {['slide-in-right', 'slide-in-left', 'corner-popup'].includes(ui.variant) && (
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Offset
          </label>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Top</label>
              <input
                type="text"
                value={ui.offset?.top || ''}
                onChange={(e) => handleUIUpdate('offset', { ...ui.offset, top: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="auto"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Right</label>
              <input
                type="text"
                value={ui.offset?.right || ''}
                onChange={(e) => handleUIUpdate('offset', { ...ui.offset, right: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="auto"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Bottom</label>
              <input
                type="text"
                value={ui.offset?.bottom || ''}
                onChange={(e) => handleUIUpdate('offset', { ...ui.offset, bottom: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="auto"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Left</label>
              <input
                type="text"
                value={ui.offset?.left || ''}
                onChange={(e) => handleUIUpdate('offset', { ...ui.offset, left: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="auto"
              />
            </div>
          </div>
        </div>
      )}

      {/* Options */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Options
        </label>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={ui.showCloseButton !== false}
              onChange={(e) => handleUIUpdate('showCloseButton', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-600">Show Close Button</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={ui.overlay || false}
              onChange={(e) => handleUIUpdate('overlay', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-600">Show Overlay</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={ui.closeOnOverlayClick || false}
              onChange={(e) => handleUIUpdate('closeOnOverlayClick', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-600">Close on Overlay Click</span>
          </label>
        </div>
      </div>

      {/* Animation */}
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">
          Animation
        </label>
        <select
          value={ui.animation || 'fadeIn'}
          onChange={(e) => handleUIUpdate('animation', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="fadeIn">Fade In</option>
          <option value="slideDown">Slide Down</option>
          <option value="slideUp">Slide Up</option>
          <option value="slideLeft">Slide Left</option>
          <option value="slideRight">Slide Right</option>
          <option value="zoomIn">Zoom In</option>
          <option value="none">None</option>
        </select>
      </div>

      {/* Trigger */}
      <div className="border-t border-gray-200 pt-6 mt-6">
        <h3 className="text-sm font-medium text-gray-900 mb-4">Trigger Settings</h3>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Trigger Type
          </label>
          <select
            value={trigger.type || 'onLoad'}
            onChange={(e) => handleTriggerUpdate('type', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="onLoad">On Page Load</option>
            <option value="onScroll">On Scroll (50%)</option>
            <option value="onExit">On Exit Intent</option>
            <option value="onTimeout">After Timeout</option>
            <option value="manual">Manual Trigger</option>
          </select>
        </div>

        {trigger.type === 'onTimeout' && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Delay (milliseconds)
            </label>
            <input
              type="number"
              value={trigger.delay || 3000}
              onChange={(e) => handleTriggerUpdate('delay', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        )}
      </div>
    </div>
  );
}
