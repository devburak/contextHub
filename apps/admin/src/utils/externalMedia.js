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
    const host = parsed.hostname.toLowerCase()
    return isYouTubeHost(host)
  } catch (error) {
    return false
  }
}

export function extractYouTubeId(value) {
  try {
    const parsed = new URL(value)
    const host = parsed.hostname.toLowerCase()

    if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
      return parsed.pathname.split('/').filter(Boolean)[0] || null
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')) {
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

export function detectVideoProvider(value) {
  if (!value) {
    return { provider: null, providerId: null }
  }

  try {
    if (isYouTubeUrl(value)) {
      const id = cleanYouTubeId(extractYouTubeId(value) || '')
      return { provider: 'youtube', providerId: id || null }
    }

    if (isVimeoUrl(value)) {
      const id = cleanVimeoId(extractVimeoId(value) || '')
      return { provider: 'vimeo', providerId: id || null }
    }
  } catch (error) {
    return { provider: null, providerId: null }
  }

  return { provider: null, providerId: null }
}

function isYouTubeHost(host) {
  if (!host) return false
  const normalized = host.toLowerCase()
  return (
    normalized === 'youtube.com' ||
    normalized.endsWith('.youtube.com') ||
    normalized === 'youtube-nocookie.com' ||
    normalized.endsWith('.youtube-nocookie.com') ||
    normalized === 'youtu.be' ||
    normalized.endsWith('.youtu.be')
  )
}
