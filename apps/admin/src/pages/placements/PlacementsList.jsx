import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Filter,
  Eye,
  EyeOff,
  Edit2,
  Copy,
  Archive,
  Trash2,
  TrendingUp,
  Users
} from 'lucide-react';
import { apiClient as api } from '../../lib/api';

export default function PlacementsList() {
  const [placements, setPlacements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stats, setStats] = useState({});

  useEffect(() => {
    fetchPlacements();
  }, [searchTerm, statusFilter]);

  const fetchPlacements = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      
      const response = await api.get(`/placements?${params}`);
      setPlacements(response.data.placements);
      
      // Fetch stats for each placement
      fetchStats(response.data.placements);
    } catch (error) {
      console.error('Failed to fetch placements:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async (placementsList) => {
    const statsMap = {};
    await Promise.all(
      placementsList.map(async (placement) => {
        try {
          const response = await api.get(`/placements/${placement._id}/stats/totals`);
          statsMap[placement._id] = response.data;
        } catch (error) {
          console.error(`Failed to fetch stats for ${placement._id}:`, error);
          statsMap[placement._id] = {};
        }
      })
    );
    setStats(statsMap);
  };

  const handleDuplicate = async (id, name) => {
    try {
      await api.post(`/placements/${id}/duplicate`, { name: `${name} (Copy)` });
      fetchPlacements();
    } catch (error) {
      console.error('Failed to duplicate:', error);
    }
  };

  const handleArchive = async (id) => {
    try {
      await api.post(`/placements/${id}/archive`);
      fetchPlacements();
    } catch (error) {
      console.error('Failed to archive:', error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Bu yerleşimi silmek istediğinizden emin misiniz?')) return;
    
    try {
      await api.delete(`/placements/${id}`);
      fetchPlacements();
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-green-100 text-green-800',
      draft: 'bg-gray-100 text-gray-800',
      paused: 'bg-yellow-100 text-yellow-800',
      archived: 'bg-red-100 text-red-800'
    };
    
    const labels = {
      active: 'Aktif',
      draft: 'Taslak',
      paused: 'Duraklatıldı',
      archived: 'Arşivlendi'
    };
    
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Yerleşimler</h1>
          <p className="text-gray-500 mt-1">Popup'ları, banner'ları ve inline içerikleri yönetin</p>
        </div>
        <Link
          to="/placements/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Yeni Yerleşim
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Yerleşimlerde ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="active">Aktif</option>
            <option value="draft">Taslak</option>
            <option value="paused">Duraklatıldı</option>
            <option value="archived">Arşivlendi</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : placements.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <div className="text-gray-400 mb-4">
            <Eye size={48} className="mx-auto" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Henüz yerleşim yok</h3>
          <p className="text-gray-500 mb-4">Başlamak için ilk yerleşiminizi oluşturun</p>
          <Link
            to="/placements/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={20} />
            Yerleşim Oluştur
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
                  Durum
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Deneyimler
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gösterimler
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dönüşümler
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Oran
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  İşlemler
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {placements.map((placement) => {
                const placementStats = stats[placement._id] || {};
                return (
                  <tr key={placement._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{placement.name}</div>
                        <div className="text-sm text-gray-500">{placement.slug}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(placement.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {placement.experiences?.length || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        <Eye size={16} className="mr-1 text-gray-400" />
                        {placementStats.impressions?.toLocaleString() || 0}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        <TrendingUp size={16} className="mr-1 text-gray-400" />
                        {placementStats.conversions?.toLocaleString() || 0}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {placementStats.conversionRate || '0.00'}%
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <Link
                          to={`/placements/${placement._id}`}
                          className="text-blue-600 hover:text-blue-900"
                          title="Düzenle"
                        >
                          <Edit2 size={18} />
                        </Link>
                        <Link
                          to={`/placements/${placement._id}/analytics`}
                          className="text-green-600 hover:text-green-900"
                          title="Analitik"
                        >
                          <TrendingUp size={18} />
                        </Link>
                        <button
                          onClick={() => handleDuplicate(placement._id, placement.name)}
                          className="text-gray-600 hover:text-gray-900"
                          title="Kopyala"
                        >
                          <Copy size={18} />
                        </button>
                        <button
                          onClick={() => handleArchive(placement._id)}
                          className="text-orange-600 hover:text-orange-900"
                          title="Arşivle"
                        >
                          <Archive size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(placement._id)}
                          className="text-red-600 hover:text-red-900"
                          title="Sil"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
