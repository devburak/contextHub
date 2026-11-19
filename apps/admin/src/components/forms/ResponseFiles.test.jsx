import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getResponseFileDownload, promoteResponseFile } from '../../lib/api/forms'
import ResponseFiles from './ResponseFiles.jsx'

vi.mock('../../lib/api/forms', () => ({ getResponseFileDownload: vi.fn(), promoteResponseFile: vi.fn() }))

const pdf = { uploadId: 'up-1', filename: 'Broşür.pdf', size: 2048, mimeType: 'application/pdf' }
const docx = { uploadId: 'up-2', filename: 'cv.docx', size: 4096, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
const attached = { status: 'attached', scanStatus: 'not_scanned', retainUntil: '2027-05-17T00:00:00Z' }

describe('response files', () => {
  let root
  let container

  const render = async (props) => {
    await act(async () => root.render(
      <ResponseFiles formId="form-1" responseId="resp-1" files={[pdf, docx]} {...props} />
    ))
  }
  const button = (text) => [...container.querySelectorAll('button')].find((item) => item.textContent.includes(text))
  const click = async (element) => act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true })))

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.clearAllMocks()
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  })

  it('lists files with their state and retention date', async () => {
    await render({ fileStates: { 'up-1': attached, 'up-2': { status: 'expired', deleteReason: 'retention' } } })

    expect(container.textContent).toContain('Broşür.pdf')
    expect(container.textContent).toContain('2.0 KB')
    expect(container.textContent).toContain('Taranmadı')
    expect(container.textContent).toContain('tarihinde silinecek')
    expect(container.textContent).toContain('Saklama süresi doldu')
    // An expired file offers no download.
    expect(container.querySelectorAll('button')).toHaveLength(1)
  })

  it('fetches a fresh link on each download', async () => {
    getResponseFileDownload.mockResolvedValue({ url: 'https://r2.example/get?sig=1' })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await render({ fileStates: { 'up-1': attached } })

    await click(button('İndir'))

    expect(getResponseFileDownload).toHaveBeenCalledWith({ formId: 'form-1', responseId: 'resp-1', uploadId: 'up-1' })
    expect(clickSpy).toHaveBeenCalledTimes(1)
    clickSpy.mockRestore()
  })

  it('hides publishing from non-admins and for Office files', async () => {
    await render({ fileStates: { 'up-1': attached, 'up-2': attached }, canPublish: false })
    expect(button('Medyaya taşı')).toBeUndefined()

    await render({ fileStates: { 'up-1': attached, 'up-2': attached }, canPublish: true })
    expect([...container.querySelectorAll('button')].filter((item) => item.textContent.includes('Medyaya taşı'))).toHaveLength(1)
  })

  it('asks for confirmation before making a file public', async () => {
    const onChanged = vi.fn()
    promoteResponseFile.mockResolvedValue({ mediaId: 'media-1', url: 'https://cdn.example/x.pdf' })
    await render({ fileStates: { 'up-1': attached }, files: [pdf], canPublish: true, onChanged })

    await click(button('Medyaya taşı'))
    expect(promoteResponseFile).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Bu dosya herkese açık olacak')
    expect(container.textContent).toContain('virüs taramasından geçmedi')

    await click(button('Herkese açık yap'))

    expect(promoteResponseFile).toHaveBeenCalledWith({ formId: 'form-1', responseId: 'resp-1', uploadId: 'up-1' })
    expect(onChanged).toHaveBeenCalled()
    expect(container.textContent).toContain('Medya kütüphanesine taşındı')
    expect(container.querySelector('a[href="https://cdn.example/x.pdf"]')).not.toBeNull()
  })

  it('shows why a file could not be published', async () => {
    promoteResponseFile.mockRejectedValue({ response: { data: { error: 'PdfActiveContent' } } })
    await render({ fileStates: { 'up-1': attached }, files: [pdf], canPublish: true })

    await click(button('Medyaya taşı'))
    await click(button('Herkese açık yap'))

    expect(container.querySelector('[role="alert"]').textContent).toContain('aktif içerik')
    expect(container.textContent).not.toContain('Medya kütüphanesine taşındı')
  })
})
