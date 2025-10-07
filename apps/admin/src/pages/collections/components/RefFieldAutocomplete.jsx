import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { collectionsApi } from '../../../lib/api/collections.js'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'

/**
 * RefFieldAutocomplete - Ref type field'lar için autocomplete component'i
 * 
 * @param {Object} props
 * @param {string} props.refTarget - Hedef koleksiyon key'i (örn: "donem")
 * @param {string|string[]} props.value - Seçili değer(ler) (entry ID'leri)
 * @param {Function} props.onChange - Değer değişikliği callback'i
 * @param {boolean} props.multiple - Çoklu seçim desteği
 * @param {string} props.placeholder - Input placeholder
 */
export default function RefFieldAutocomplete({ 
  refTarget, 
  value, 
  onChange, 
  multiple = false,
  placeholder = 'Aramaya başlayın...'
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selectedEntries, setSelectedEntries] = useState([])
  const wrapperRef = useRef(null)

  // Seçili entry'lerin detaylarını çek
  const selectedIds = multiple 
    ? (Array.isArray(value) ? value : [value].filter(Boolean))
    : (value ? [value] : [])

  // Ref target koleksiyon entry'lerini çek
  const { data: entriesData, isLoading, error } = useQuery({
    queryKey: ['collection-entries', refTarget, searchQuery],
    queryFn: async () => {
      if (!refTarget) return { items: [], total: 0 }
      console.log('🔍 RefFieldAutocomplete API call:', { refTarget, searchQuery })
      const result = await collectionsApi.listCollectionEntries({
        collectionKey: refTarget,
        q: searchQuery,
        limit: 20,
        // Tüm statusleri çek (draft, published, archived)
        // status parametresi göndermeyerek hepsini al
      })
      console.log('📦 RefFieldAutocomplete API response:', result)
      return result
    },
    enabled: !!refTarget && isOpen
  })

  // Seçili entry'lerin detaylarını çek
  const { data: selectedEntriesData } = useQuery({
    queryKey: ['collection-entries-selected', refTarget, selectedIds.join(',')],
    queryFn: async () => {
      if (!refTarget || selectedIds.length === 0) return { items: [] }
      return await collectionsApi.listCollectionEntries({
        collectionKey: refTarget,
        filter: { _id: { $in: selectedIds } },
        limit: selectedIds.length
      })
    },
    enabled: !!refTarget && selectedIds.length > 0
  })

  useEffect(() => {
    if (selectedEntriesData?.items) {
      setSelectedEntries(selectedEntriesData.items)
    }
  }, [selectedEntriesData])

  // Dışarı tıklandığında dropdown'u kapat
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (entry) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : []
      const isAlreadySelected = currentValues.includes(entry._id)
      
      if (isAlreadySelected) {
        onChange(currentValues.filter(id => id !== entry._id))
        setSelectedEntries(prev => prev.filter(e => e._id !== entry._id))
      } else {
        onChange([...currentValues, entry._id])
        setSelectedEntries(prev => [...prev, entry])
      }
    } else {
      onChange(entry._id)
      setSelectedEntries([entry])
      setIsOpen(false)
      setSearchQuery('')
    }
  }

  const handleRemove = (entryId) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : []
      onChange(currentValues.filter(id => id !== entryId))
      setSelectedEntries(prev => prev.filter(e => e._id !== entryId))
    } else {
      onChange('')
      setSelectedEntries([])
    }
  }

  const getEntryTitle = (entry) => {
    // Entry'nin title, name veya ilk string field'ını kullan
    return entry.data?.title || entry.data?.name || entry.data?.baslik || 
           Object.values(entry.data || {}).find(v => typeof v === 'string') || 
           entry._id
  }

  const entries = entriesData?.items || []
  const isSelected = (entryId) => selectedIds.includes(entryId)

  if (!refTarget) {
    return (
      <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
        ⚠️ Hedef koleksiyon tanımlanmamış
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="relative">
      {/* Seçili öğeler */}
      {selectedEntries.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {selectedEntries.map((entry) => (
            <span
              key={entry._id}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-sm text-blue-700 border border-blue-200"
            >
              <span className="font-medium">{getEntryTitle(entry)}</span>
              <button
                type="button"
                onClick={() => handleRemove(entry._id)}
                className="hover:bg-blue-100 rounded p-0.5 transition-colors"
              >
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Arama input'u */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-md border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              setIsOpen(false)
            }}
            className="absolute inset-y-0 right-0 flex items-center pr-3 hover:text-gray-700"
          >
            <XMarkIcon className="h-4 w-4 text-gray-400" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full rounded-md bg-white shadow-lg border border-gray-200 max-h-60 overflow-auto">
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-gray-500">Yükleniyor...</div>
          ) : error ? (
            <div className="px-4 py-3 text-sm text-red-600">
              <div className="font-medium">Hata: {error.message}</div>
              <div className="text-xs mt-1">Koleksiyon: {refTarget}</div>
            </div>
          ) : entries.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">
              <div>{searchQuery ? 'Sonuç bulunamadı' : 'Kayıt bulunamadı'}</div>
              <div className="text-xs mt-1 text-gray-400">Koleksiyon: {refTarget}</div>
            </div>
          ) : (
            <ul className="py-1">
              {entries.map((entry) => {
                const selected = isSelected(entry._id)
                return (
                  <li key={entry._id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(entry)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                        selected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{getEntryTitle(entry)}</span>
                        {selected && (
                          <span className="text-blue-600">✓</span>
                        )}
                      </div>
                      {entry.data?.description && (
                        <div className="text-xs text-gray-500 mt-0.5 truncate">
                          {entry.data.description}
                        </div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Yardım metni */}
      <p className="mt-1 text-xs text-gray-500">
        <span className="font-medium">{refTarget}</span> koleksiyonundan seçim yapın
      </p>
    </div>
  )
}
