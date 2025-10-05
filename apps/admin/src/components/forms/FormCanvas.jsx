import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Bars3Icon,
  TrashIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';

// Field type icons
const fieldTypeIcons = {
  text: '📝',
  textarea: '📄',
  email: '📧',
  phone: '📱',
  number: '#️⃣',
  date: '📅',
  select: '📋',
  radio: '⭕',
  checkbox: '☑️',
  file: '📎',
  rating: '⭐',
  hidden: '👁️',
  section: '📑',
};

function SortableField({ field, isSelected, onSelect, onDelete, onDuplicate, onToggleVisibility }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [showActions, setShowActions] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative bg-white border-2 rounded-lg p-4 mb-3 cursor-pointer transition-all ${
        isSelected
          ? 'border-indigo-500 shadow-md'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      } ${field.hidden ? 'opacity-60' : ''}`}
      onClick={() => onSelect(field.id)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-2 top-1/2 -translate-y-1/2 cursor-move opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Bars3Icon className="h-5 w-5 text-gray-400 hover:text-gray-600" />
      </div>

      {/* Field Content */}
      <div className="ml-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-lg">{fieldTypeIcons[field.type]}</span>
              <h4 className="text-sm font-medium text-gray-900 truncate">
                {field.label.tr || field.label.en || 'Etiket yok'}
              </h4>
              {field.required && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                  Zorunlu
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">
              Alan adı: {field.name}
            </p>
            {field.placeholder?.tr && (
              <p className="text-xs text-gray-400 mt-1">
                Placeholder: {field.placeholder.tr}
              </p>
            )}
          </div>

          {/* Actions */}
          {showActions && (
            <div className="flex items-center space-x-1 ml-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleVisibility(field.id);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                title={field.hidden ? 'Görünür yap' : 'Gizle'}
              >
                {field.hidden ? (
                  <EyeSlashIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate(field.id);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                title="Kopyala"
              >
                <DocumentDuplicateIcon className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(field.id);
                }}
                className="p-1 text-red-400 hover:text-red-600 rounded hover:bg-red-50"
                title="Sil"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Field Type Badge */}
        <div className="mt-2">
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700">
            {field.type}
          </span>
        </div>

        {/* Options Preview (for select, radio, checkbox) */}
        {field.options && field.options.length > 0 && (
          <div className="mt-2 text-xs text-gray-500">
            {field.options.length} seçenek
          </div>
        )}

        {/* Validation Info */}
        {field.validation && Object.keys(field.validation).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {field.validation.minLength && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700">
                Min: {field.validation.minLength}
              </span>
            )}
            {field.validation.maxLength && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700">
                Max: {field.validation.maxLength}
              </span>
            )}
            {field.validation.pattern && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-50 text-purple-700">
                Regex
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FormCanvas({
  fields,
  selectedFieldId,
  onFieldSelect,
  onFieldReorder,
  onFieldDelete,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = fields.findIndex((field) => field.id === active.id);
      const newIndex = fields.findIndex((field) => field.id === over.id);
      const newFields = arrayMove(fields, oldIndex, newIndex);
      onFieldReorder(newFields);
    }
  };

  const handleDuplicate = (fieldId) => {
    const field = fields.find((f) => f.id === fieldId);
    if (field) {
      const duplicatedField = {
        ...field,
        id: `${field.id}_copy_${Date.now()}`,
        name: `${field.name}_copy`,
      };
      const fieldIndex = fields.findIndex((f) => f.id === fieldId);
      const newFields = [...fields];
      newFields.splice(fieldIndex + 1, 0, duplicatedField);
      onFieldReorder(newFields);
    }
  };

  const handleToggleVisibility = (fieldId) => {
    const field = fields.find((f) => f.id === fieldId);
    if (field) {
      // This would need to be handled by parent component
      // For now, just log it
      console.log('Toggle visibility for field:', fieldId);
    }
  };

  if (fields.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">📋</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Form alanı boş
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            Formunuza alan eklemek için sol taraftaki alan türlerinden birini seçin.
            Alanları sürükleyip bırakarak sırasını değiştirebilirsiniz.
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-left">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">
              Hızlı başlangıç ipuçları:
            </h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Alan eklemek için sol paneldeki alan türlerine tıklayın</li>
              <li>• Alan ayarlarını düzenlemek için alana tıklayın</li>
              <li>• Alanları yeniden sıralamak için sürükleyin</li>
              <li>• Ayarlar sekmesinden form genel ayarlarını yapılandırın</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Form Alanları ({fields.length})
          </h3>
          <p className="text-xs text-gray-500">
            Alanları sürükleyerek yeniden sıralayabilirsiniz
          </p>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={fields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            {fields.map((field) => (
              <SortableField
                key={field.id}
                field={field}
                isSelected={selectedFieldId === field.id}
                onSelect={onFieldSelect}
                onDelete={onFieldDelete}
                onDuplicate={handleDuplicate}
                onToggleVisibility={handleToggleVisibility}
              />
            ))}
          </SortableContext>
        </DndContext>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <p className="text-sm text-gray-500 text-center">
            Daha fazla alan eklemek için sol paneldeki alan türlerini kullanın
          </p>
        </div>
      </div>
    </div>
  );
}
