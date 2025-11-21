const VARIANT_PRIORITY = ['large', 'preview', 'optimized', 'original', 'thumbnail']

export function getPreferredImageVariant(media) {
  const variants = Array.isArray(media?.variants) ? media.variants : []
  if (!variants.length) {
    return null
  }
  for (const name of VARIANT_PRIORITY) {
    const match = variants.find((variant) => variant.name === name)
    if (match) {
      return match
    }
  }
  return variants[0] || null
}

export function mediaToImagePayload(media) {
  if (!media) return null

  const variant = getPreferredImageVariant(media)
  const src = variant?.url || media.url
  if (!src) {
    return null
  }

  return {
    src,
    altText: media.altText || media.originalName || media.fileName || '',
    width: variant?.width || media.width || null,
    height: variant?.height || media.height || null,
  }
}
