export function getGalleryId(gallery) {
  return gallery?.id || gallery?._id || null
}

export function getMediaPreview(media) {
  if (!media) {
    return { url: null, mediaUrl: null, isVideo: false, isExternal: false }
  }

  const variants = Array.isArray(media.variants) ? media.variants : []
  const preferredVariant = ['thumbnail', 'medium', 'small']
    .map((name) => variants.find((variant) => variant.name === name)?.url)
    .find(Boolean) || variants.find((variant) => variant?.url)?.url || null
  const mediaUrl = media.publicUrl || media.url || null
  const provider = typeof media.provider === 'string' ? media.provider.toLowerCase() : ''
  const isExternal = media.sourceType === 'external'
  const isVideo = isExternal || media.mimeType?.startsWith('video/') || ['youtube', 'vimeo'].includes(provider)

  return {
    url: isVideo ? media.thumbnailUrl || preferredVariant || null : preferredVariant || mediaUrl,
    mediaUrl,
    isVideo,
    isExternal,
  }
}
