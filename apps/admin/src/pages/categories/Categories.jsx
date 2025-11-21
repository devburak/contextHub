import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, PencilSquareIcon, TrashIcon, ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { categoryAPI } from '../../lib/categoryAPI.js'
import { useToast } from '../../contexts/ToastContext.jsx'

const SORT_FIELD_OPTIONS = [
  { value: 'createdAt', label: 'Oluşturma Tarihi' },
  { value: 'updatedAt', label: 'Güncellenme Tarihi' },
  { value: 'name', label: 'İsim' },
]

export default function Categories() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('create')
  const [editingCategory, setEditingCategory] = useState(null)
  const [parentPreset, setParentPreset] = useState(null)
  const [formState, setFormState] = useState(getEmptyForm())

  const treeQuery = useQuery({
    queryKey: ['categories', 'tree'],
    queryFn: categoryAPI.listTree,
  })

  const flatQuery = useQuery({
    queryKey: ['categories', 'flat'],
    queryFn: categoryAPI.listFlat,
  })

  const createMutation = useMutation({
    mutationFn: (payload) => categoryAPI.create(payload),
    onSuccess: async () => {
      closeModal()
      await invalidateCategoryQueries(queryClient)
      toast.success('Kategori oluşturuldu')
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Kategori oluşturulamadı')),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => categoryAPI.update(id, payload),
    onSuccess: async () => {
      closeModal()
      await invalidateCategoryQueries(queryClient)
      toast.success('Kategori güncellendi')
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Kategori güncellenemedi')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => categoryAPI.remove(id, { cascade: true }),
    onSuccess: async () => {
      await invalidateCategoryQueries(queryClient)
      toast.success('Kategori silindi')
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Kategori silinemedi')),
  })

  const openCreateModal = useCallback((parentId = null) => {
    setModalMode('create')
    setEditingCategory(null)
    setParentPreset(parentId)
    setFormState({ ...getEmptyForm(), parentId })
    setIsModalOpen(true)
  }, [])

  const openEditModal = useCallback((category) => {
    setModalMode('edit')
    setEditingCategory(category)
    setParentPreset(category.parentId || null)
    setFormState({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      parentId: category.parentId || '',
      defaultSortField: category.defaultSortField || 'createdAt',
      defaultSortOrder: category.defaultSortOrder || 'desc',
    })
    setIsModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
    setEditingCategory(null)
    setParentPreset(null)
    setFormState(getEmptyForm())
  }, [])

  useEffect(() => {
    if (isModalOpen && modalMode === 'create' && parentPreset !== null) {
      setFormState((prev) => ({ ...prev, parentId: parentPreset }))
    }
  }, [isModalOpen, modalMode, parentPreset])

  const handleSubmit = useCallback((event) => {
    event.preventDefault()
    const payload = {
      name: formState.name,
      slug: formState.slug,
      description: formState.description,
      parentId: formState.parentId || null,
      defaultSortField: formState.defaultSortField,
      defaultSortOrder: formState.defaultSortOrder,
    }

    if (modalMode === 'create') {
      createMutation.mutate(payload)
    } else if (editingCategory) {
      updateMutation.mutate({ id: editingCategory._id, payload })
    }
  }, [createMutation, editingCategory, formState, modalMode, updateMutation])

  const handleDelete = useCallback((category) => {
    const confirmed = window.confirm(
      `${category.name} kategorisini ve alt kategorilerini silmek istediğine emin misin?`
    )
    if (!confirmed) return
    deleteMutation.mutate(category._id)
  }, [deleteMutation])

  const mergeMutation = useMutation({
    mutationFn: ({ sourceId, targetId }) => categoryAPI.merge(sourceId, targetId),
    onSuccess: async () => {
      await invalidateCategoryQueries(queryClient)
      closeModal()
      toast.success('Kategoriler birleştirildi')
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Kategori birleştirilemedi')),
  })

  const openMergeModal = useCallback((category) => {
    setModalMode('merge')
    setEditingCategory(category)
    setIsModalOpen(true)
  }, [])

  const handleMerge = useCallback((targetId) => {
    if (editingCategory && targetId) {
      mergeMutation.mutate({ sourceId: editingCategory._id, targetId })
    }
  }, [editingCategory, mergeMutation])

  const handleInputChange = useCallback((event) => {
    const { name, value } = event.target
    setFormState((prev) => ({ ...prev, [name]: value }))
  }, [])

  const flatOptions = useMemo(() => {
    const flat = flatQuery.data || []
    const editingId = editingCategory?._id ? editingCategory._id.toString() : null

    const buildLabel = (item) => {
      const ancestors = item.ancestors || []
      return `${'— '.repeat(ancestors.length)}${item.name}`
    }

    return flat
      .sort((a, b) => {
        const depthDiff = (a.ancestors?.length || 0) - (b.ancestors?.length || 0)
        if (depthDiff !== 0) return depthDiff
        const positionDiff = (a.position || 0) - (b.position || 0)
        if (positionDiff !== 0) return positionDiff
        return a.name.localeCompare(b.name)
      })
      .map((item) => ({ value: item._id, label: buildLabel(item), data: item, ancestors: item.ancestors || [] }))
      .filter((option) => {
        if (modalMode === 'edit' && editingId) {
          if (option.value === editingId) {
            return false
          }
          const ancestors = option.data.ancestors || []
          if (ancestors.some((ancestorId) => ancestorId?.toString() === editingId)) {
            return false
          }
        }
        return true
      })
  }, [editingCategory, flatQuery.data, modalMode])

  const categoryTree = treeQuery.data || []

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kategoriler</h1>
          <p className="mt-2 text-sm text-gray-600">
            İçerikleri gruplayabileceğin hiyerarşik kategoriler oluştur. Slug değerleri her varlık için benzersizdir.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => invalidateCategoryQueries(queryClient)}
            className="inline-flex items-center gap-x-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <ArrowPathIcon className={clsx('h-4 w-4', treeQuery.isFetching || flatQuery.isFetching ? 'animate-spin' : '')} />
            Yenile
          </button>
          <button
            type="button"
            onClick={() => openCreateModal(null)}
            className="inline-flex items-center gap-x-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <PlusIcon className="h-4 w-4" />
            Yeni Kategori
          </button>
        </div>
      </header>

      {treeQuery.isLoading || flatQuery.isLoading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">Kategoriler yükleniyor…</div>
      ) : treeQuery.isError || flatQuery.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-600">
          Kategoriler alınamadı. Lütfen tekrar deneyin.
        </div>
      ) : categoryTree.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
          Henüz kategori oluşturulmamış. İlk kategorini eklemek için yukarıdaki butonu kullanabilirsin.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <nav className="space-y-2">
            {categoryTree.map((category) => (
              <CategoryNode
                key={category._id}
                category={category}
                depth={0}
                onCreateChild={openCreateModal}
                onEdit={openEditModal}
                onDelete={handleDelete}
                onMerge={openMergeModal}
              />
            ))}
          </nav>
        </div>
      )}

      {modalMode === 'merge' ? (
        <MergeCategoryModal
          open={isModalOpen}
          sourceCategory={editingCategory}
          onClose={closeModal}
          onMerge={handleMerge}
          options={flatOptions}
          loading={mergeMutation.isPending}
        />
      ) : (
        <CategoryModal
          open={isModalOpen}
          mode={modalMode}
          formState={formState}
          onClose={closeModal}
          onChange={handleInputChange}
          onSubmit={handleSubmit}
          options={flatOptions}
          loading={createMutation.isPending || updateMutation.isPending}
          error={createMutation.error || updateMutation.error}
          editingCategory={editingCategory}
        />
      )}
    </div>
  )
}

function CategoryNode({ category, depth, onCreateChild, onEdit, onDelete, onMerge }) {
  return (
    <div className={clsx('rounded-lg border border-gray-200 bg-gray-50 p-4', depth > 0 && 'ml-6')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{category.name}</h2>
          <div className="text-xs text-gray-500">Slug: {category.slug}</div>
          {category.description && <p className="mt-1 text-sm text-gray-600">{category.description}</p>}
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
            <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5">Sıralama: {category.defaultSortField} ({category.defaultSortOrder})</span>
            {typeof category.position === 'number' && (
              <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5">Pozisyon: {category.position}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onCreateChild(category._id)}
            className="inline-flex items-center gap-x-1 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            <PlusIcon className="h-4 w-4" /> Alt kategori
          </button>
          <button
            type="button"
            onClick={() => onEdit(category)}
            className="inline-flex items-center gap-x-1 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            <PencilSquareIcon className="h-4 w-4" /> Düzenle
          </button>
          <button
            type="button"
            onClick={() => onMerge(category)}
            className="inline-flex items-center gap-x-1 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
          >
            <ArrowPathIcon className="h-4 w-4" /> Birleştir
          </button>
          <button
            type="button"
            onClick={() => onDelete(category)}
            className="inline-flex items-center gap-x-1 rounded-md border border-red-400 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            <TrashIcon className="h-4 w-4" /> Sil
          </button>
        </div>
      </div>

      {Array.isArray(category.children) && category.children.length > 0 && (
        <div className="mt-4 space-y-2 border-l border-gray-200 pl-4">
          {category.children.map((child) => (
            <CategoryNode
              key={child._id}
              category={child}
              depth={depth + 1}
              onCreateChild={onCreateChild}
              onEdit={onEdit}
              onDelete={onDelete}
              onMerge={onMerge}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CategoryModal({ open, mode, formState, onClose, onChange, onSubmit, options, loading, error, editingCategory }) {
  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-6">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white px-4 pb-6 pt-5 text-left shadow-xl transition-all sm:p-8">
                <button
                  type="button"
                  className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
                  onClick={onClose}
                >
                  <span className="sr-only">Kapat</span>
                  <XMarkIcon className="h-5 w-5" />
                </button>

                <Dialog.Title className="text-lg font-semibold leading-6 text-gray-900">
                  {mode === 'create' ? 'Yeni Kategori' : `Kategori Düzenle (${editingCategory?.name || ''})`}
                </Dialog.Title>

                <form className="mt-6 space-y-4" onSubmit={onSubmit}>
                  <div>
                    <label htmlFor="category-name" className="block text-sm font-medium text-gray-700">
                      İsim
                    </label>
                    <input
                      id="category-name"
                      name="name"
                      value={formState.name}
                      onChange={onChange}
                      required
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="category-slug" className="block text-sm font-medium text-gray-700">
                      Slug
                    </label>
                    <input
                      id="category-slug"
                      name="slug"
                      value={formState.slug}
                      onChange={onChange}
                      placeholder="Otomatik üretmek için boş bırak"
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">Slug her varlık içinde benzersiz olmalıdır.</p>
                  </div>

                  <div>
                    <label htmlFor="category-parent" className="block text-sm font-medium text-gray-700">
                      Üst Kategori
                    </label>
                    <select
                      id="category-parent"
                      name="parentId"
                      value={formState.parentId || ''}
                      onChange={onChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    >
                      <option value="">— Üst kategori yok —</option>
                      {options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="category-description" className="block text-sm font-medium text-gray-700">
                      Açıklama
                    </label>
                    <textarea
                      id="category-description"
                      name="description"
                      rows={3}
                      value={formState.description}
                      onChange={onChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="category-sort-field" className="block text-sm font-medium text-gray-700">
                        Varsayılan Sıralama Alanı
                      </label>
                      <select
                        id="category-sort-field"
                        name="defaultSortField"
                        value={formState.defaultSortField}
                        onChange={onChange}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      >
                        {SORT_FIELD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="category-sort-order" className="block text-sm font-medium text-gray-700">
                        Varsayılan Sıralama Yönü
                      </label>
                      <select
                        id="category-sort-order"
                        name="defaultSortOrder"
                        value={formState.defaultSortOrder}
                        onChange={onChange}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      >
                        <option value="desc">Azalan</option>
                        <option value="asc">Artan</option>
                      </select>
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                      {(error instanceof Error ? error.message : 'İşlem sırasında bir hata oluştu')}
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Vazgeç
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                    >
                      {loading ? 'Kaydediliyor…' : mode === 'create' ? 'Oluştur' : 'Güncelle'}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

function MergeCategoryModal({ open, sourceCategory, onClose, onMerge, options, loading }) {
  const [targetId, setTargetId] = useState('')

  useEffect(() => {
    if (open) {
      setTargetId('')
    }
  }, [open])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!targetId) return
    onMerge(targetId)
  }

  // Filter out the source category and its descendants from options
  const validOptions = useMemo(() => {
    if (!sourceCategory) return []
    const sourceId = sourceCategory._id.toString()
    return options.filter(opt => {
      if (opt.value === sourceId) return false
      // Check if option is a descendant of source
      const ancestors = opt.data.ancestors || []
      if (ancestors.some(a => a.toString() === sourceId)) return false
      return true
    })
  }, [options, sourceCategory])

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-6">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative w-full max-w-lg transform overflow-hidden rounded-2xl bg-white px-4 pb-6 pt-5 text-left shadow-xl transition-all sm:p-8">
                <button
                  type="button"
                  className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
                  onClick={onClose}
                >
                  <span className="sr-only">Kapat</span>
                  <XMarkIcon className="h-5 w-5" />
                </button>

                <Dialog.Title className="text-lg font-semibold leading-6 text-gray-900">
                  Kategori Birleştir
                </Dialog.Title>

                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    <span className="font-medium text-gray-900">{sourceCategory?.name}</span> kategorisini başka bir kategori ile birleştirmek üzeresin.
                    Bu işlem sonucunda:
                  </p>
                  <ul className="mt-2 list-disc pl-5 text-sm text-gray-500 space-y-1">
                    <li>Bu kategoriye ait tüm içerikler hedef kategoriye taşınacak.</li>
                    <li>Bu kategorinin alt kategorileri hedef kategorinin altına taşınacak.</li>
                    <li><span className="font-medium text-red-600">{sourceCategory?.name} kategorisi kalıcı olarak silinecek.</span></li>
                  </ul>
                </div>

                <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                  <div>
                    <label htmlFor="target-category" className="block text-sm font-medium text-gray-700">
                      Hedef Kategori
                    </label>
                    <select
                      id="target-category"
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
                      required
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    >
                      <option value="">— Kategori seç —</option>
                      {validOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="inline-flex items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Vazgeç
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !targetId}
                      className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                    >
                      {loading ? 'Birleştiriliyor…' : 'Birleştir ve Sil'}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

function invalidateCategoryQueries(queryClient) {
  const keys = [
    ['categories'],
    ['categories', 'tree'],
    ['categories', 'flat'],
  ]

  return Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  )
}

function getEmptyForm() {
  return {
    name: '',
    slug: '',
    description: '',
    parentId: '',
    defaultSortField: 'createdAt',
    defaultSortOrder: 'desc',
  }
}

function getErrorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback
}
