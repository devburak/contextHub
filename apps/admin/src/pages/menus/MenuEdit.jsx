import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Edit2, Trash2, GripVertical, ChevronRight } from 'lucide-react';
import { apiClient as api } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

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

  const renderMenuItem = (item, level = 0) => {
    return (
      <div key={item._id} className="mb-2">
        <div 
          className={`flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50`}
          style={{ marginLeft: `${level * 24}px` }}
        >
          <GripVertical size={16} className="text-gray-400 cursor-move" />
          
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {level > 0 && <ChevronRight size={16} className="text-gray-400" />}
              <span className="font-medium text-gray-900">{item.title}</span>
              {!item.isVisible && (
                <span className="text-xs text-gray-500">(Gizli)</span>
              )}
            </div>
            <div className="text-sm text-gray-500">
              {item.type === 'custom' && item.url}
              {item.type === 'external' && item.url}
              {item.type !== 'custom' && item.type !== 'external' && `${item.type}: ${item.reference?.id}`}
            </div>
          </div>
          
          <div className="flex gap-2">
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
        
        {item.children && item.children.length > 0 && (
          <div className="mt-1">
            {item.children.map(child => renderMenuItem(child, level + 1))}
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
              <h2 className="text-lg font-semibold">Menü Öğeleri</h2>
              <button
                onClick={handleAddItem}
                disabled={isNew}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50"
              >
                <Plus size={18} />
                Öğe Ekle
              </button>
            </div>

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
              <div className="space-y-2">
                {tree.map(item => renderMenuItem(item))}
              </div>
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
