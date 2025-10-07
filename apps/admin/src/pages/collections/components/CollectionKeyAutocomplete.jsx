import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { collectionsApi } from '../../../lib/api/collections.js'
import { MagnifyingGlassIcon, XMarkIcon, CheckIcon } from '@heroicons/react/24/outline'

/**
 * CollectionKeyAutocomplete - Koleksiyon key'leri için autocomplete component'i
 * 
 * @param {Object} props
 * @param {string} props.value - Seçili koleksiyon key'i
 * @param {Function} props.onChange - Değer değişikliği callback'i
 * @param {string} props.placeholder - Input placeholder
 * @param {string} props.excludeKey - Hariç tutulacak key (mevcut koleksiyon)
 */
export default function CollectionKeyAutocomplete({ 
  value, 
  onChange, 
  placeholder = 'Koleksiyon key girin veya seçin',
  excludeKey = null
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value || '')
  const wrapperRef = useRef(null)

  // Koleksiyon listesini çek
  const { data: collections = [], isLoading } = useQuery({
    queryKey: ['collections', 'list'],
    queryFn: async () => {
      const items = await collectionsApi.listCollectionTypes({ status: 'active' })
      return items || []
    }
  })

  // Value değişince input'u güncelle
  useEffect(() => {
    setInputValue(value || '')
  }, [value])

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

  // Koleksiyonları filtrele
  const filteredCollections = collections
    .filter(col => {
      // Mevcut koleksiyonu hariç tut
      if (excludeKey && col.key === excludeKey) return false
      
      // Arama filtresi
      if (!inputValue) return true
      const search = inputValue.toLowerCase()
      
      // name obje veya string olabilir
      const nameStr = typeof col.name === 'object' 
        ? (col.name?.tr || col.name?.en || '')
        : (col.name || '')
      
      return (
        col.key?.toLowerCase().includes(search) ||
        nameStr.toLowerCase().includes(search)
      )
    })
    .slice(0, 10) // İlk 10 sonuç

  const handleSelect = (collectionKey) => {
    setInputValue(collectionKey)
    onChange(collectionKey)
    setIsOpen(false)
  }

  const handleInputChange = (e) => {
    const newValue = e.target.value
    setInputValue(newValue)
    onChange(newValue)
    if (!isOpen && newValue) {
      setIsOpen(true)
    }
  }

  const handleClear = () => {
    setInputValue('')
    onChange('')
    setIsOpen(false)
  }

  const isSelectedCollection = (key) => value === key

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
        </div>
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-md border border-gray-300 pl-9 pr-10 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        {inputValue && (
          <button
            type="button"
            onClick={handleClear}
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
          ) : filteredCollections.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">
              {inputValue ? (
                <>
                  <div className="font-medium text-gray-700 mb-1">Koleksiyon bulunamadı</div>
                  <div className="text-xs">
                    Girdiğiniz key kullanılacak: <span className="font-mono bg-gray-100 px-1 py-0.5 rounded">{inputValue}</span>
                  </div>
                </>
              ) : (
                'Aktif koleksiyon bulunamadı'
              )}
            </div>
          ) : (
            <>
              <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
                Mevcut Koleksiyonlar
              </div>
              <ul className="py-1">
                {filteredCollections.map((collection) => {
                  const selected = isSelectedCollection(collection.key)
                  return (
                    <li key={collection.key}>
                      <button
                        type="button"
                        onClick={() => handleSelect(collection.key)}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                          selected ? 'bg-blue-50 text-blue-700' : 'text-gray-900'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`font-mono font-medium ${selected ? 'text-blue-700' : 'text-gray-900'}`}>
                                {collection.key}
                              </span>
                              {selected && (
                                <CheckIcon className="h-4 w-4 text-blue-600 flex-shrink-0" />
                              )}
                            </div>
                            {collection.name && (
                              <div className="text-xs text-gray-500 mt-0.5 truncate">
                                {typeof collection.name === 'object' 
                                  ? (collection.name.tr || collection.name.en || '')
                                  : collection.name}
                              </div>
                            )}
                          </div>
                          {collection.fields?.length > 0 && (
                            <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                              {collection.fields.length} alan
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Yardım metni */}
      <p className="mt-1 text-xs text-gray-500">
        Mevcut koleksiyonlardan seçin veya yeni bir key yazın
      </p>
    </div>
  )
}
