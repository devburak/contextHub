import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getContentVersion, listVersions } from '../../lib/api/contents'

const EMPTY_VERSIONS = []

export function useContentVersionHistory({ tenant, id, enabled }) {
  const scope = JSON.stringify([tenant, id])
  const initialState = { scope, page: 1, deletedPage: 1, selectedId: null }
  const [state, setState] = useState(initialState)
  const current = state.scope === scope ? state : initialState
  const updateState = (patch) => setState((previous) => ({
    ...(previous.scope === scope ? previous : initialState),
    ...patch,
  }))

  const versionsQuery = useQuery({
    queryKey: ['contentVersions', { tenant, id, page: current.page, deletedPage: current.deletedPage }],
    queryFn: () => listVersions({ id, page: current.page, deletedPage: current.deletedPage, limit: 20 }),
    enabled,
  })
  const versionsPayload = versionsQuery.data
  const versionsData = versionsPayload?.versions ?? EMPTY_VERSIONS
  const deletedVersionsData = versionsPayload?.deletedVersions ?? EMPTY_VERSIONS
  // An autosave may push the selected snapshot onto the next metadata page.
  // Keep the explicit selection until the user changes page/content/selection.
  const selectedVersionId = current.selectedId
  const versionQuery = useQuery({
    queryKey: ['contentVersion', { tenant, id, versionId: selectedVersionId }],
    queryFn: () => getContentVersion({ id, versionId: selectedVersionId }),
    enabled: enabled && Boolean(selectedVersionId),
  })
  const selectionKey = JSON.stringify([scope, current.page, selectedVersionId])
  const currentSelection = useRef(selectionKey)
  currentSelection.current = selectionKey

  return {
    versionsQuery,
    versionQuery,
    versionsPayload,
    versionsData,
    deletedVersionsData,
    selectedVersionId,
    setSelectedVersionId: (selectedId) => updateState({ selectedId }),
    previewVersion: selectedVersionId && !versionQuery.isError ? versionQuery.data : null,
    isSelectionCurrent: () => currentSelection.current === selectionKey,
    page: current.page,
    deletedPage: current.deletedPage,
    setPage: (page) => updateState({ page, selectedId: null }),
    setDeletedPage: (deletedPage) => updateState({ deletedPage }),
  }
}
