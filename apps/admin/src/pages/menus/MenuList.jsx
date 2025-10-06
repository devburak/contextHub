import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Edit2,
  Copy,
  Trash2,
  List,
  MapPin
} from 'lucide-react';
import { apiClient as api } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

export default function MenuList() {
  const toast = useToast();
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');

  useEffect(() => {
    fetchMenus();
  }, [searchTerm, statusFilter, locationFilter]);

  const fetchMenus = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (locationFilter !== 'all') params.append('location', locationFilter);
      
      const response = await api.get(`/menus?${params}`);
      setMenus(response.data.menus);
    } catch (error) {
      console.error('Failed to fetch menus:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (id, name) => {
    try {
      await api.post(`/menus/${id}/duplicate`, { name: `${name} (Kopya)` });
      toast.success('Menü başarıyla kopyalandı!');
      fetchMenus();
    } catch (error) {
      console.error('Failed to duplicate:', error);
      toast.error('Menü kopyalanamadı: ' + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Bu menüyü silmek istediğinizden emin misiniz?')) return;
    
    try {
      await api.delete(`/menus/${id}`);
      toast.success('Menü başarıyla silindi!');
      fetchMenus();
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error('Menü silinemedi: ' + error.message);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-green-100 text-green-800',
      draft: 'bg-gray-100 text-gray-800',
      archived: 'bg-red-100 text-red-800'
    };
    
    const labels = {
      active: 'Aktif',
      draft: 'Taslak',
      archived: 'Arşivlendi'
    };
    
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getLocationBadge = (location) => {
    const styles = {
      header: 'bg-blue-100 text-blue-800',
      footer: 'bg-purple-100 text-purple-800',
      sidebar: 'bg-yellow-100 text-yellow-800',
      mobile: 'bg-pink-100 text-pink-800',
      custom: 'bg-gray-100 text-gray-800'
    };
    
    const labels = {
      header: 'Üst Menü',
      footer: 'Alt Menü',
      sidebar: 'Yan Menü',
      mobile: 'Mobil Menü',
      custom: 'Özel'
    };
    
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[location]}`}>
        {labels[location] || location}
      </span>
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menüler</h1>
          <p className="text-gray-500 mt-1">Site menülerini yönetin</p>
        </div>
        <Link
          to="/menus/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Yeni Menü
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Menülerde ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tüm Konumlar</option>
            <option value="header">Üst Menü</option>
            <option value="footer">Alt Menü</option>
            <option value="sidebar">Yan Menü</option>
            <option value="mobile">Mobil Menü</option>
            <option value="custom">Özel</option>
          </select>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="active">Aktif</option>
            <option value="draft">Taslak</option>
            <option value="archived">Arşivlendi</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : menus.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <div className="text-gray-400 mb-4">
            <List size={48} className="mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz menü yok</h3>
          <p className="text-gray-500 mb-4">Başlamak için ilk menünüzü oluşturun</p>
          <Link
            to="/menus/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={20} />
            Menü Oluştur
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  İsim
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Konum
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Durum
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Öğe Sayısı
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Son Güncelleme
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  İşlemler
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {menus.map((menu) => (
                <tr key={menu._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{menu.name}</div>
                      <div className="text-sm text-gray-500">{menu.slug}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getLocationBadge(menu.location)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(menu.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center">
                      <List size={16} className="mr-1 text-gray-400" />
                      {menu.meta?.totalItems || 0} öğe
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(menu.updatedAt).toLocaleDateString('tr-TR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <Link
                        to={`/menus/${menu._id}`}
                        className="text-blue-600 hover:text-blue-900"
                        title="Düzenle"
                      >
                        <Edit2 size={18} />
                      </Link>
                      <button
                        onClick={() => handleDuplicate(menu._id, menu.name)}
                        className="text-gray-600 hover:text-gray-900"
                        title="Kopyala"
                      >
                        <Copy size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(menu._id)}
                        className="text-red-600 hover:text-red-900"
                        title="Sil"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
