import { describe, expect, it } from 'vitest'
import {
  FILE_TYPE_GROUPS,
  canPromoteFile,
  clampOptionalInt,
  clampRetentionDays,
  describeFileError,
  describeFileState,
  formatBytes,
  formatPreviewValue,
  getFileRecords,
  getSelectedExtensions,
  isGroupSelected,
  toggleFileTypeGroup,
  describeMissingUploadSetup,
} from './formFileUtils'

const file = { uploadId: 'up-1', filename: 'cv.pdf', size: 2048, mimeType: 'application/pdf' }
const group = (key) => FILE_TYPE_GROUPS.find((item) => item.key === key)

describe('form response file values', () => {
  it('shows files by name instead of "[object Object]"', () => {
    expect(formatPreviewValue([file, { ...file, uploadId: 'up-2', filename: 'foto.jpg' }])).toBe('cv.pdf, foto.jpg')
    expect(formatPreviewValue(file)).toBe('cv.pdf')
    expect(formatPreviewValue({ a: 1 })).toBe('{"a":1}')
    expect(formatPreviewValue(['x', 'y'])).toBe('x, y')
    expect(formatPreviewValue(null)).toBe('')
  })

  it('picks the file records out of a field value', () => {
    expect(getFileRecords([file, 'text', null])).toEqual([file])
    expect(getFileRecords(file)).toEqual([file])
    expect(getFileRecords('plain')).toEqual([])
  })

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(undefined)).toBe('')
  })
})

describe('file state and publishing', () => {
  it('describes availability', () => {
    expect(describeFileState({ status: 'attached' })).toMatchObject({ available: true, label: 'Mevcut' })
    expect(describeFileState({ status: 'expired', deleteReason: 'retention' }).label).toContain('Saklama süresi doldu')
    expect(describeFileState({ status: 'promoted' })).toMatchObject({ available: false })
    expect(describeFileState({})).toMatchObject({ available: false, label: 'Silindi' })
  })

  it('offers publishing for images, video, audio and PDF until scanning exists', () => {
    const attached = { status: 'attached', scanStatus: 'not_scanned' }
    expect(canPromoteFile(attached, 'application/pdf')).toBe(true)
    expect(canPromoteFile(attached, 'image/png')).toBe(true)
    expect(canPromoteFile(attached, 'video/mp4')).toBe(true)
    expect(canPromoteFile(attached, 'audio/mpeg')).toBe(true)
    expect(canPromoteFile(attached, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false)
    expect(canPromoteFile({ ...attached, scanStatus: 'clean' }, 'text/csv')).toBe(true)
    expect(canPromoteFile({ ...attached, scanStatus: 'infected' }, 'image/png')).toBe(false)
    expect(canPromoteFile({ status: 'expired' }, 'image/png')).toBe(false)
  })

  it('explains API errors in Turkish', () => {
    const apiError = (code) => ({ response: { data: { error: code, message: 'raw' } } })
    expect(describeFileError(apiError('PdfActiveContent'), 'x')).toContain('aktif içerik')
    expect(describeFileError(apiError('Unknown'), 'x')).toBe('raw')
    expect(describeFileError(new Error('network'), 'fallback')).toBe('fallback')
  })
})

describe('file field settings', () => {
  it('toggles type groups as extension lists', () => {
    const withImages = toggleFileTypeGroup([], group('image'), true)
    expect(withImages).toContain('.jpg')
    expect(isGroupSelected(withImages, group('image'))).toBe(true)

    const withPdf = toggleFileTypeGroup(withImages, group('pdf'), true)
    expect(withPdf).toEqual([...withImages, '.pdf'])
    expect(toggleFileTypeGroup(withPdf, group('image'), false)).toEqual(['.pdf'])
  })

  it('ignores entries the platform does not accept', () => {
    expect(getSelectedExtensions(['.PDF', 'svg', '.zip', 'image/*', ' docx '])).toEqual(['pdf', 'docx'])
  })

  it('clamps numbers to the platform limits', () => {
    expect(clampOptionalInt('25', 1, 20)).toBe(20)
    expect(clampOptionalInt('0', 1, 5)).toBe(1)
    expect(clampOptionalInt('', 1, 5)).toBeUndefined()
    expect(clampRetentionDays('10')).toBe(30)
    expect(clampRetentionDays('2000')).toBe(730)
    expect(clampRetentionDays('')).toBe(180)
    expect(clampRetentionDays('90')).toBe(90)
  })
})

describe('upload readiness notice', () => {
  it('lists only what is missing', () => {
    expect(describeMissingUploadSetup({ ready: true })).toEqual([])
    expect(describeMissingUploadSetup(undefined)).toEqual([])
    const missing = describeMissingUploadSetup({ ready: false, configured: true, planAllowed: false, turnstileConfigured: false })
    expect(missing.map((item) => item.key)).toEqual(['plan', 'turnstile'])
  })
})
