import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Edit2, Trash2, GripVertical, ChevronRight, ChevronDown, ArrowUpToLine } from 'lucide-react';
import { apiClient as api } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export default function MenuEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState({
    name: '',
    slug: '',
    description: '',
    location: 'header',
    status: 'draft',
    items: [],
    meta: {
      maxDepth: 3
    }
  });
  
  const [editingItem, setEditingItem] = useState(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [collapsedItems, setCollapsedItems] = useState({});

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (!isNew) {
      fetchMenu();
    }
  }, [id]);

  const fetchMenu = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/menus/${id}`);
      setMenu(response.data);
    } catch (error) {
      console.error('Failed to fetch menu:', error);
      toast.error('Menü yüklenemedi: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      if (isNew) {
        const response = await api.post('/menus', menu);
        navigate(`/menus/${response.data._id}`);
      } else {
        await api.put(`/menus/${id}`, menu);
      }

      toast.success('Menü başarıyla kaydedildi!');
    } catch (error) {
      console.error('Failed to save menu:', error);
      toast.error('Menü kaydedilemedi: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = () => {
    setEditingItem({
      title: '',
      type: 'custom',
      url: '',
      target: '_self',
      parentId: null,
      order: menu.items.length,
      isVisible: true
    });
    setShowItemForm(true);
  };

  const handleEditItem = (item) => {
    setEditingItem({ ...item });
    setShowItemForm(true);
  };

  const handleSaveItem = async () => {
    try {
      if (editingItem._id) {
        // Update existing item
        const response = await api.put(`/menus/${id}/items/${editingItem._id}`, editingItem);
        setMenu(response.data);
        toast.success('Menü öğesi güncellendi!');
      } else {
        // Add new item
        const response = await api.post(`/menus/${id}/items`, editingItem);
        setMenu(response.data);
        toast.success('Menü öğesi eklendi!');
      }
      
      setShowItemForm(false);
      setEditingItem(null);
    } catch (error) {
      console.error('Failed to save item:', error);
      toast.error('Menü öğesi kaydedilemedi: ' + error.message);
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!confirm('Bu menü öğesini ve alt öğelerini silmek istediğinizden emin misiniz?')) return;
    
    try {
      const response = await api.delete(`/menus/${id}/items/${itemId}`);
      setMenu(response.data);
      toast.success('Menü öğesi silindi!');
    } catch (error) {
      console.error('Failed to delete item:', error);
      toast.error('Menü öğesi silinemedi: ' + error.message);
    }
  };

  const generateSlug = (name) => {
    return name
      .toLowerCase()
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const toggleCollapse = (itemId) => {
    setCollapsedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragOver = (event) => {
    setOverId(event.over?.id || null);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    setActiveId(null);
    setOverId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const activeItem = menu.items.find(item => item._id === active.id);
    const overItem = menu.items.find(item => item._id === over.id);

    if (!activeItem || !overItem) return;

    // Check if trying to move item to its own child (prevent circular reference)
    const isDescendant = (parentId, childId) => {
      const parent = menu.items.find(item => item._id === parentId);
      if (!parent) return false;
      if (parent.parentId?.toString() === childId.toString()) return true;
      if (parent.parentId) return isDescendant(parent.parentId, childId);
      return false;
    };

    if (isDescendant(over.id, active.id)) {
      toast.error('Bir menü öğesini kendi alt öğesinin altına taşıyamazsınız!');
      return;
    }

    // Determine if we're making it a sibling or a child
    // If the over item has the same parent as active, they're siblings
    // Otherwise, make active a child of over

    const activeParentId = activeItem.parentId?.toString() || null;
    const overParentId = overItem.parentId?.toString() || null;

    let newParentId;
    let newOrder;

    // Simple approach: make it a child of the item we dropped on
    newParentId = over.id;

    // Get siblings in new parent
    const siblings = menu.items.filter(item =>
      (item.parentId?.toString() || null) === (newParentId?.toString() || null) &&
      item._id !== active.id
    ).sort((a, b) => a.order - b.order);

    newOrder = siblings.length;

    // Check depth limit
    const getDepth = (itemId) => {
      const item = menu.items.find(i => i._id === itemId);
      if (!item || !item.parentId) return 0;
      return 1 + getDepth(item.parentId);
    };

    const newDepth = getDepth(newParentId) + 1;
    if (newDepth > (menu.meta?.maxDepth || 3)) {
      toast.error(`Maksimum derinlik (${menu.meta?.maxDepth || 3}) aşılamaz!`);
      return;
    }

    // Update all items with new positions
    const updates = menu.items.map(item => {
      if (item._id === active.id) {
        return {
          id: item._id,
          order: newOrder,
          parentId: newParentId
        };
      }
      return {
        id: item._id,
        order: item.order,
        parentId: item.parentId || null
      };
    });

    try {
      const response = await api.post(`/menus/${id}/reorder`, { items: updates });
      setMenu(response.data);
      toast.success('Menü sıralaması güncellendi!');
    } catch (error) {
      console.error('Failed to reorder items:', error);
      toast.error('Sıralama güncellenemedi: ' + error.message);
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setOverId(null);
  };

  // Build tree structure for display
  const buildTree = (items, parentId = null) => {
    return items
      .filter(item => {
        const itemParentId = item.parentId ? item.parentId.toString() : null;
        return itemParentId === (parentId ? parentId.toString() : null);
      })
      .sort((a, b) => a.order - b.order)
      .map(item => ({
        ...item,
        children: buildTree(items, item._id)
      }));
  };

  // Sortable Menu Item Component
  const SortableMenuItem = ({ item, level = 0 }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: item._id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      marginLeft: `${level * 24}px`,
    };

    const hasChildren = item.children && item.children.length > 0;
    const isCollapsed = collapsedItems[item._id];
    const isOver = overId === item._id;

    return (
      <div key={item._id} className="mb-2">
        <div
          ref={setNodeRef}
          style={style}
          className={`flex items-center gap-2 p-3 bg-white border rounded-lg hover:bg-gray-50 transition-colors ${
            isOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
          } ${isDragging ? 'shadow-lg' : ''}`}
        >
          <div {...attributes} {...listeners} className="cursor-move touch-none">
            <GripVertical size={16} className="text-gray-400" />
          </div>

          {hasChildren && (
            <button
              onClick={() => toggleCollapse(item._id)}
              className="text-gray-400 hover:text-gray-600"
            >
              {isCollapsed ? (
                <ChevronRight size={16} />
              ) : (
                <ChevronDown size={16} />
              )}
            </button>
          )}

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{item.title}</span>
              {!item.isVisible && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">Gizli</span>
              )}
              {level > 0 && (
                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded">Alt Menü</span>
              )}
            </div>
            <div className="text-sm text-gray-500 truncate">
              {item.type === 'custom' && item.url}
              {item.type === 'external' && item.url}
              {item.type !== 'custom' && item.type !== 'external' && `${item.type}: ${item.reference?.id}`}
            </div>
          </div>

          <div className="flex gap-2">
            {level > 0 && (
              <button
                onClick={async () => {
                  try {
                    const updates = menu.items.map(i => ({
                      id: i._id,
                      order: i._id === item._id ? 0 : i.order,
                      parentId: i._id === item._id ? null : (i.parentId || null)
                    }));
                    const response = await api.post(`/menus/${id}/reorder`, { items: updates });
                    setMenu(response.data);
                    toast.success('Menü öğesi ana menüye taşındı!');
                  } catch (error) {
                    toast.error('Taşıma başarısız: ' + error.message);
                  }
                }}
                className="text-purple-600 hover:text-purple-900"
                title="Ana menüye çıkar"
              >
                <ArrowUpToLine size={16} />
              </button>
            )}
            <button
              onClick={() => handleEditItem(item)}
              className="text-blue-600 hover:text-blue-900"
              title="Düzenle"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={() => handleDeleteItem(item._id)}
              className="text-red-600 hover:text-red-900"
              title="Sil"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {hasChildren && !isCollapsed && (
          <div className="mt-1">
            {item.children.map(child => (
              <SortableMenuItem key={child._id} item={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const tree = buildTree(menu.items);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/menus" className="text-gray-600 hover:text-gray-900">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isNew ? 'Yeni Menü' : 'Menüyü Düzenle'}
            </h1>
            <p className="text-gray-500 mt-1">
              {isNew ? 'Yeni bir menü oluşturun' : `Düzenleniyor: ${menu.name}`}
            </p>
          </div>
        </div>
        
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={20} />
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Basic Info */}
        <div className="col-span-1 space-y-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Temel Bilgiler</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  İsim *
                </label>
                <input
                  type="text"
                  value={menu.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setMenu({
                      ...menu,
                      name,
                      slug: isNew ? generateSlug(name) : menu.slug
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Ana Menü"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Slug *
                </label>
                <input
                  type="text"
                  value={menu.slug}
                  onChange={(e) => setMenu({ ...menu, slug: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="ana-menu"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Konum
                </label>
                <select
                  value={menu.location}
                  onChange={(e) => setMenu({ ...menu, location: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="header">Üst Menü</option>
                  <option value="footer">Alt Menü</option>
                  <option value="sidebar">Yan Menü</option>
                  <option value="mobile">Mobil Menü</option>
                  <option value="custom">Özel</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Durum
                </label>
                <select
                  value={menu.status}
                  onChange={(e) => setMenu({ ...menu, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="draft">Taslak</option>
                  <option value="active">Aktif</option>
                  <option value="archived">Arşivlendi</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Açıklama
                </label>
                <textarea
                  value={menu.description}
                  onChange={(e) => setMenu({ ...menu, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Bu menüyü açıklayın..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Menu Items */}
        <div className="col-span-2">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-semibold">Menü Öğeleri</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Sürükle-bırak ile sıralayın ve iç içe menü yapısı oluşturun
                </p>
              </div>
              <button
                onClick={handleAddItem}
                disabled={isNew}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50"
              >
                <Plus size={18} />
                Öğe Ekle
              </button>
            </div>

            {!isNew && tree.length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <div className="text-blue-600 mt-0.5">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Nasıl Kullanılır?</p>
                    <ul className="space-y-1 text-xs">
                      <li>• Menü öğelerini sürükleyip başka öğelerin üzerine bırakarak alt menü oluşturun</li>
                      <li>• {ChevronDown && <span className="inline-flex"><ChevronDown size={12} /></span>} butonu ile alt menüleri açıp kapatın</li>
                      <li>• <ArrowUpToLine className="inline" size={12} /> butonu ile alt menüyü ana menüye çıkarın</li>
                      <li>• Maksimum {menu.meta?.maxDepth || 3} seviye derinlik desteklenir</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {isNew ? (
              <div className="text-center py-12 text-gray-500">
                <p>Önce menüyü kaydedin, sonra öğe ekleyebilirsiniz.</p>
              </div>
            ) : tree.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="mb-4">Henüz menü öğesi yok.</p>
                <button
                  onClick={handleAddItem}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus size={20} />
                  İlk Öğeyi Ekle
                </button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <SortableContext
                  items={menu.items.map(item => item._id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {tree.map(item => (
                      <SortableMenuItem key={item._id} item={item} />
                    ))}
                  </div>
                </SortableContext>

                <DragOverlay>
                  {activeId ? (
                    <div className="p-3 bg-white border-2 border-blue-500 rounded-lg shadow-xl">
                      <div className="font-medium text-gray-900">
                        {menu.items.find(item => item._id === activeId)?.title}
                      </div>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </div>
      </div>

      {/* Menu Item Form Modal */}
      {showItemForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingItem._id ? 'Menü Öğesini Düzenle' : 'Yeni Menü Öğesi'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Başlık *
                </label>
                <input
                  type="text"
                  value={editingItem.title}
                  onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Ana Sayfa"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tip
                </label>
                <select
                  value={editingItem.type}
                  onChange={(e) => setEditingItem({ ...editingItem, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="custom">Özel URL</option>
                  <option value="external">Harici Link</option>
                  <option value="page">Sayfa</option>
                  <option value="category">Kategori</option>
                  <option value="content">İçerik</option>
                  <option value="form">Form</option>
                </select>
              </div>

              {(editingItem.type === 'custom' || editingItem.type === 'external') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    URL *
                  </label>
                  <input
                    type="text"
                    value={editingItem.url}
                    onChange={(e) => setEditingItem({ ...editingItem, url: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder={editingItem.type === 'external' ? 'https://example.com' : '/about'}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hedef
                </label>
                <select
                  value={editingItem.target}
                  onChange={(e) => setEditingItem({ ...editingItem, target: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="_self">Aynı pencere</option>
                  <option value="_blank">Yeni pencere</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CSS Sınıfları
                </label>
                <input
                  type="text"
                  value={editingItem.cssClasses || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, cssClasses: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="menu-item-home active"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Üst Menü
                </label>
                <select
                  value={editingItem.parentId || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, parentId: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">-- Ana Menü Öğesi --</option>
                  {menu.items
                    .filter(item => item._id !== editingItem._id) // Kendi kendinin altı olamaz
                    .map(item => (
                      <option key={item._id} value={item._id}>
                        {item.title}
                      </option>
                    ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Bu öğeyi başka bir menü öğesinin altında göstermek için üst menüyü seçin
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Açıklama (Tooltip)
                </label>
                <input
                  type="text"
                  value={editingItem.description || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Ana sayfaya git"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isVisible"
                  checked={editingItem.isVisible}
                  onChange={(e) => setEditingItem({ ...editingItem, isVisible: e.target.checked })}
                  className="mr-2"
                />
                <label htmlFor="isVisible" className="text-sm text-gray-700">
                  Görünür
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowItemForm(false);
                  setEditingItem(null);
                }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleSaveItem}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
