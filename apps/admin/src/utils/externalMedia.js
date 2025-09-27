export function buildExternalEmbed(item) {
  if (!item) {
    return null
  }

  try {
    const rawUrl = item.externalUrl || item.url
    if (!rawUrl) {
      console.debug('[VideoEmbed] No URL provided for media item', item)
      return null
    }

    const provider = (item.provider || '').toLowerCase()
    const providerId = item.providerId

    if (provider === 'youtube' || isYouTubeUrl(rawUrl)) {
      const videoId = cleanYouTubeId(providerId || extractYouTubeId(rawUrl))
      if (!videoId) {
        console.warn('[VideoEmbed] Unable to resolve YouTube video id', { rawUrl, providerId })
        return null
      }
      return {
        type: 'iframe',
        src: `https://www.youtube-nocookie.com/embed/${videoId}`,
      }
    }

    if (provider === 'vimeo' || isVimeoUrl(rawUrl)) {
      const videoId = cleanVimeoId(providerId || extractVimeoId(rawUrl))
      if (!videoId) {
        console.warn('[VideoEmbed] Unable to resolve Vimeo video id', { rawUrl, providerId })
        return null
      }
      return {
        type: 'iframe',
        src: `https://player.vimeo.com/video/${videoId}`,
      }
    }

    if (item.mimeType?.startsWith('video/')) {
      return { type: 'video', src: rawUrl }
    }

    return null
  } catch (error) {
    console.error('[VideoEmbed] Failed to build embed', error, item)
    return null
  }
}

export function isYouTubeUrl(value) {
  try {
    const parsed = new URL(value)
    return /(^|\.)youtube\.com$/i.test(parsed.hostname) || /(^|\.)youtu\.be$/i.test(parsed.hostname)
  } catch (error) {
    return false
  }
}

export function extractYouTubeId(value) {
  try {
    const parsed = new URL(value)
    if (/youtu\.be$/i.test(parsed.hostname)) {
      return parsed.pathname.split('/').filter(Boolean)[0] || null
    }
    if (/youtube\.com$/i.test(parsed.hostname)) {
      const idParam = parsed.searchParams.get('v')
      if (idParam) return idParam
      const segments = parsed.pathname.split('/').filter(Boolean)
      const lastSegment = segments[segments.length - 1]
      if (segments[0] === 'embed' || segments[0] === 'shorts') {
        return lastSegment || null
      }
    }
  } catch (error) {
    return null
  }
  return null
}

export function cleanYouTubeId(value) {
  if (!value) return ''
  return value.replace(/[^a-zA-Z0-9_-]/g, '')
}

export function isVimeoUrl(value) {
  try {
    const parsed = new URL(value)
    return /vimeo\.com$/i.test(parsed.hostname)
  } catch (error) {
    return false
  }
}

export function extractVimeoId(value) {
  try {
    const parsed = new URL(value)
    const segments = parsed.pathname.split('/').filter(Boolean)
    return segments[segments.length - 1] || null
  } catch (error) {
    return null
  }
}

export function cleanVimeoId(value) {
  if (!value) return ''
  return value.replace(/[^a-zA-Z0-9]/g, '')
}
