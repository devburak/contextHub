import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getContentVersion, listVersions } from '../../lib/api/contents'
import { useContentVersionHistory } from './useContentVersionHistory'

vi.mock('../../lib/api/contents', () => ({
  getContentVersion: vi.fn(),
  listVersions: vi.fn(),
}))

describe('content version history loading', () => {
  let container, root, client, history
  const props = { tenant: 'tenant-a', id: 'content-a', enabled: true }
  function Probe(input) {
    history = useContentVersionHistory(input)
    return <div>{history.previewVersion?.html || 'No body loaded'}</div>
  }
  async function render(input = props) {
    await act(async () => {
      root.render(<QueryClientProvider client={client}><Probe {...input} /></QueryClientProvider>)
    })
  }
  async function settle(check) {
    await vi.waitFor(async () => {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
      check()
    })
  }

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })
    listVersions.mockImplementation(async ({ page }) => ({
      versions: page === 1
        ? [{ _id: 'version-a', version: 2 }, { _id: 'version-b', version: 1 }]
        : [{ _id: 'version-older', version: 0 }],
      deletedVersions: [],
      pagination: { page, limit: 20, total: 21, pages: 2 },
      deletedPagination: { page: 1, limit: 20, total: 0, pages: 1 },
    }))
    getContentVersion.mockImplementation(async ({ versionId }) => ({ _id: versionId, html: `<p>${versionId}</p>` }))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    client.clear()
    container.remove()
    vi.resetAllMocks()
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  })

  it('loads bounded metadata without automatically fetching a snapshot', async () => {
    await render()
    await settle(() => expect(history.versionsData).toHaveLength(2))
    expect(listVersions).toHaveBeenCalledWith({ id: 'content-a', page: 1, deletedPage: 1, limit: 20 })
    expect(getContentVersion).not.toHaveBeenCalled()
    expect(history.previewVersion).toBeNull()
  })

  it('only exposes a full snapshot after the selected version has loaded', async () => {
    let resolveVersion
    getContentVersion.mockImplementation(() => new Promise((resolve) => { resolveVersion = resolve }))
    await render()
    await settle(() => expect(history.versionsData).toHaveLength(2))
    await act(async () => history.setSelectedVersionId('version-a'))
    expect(getContentVersion).toHaveBeenCalledWith({ id: 'content-a', versionId: 'version-a' })
    expect(history.previewVersion).toBeUndefined()
    await act(async () => resolveVersion({ _id: 'version-a', html: '<p>Snapshot body</p>' }))
    await settle(() => expect(history.previewVersion?.html).toBe('<p>Snapshot body</p>'))
  })

  it('does not show a late response from the previously selected version', async () => {
    const pending = {}
    getContentVersion.mockImplementation(({ versionId }) => new Promise((resolve) => { pending[versionId] = resolve }))
    await render()
    await settle(() => expect(history.versionsData).toHaveLength(2))
    await act(async () => history.setSelectedVersionId('version-a'))
    await act(async () => history.setSelectedVersionId('version-b'))
    await act(async () => pending['version-b']({ _id: 'version-b', html: 'Selected body' }))
    await settle(() => expect(history.previewVersion?.html).toBe('Selected body'))
    await act(async () => pending['version-a']({ _id: 'version-a', html: 'Old body' }))
    expect(history.previewVersion?.html).toBe('Selected body')
  })

  it('clears the preview on pagination and scopes the selection to tenant and content', async () => {
    await render()
    await settle(() => expect(history.versionsData).toHaveLength(2))
    await act(async () => history.setSelectedVersionId('version-a'))
    await settle(() => expect(history.previewVersion?._id).toBe('version-a'))
    const selectedContextIsCurrent = history.isSelectionCurrent
    expect(selectedContextIsCurrent()).toBe(true)
    await act(async () => history.setPage(2))
    await settle(() => expect(history.versionsData[0]?._id).toBe('version-older'))
    expect(history.selectedVersionId).toBeNull()
    expect(history.previewVersion).toBeNull()
    expect(selectedContextIsCurrent()).toBe(false)
    await render({ ...props, tenant: 'tenant-b', id: 'content-b' })
    await settle(() => expect(listVersions).toHaveBeenCalledWith({ id: 'content-b', page: 1, deletedPage: 1, limit: 20 }))
    expect(history.page).toBe(1)
    expect(history.selectedVersionId).toBeNull()
    expect(getContentVersion).toHaveBeenCalledTimes(1)
  })

  it('keeps the selected snapshot when an autosave moves it outside the current metadata page', async () => {
    await render()
    await settle(() => expect(history.versionsData).toHaveLength(2))
    await act(async () => history.setSelectedVersionId('version-b'))
    await settle(() => expect(history.previewVersion?._id).toBe('version-b'))
    const selectedContextIsCurrent = history.isSelectionCurrent
    await act(async () => {
      client.setQueryData(['contentVersions', { tenant: props.tenant, id: props.id, page: 1, deletedPage: 1 }], {
        versions: [{ _id: 'new-autosave' }, { _id: 'version-a' }],
        deletedVersions: [],
      })
    })
    await settle(() => expect(history.versionsData[0]?._id).toBe('new-autosave'))
    expect(selectedContextIsCurrent()).toBe(true)
    expect(history.previewVersion?._id).toBe('version-b')
  })
})
