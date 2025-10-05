import {
  Bars3BottomLeftIcon,
  AtSymbolIcon,
  PhoneIcon,
  HashtagIcon,
  CalendarIcon,
  DocumentArrowUpIcon,
  StarIcon,
  EyeSlashIcon,
  ListBulletIcon,
  CheckCircleIcon,
  RectangleGroupIcon,
  QueueListIcon,
} from '@heroicons/react/24/outline';

const fieldTypes = [
  {
    type: 'text',
    label: 'Metin',
    icon: Bars3BottomLeftIcon,
    description: 'Tek satırlık metin girişi',
  },
  {
    type: 'textarea',
    label: 'Uzun Metin',
    icon: QueueListIcon,
    description: 'Çok satırlı metin alanı',
  },
  {
    type: 'email',
    label: 'E-posta',
    icon: AtSymbolIcon,
    description: 'E-posta adresi girişi',
  },
  {
    type: 'phone',
    label: 'Telefon',
    icon: PhoneIcon,
    description: 'Telefon numarası girişi',
  },
  {
    type: 'number',
    label: 'Sayı',
    icon: HashtagIcon,
    description: 'Sayısal değer girişi',
  },
  {
    type: 'date',
    label: 'Tarih',
    icon: CalendarIcon,
    description: 'Tarih seçici',
  },
  {
    type: 'select',
    label: 'Açılır Liste',
    icon: ListBulletIcon,
    description: 'Tek seçimli açılır menü',
  },
  {
    type: 'radio',
    label: 'Radyo Buton',
    icon: CheckCircleIcon,
    description: 'Tek seçimli buton grubu',
  },
  {
    type: 'checkbox',
    label: 'Onay Kutusu',
    icon: CheckCircleIcon,
    description: 'Çoklu seçim kutuları',
  },
  {
    type: 'file',
    label: 'Dosya Yükleme',
    icon: DocumentArrowUpIcon,
    description: 'Dosya yükleme alanı',
  },
  {
    type: 'rating',
    label: 'Derecelendirme',
    icon: StarIcon,
    description: 'Yıldız puanlama',
  },
  {
    type: 'hidden',
    label: 'Gizli Alan',
    icon: EyeSlashIcon,
    description: 'Görünmeyen veri alanı',
  },
  {
    type: 'section',
    label: 'Bölüm Başlığı',
    icon: RectangleGroupIcon,
    description: 'Form bölümü ayırıcı',
  },
];

export default function FieldPalette({ onFieldAdd }) {
  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Alan Türleri</h3>
      <div className="space-y-2">
        {fieldTypes.map((fieldType) => {
          const Icon = fieldType.icon;
          return (
            <button
              key={fieldType.type}
              onClick={() => onFieldAdd(fieldType.type)}
              className="w-full flex items-start p-3 rounded-lg border-2 border-gray-200 hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-left group"
            >
              <div className="flex-shrink-0">
                <Icon className="h-5 w-5 text-gray-400 group-hover:text-indigo-600" />
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-600">
                  {fieldType.label}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {fieldType.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h4 className="text-xs font-semibold text-blue-900 mb-2">💡 İpucu</h4>
        <p className="text-xs text-blue-700">
          Forma alan eklemek için yukarıdaki alan türlerinden birine tıklayın.
        </p>
      </div>
    </div>
  );
}
