import { describe, expect, it } from 'vitest'
import { getGalleryId, getMediaPreview } from './galleryPresentation.js'

describe('GalleryManager helpers', () => {
  it('accepts legacy _id values for galleries without populated media', () => {
    expect(getGalleryId({ _id: 'gallery-id', items: [] })).toBe('gallery-id')
  })

  it('prefers an image thumbnail variant over the original URL', () => {
    expect(getMediaPreview({
      mimeType: 'image/jpeg',
      url: 'https://cdn.example/original.jpg',
      variants: [{ name: 'thumbnail', url: 'https://cdn.example/thumb.jpg' }]
    })).toMatchObject({
      url: 'https://cdn.example/thumb.jpg',
      isVideo: false
    })
  })

  it('uses the explicit thumbnail for external videos', () => {
    expect(getMediaPreview({
      sourceType: 'external',
      provider: 'youtube',
      url: 'https://youtube.example/watch/1',
      thumbnailUrl: 'https://cdn.example/video-thumb.jpg'
    })).toMatchObject({
      url: 'https://cdn.example/video-thumb.jpg',
      isVideo: true,
      isExternal: true
    })
  })
})
