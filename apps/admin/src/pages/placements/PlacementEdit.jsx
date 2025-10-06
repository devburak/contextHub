import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Plus, X } from 'lucide-react';
import { apiClient as api } from '../../lib/api';
import ExperienceBuilder from './components/ExperienceBuilder';

export default function PlacementEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [placement, setPlacement] = useState({
    name: '',
    slug: '',
    description: '',
    status: 'draft',
    experiences: []
  });

  useEffect(() => {
    if (!isNew) {
      fetchPlacement();
    }
  }, [id]);

  const fetchPlacement = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/placements/${id}`);
      setPlacement(response.data);
    } catch (error) {
      console.error('Failed to fetch placement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      if (isNew) {
        const response = await api.post('/placements', placement);
        navigate(`/placements/${response.data._id}`);
      } else {
        await api.put(`/placements/${id}`, placement);
      }

      alert('Yerleşim başarıyla kaydedildi!');
    } catch (error) {
      console.error('Failed to save placement:', error);
      alert('Yerleşim kaydedilemedi: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddExperience = () => {
    setPlacement({
      ...placement,
      experiences: [
        ...placement.experiences,
        {
          name: `Experience ${placement.experiences.length + 1}`,
          status: 'active',
          weight: 100,
          priority: 50,
          content: {
            type: 'text',
            title: '',
            message: ''
          },
          ui: {
            variant: 'modal',
            position: 'fixed',
            showCloseButton: true
          },
          targeting: {
            paths: [],
            locale: [],
            device: [],
            browser: []
          },
          trigger: {
            type: 'onLoad'
          }
        }
      ]
    });
  };

  const handleUpdateExperience = (index, updatedExperience) => {
    const newExperiences = [...placement.experiences];
    newExperiences[index] = updatedExperience;
    setPlacement({ ...placement, experiences: newExperiences });
  };

  const handleDeleteExperience = (index) => {
    if (placement.experiences.length === 1) {
      alert('Son deneyim silinemez');
      return;
    }
    
    const newExperiences = placement.experiences.filter((_, i) => i !== index);
    setPlacement({ ...placement, experiences: newExperiences });
  };

  const generateSlug = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/placements" className="text-gray-600 hover:text-gray-900">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isNew ? 'Yeni Yerleşim' : 'Yerleşimi Düzenle'}
            </h1>
            <p className="text-gray-500 mt-1">
              {isNew ? 'Yeni bir yerleşim oluşturun' : `Düzenleniyor: ${placement.name}`}
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

      {/* Basic Info */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Temel Bilgiler</h2>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              İsim *
            </label>
            <input
              type="text"
              value={placement.name}
              onChange={(e) => {
                const name = e.target.value;
                setPlacement({
                  ...placement,
                  name,
                  slug: isNew ? generateSlug(name) : placement.slug
                });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Hoşgeldin Popup'ı"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Slug *
            </label>
            <input
              type="text"
              value={placement.slug}
              onChange={(e) => setPlacement({ ...placement, slug: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="hosgeldin-popup"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Durum
            </label>
            <select
              value={placement.status}
              onChange={(e) => setPlacement({ ...placement, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="draft">Taslak</option>
              <option value="active">Aktif</option>
              <option value="paused">Duraklatıldı</option>
              <option value="archived">Arşivlendi</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Açıklama
            </label>
            <textarea
              value={placement.description}
              onChange={(e) => setPlacement({ ...placement, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Bu yerleşimi açıklayın..."
            />
          </div>
        </div>
      </div>

      {/* Experiences */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Deneyimler (A/B Testleri)</h2>
          <button
            onClick={handleAddExperience}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
          >
            <Plus size={18} />
            Deneyim Ekle
          </button>
        </div>

        {placement.experiences.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="mb-4">Henüz deneyim yok. Başlamak için bir tane ekleyin.</p>
            <button
              onClick={handleAddExperience}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus size={20} />
              İlk Deneyimi Ekle
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {placement.experiences.map((experience, index) => (
              <ExperienceBuilder
                key={index}
                experience={experience}
                index={index}
                onUpdate={(updated) => handleUpdateExperience(index, updated)}
                onDelete={() => handleDeleteExperience(index)}
                canDelete={placement.experiences.length > 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
