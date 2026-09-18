const MIN_IMAGE_DIMENSION = 40
const MAX_IMAGE_DIMENSION = 1600
const DEFAULT_IMAGE_DIMENSION = 640

function clampImageDimension(value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return undefined
  return Math.min(Math.max(parsed, MIN_IMAGE_DIMENSION), MAX_IMAGE_DIMENSION)
}

function getDisplayDimensions(width, height) {
  const numericWidth = Number(width) > 0 ? Number(width) : undefined
  const numericHeight = Number(height) > 0 ? Number(height) : undefined
  if (!numericWidth && !numericHeight) return { width: undefined, height: undefined }
  if (!numericWidth) return { width: undefined, height: Math.min(numericHeight, MAX_IMAGE_DIMENSION) }
  if (!numericHeight) return { width: Math.min(numericWidth, MAX_IMAGE_DIMENSION), height: undefined }

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(numericWidth, numericHeight))
  return {
    width: Math.round(numericWidth * scale),
    height: Math.round(numericHeight * scale),
  }
}

function normalizeImageLink(value) {
  const link = value.trim()
  if (!link) return ''
  if (/^(\/|#|\.\/|\.\.\/)/.test(link)) return link

  try {
    const url = new URL(link)
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? link : null
  } catch {
    return null
  }
}

export {
  DEFAULT_IMAGE_DIMENSION,
  MAX_IMAGE_DIMENSION,
  MIN_IMAGE_DIMENSION,
  clampImageDimension,
  getDisplayDimensions,
  normalizeImageLink,
}
