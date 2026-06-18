const SPOTIFY_EMBED_BASE_URL = 'https://open.spotify.com/embed'
const SPOTIFY_SUPPORTED_TYPES = new Set([
  'album',
  'artist',
  'episode',
  'playlist',
  'show',
  'track',
])

export const EMBED_URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi

export function buildEmbedPayloadFromUrl(rawUrl) {
  const normalizedUrl = normalizeUrl(rawUrl)
  if (!normalizedUrl) {
    return null
  }

  const spotifyEmbed = buildSpotifyEmbedPayload(normalizedUrl)
  if (spotifyEmbed) {
    return spotifyEmbed
  }

  return null
}

export function buildEmbedPayloadFromIframe(iframe) {
  if (!iframe) {
    return null
  }

  const src = iframe.getAttribute('src')?.trim()
  if (!src) {
    return null
  }

  let resolvedSrc = src
  const attributes = {}
  Array.from(iframe.attributes).forEach(({ name, value }) => {
    if (!name) return
    attributes[name.toLowerCase()] = value
  })

  const spotifyMetadata = getSpotifyMetadataFromUrl(src)
  if (spotifyMetadata) {
    resolvedSrc = buildSpotifyEmbedUrl(spotifyMetadata)
    attributes.src = resolvedSrc
    attributes.title = attributes.title || getSpotifyTitle(spotifyMetadata.type)
    attributes.width = attributes.width || '100%'
    attributes.height = attributes.height || getSpotifyEmbedHeight(spotifyMetadata.type)
    attributes.frameborder = attributes.frameborder || '0'
    attributes.allow = attributes.allow || 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'
    attributes.loading = attributes.loading || 'lazy'
    attributes['data-provider'] = attributes['data-provider'] || 'spotify'
    attributes['data-provider-id'] = attributes['data-provider-id'] || spotifyMetadata.id
    attributes['data-spotify-type'] = attributes['data-spotify-type'] || spotifyMetadata.type
    attributes['data-url'] = attributes['data-url'] || spotifyMetadata.url
  }

  return {
    src: resolvedSrc,
    attributes,
  }
}

export function extractEmbeddableUrls(text) {
  if (typeof text !== 'string') {
    return []
  }

  const matches = new Set()
  EMBED_URL_REGEX.lastIndex = 0
  let match
  while ((match = EMBED_URL_REGEX.exec(text)) !== null) {
    const cleaned = cleanUrlCandidate(match[0])
    if (cleaned && buildEmbedPayloadFromUrl(cleaned)) {
      matches.add(cleaned)
    }
  }
  return Array.from(matches)
}

export function isOnlyEmbeddableUrls(text) {
  if (typeof text !== 'string') {
    return false
  }

  EMBED_URL_REGEX.lastIndex = 0
  const remainingText = text.replace(EMBED_URL_REGEX, '').trim()
  return remainingText.length === 0 && extractEmbeddableUrls(text).length > 0
}

export function normalizeUrl(rawUrl) {
  const trimmed = cleanUrlCandidate(rawUrl)
  if (!trimmed) {
    return ''
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  return `https://${trimmed}`
}

function buildSpotifyEmbedPayload(rawUrl) {
  const metadata = getSpotifyMetadataFromUrl(rawUrl)
  if (!metadata) {
    return null
  }

  const embedSrc = buildSpotifyEmbedUrl(metadata)

  return {
    src: embedSrc,
    attributes: {
      src: embedSrc,
      title: getSpotifyTitle(metadata.type),
      width: '100%',
      height: getSpotifyEmbedHeight(metadata.type),
      frameborder: '0',
      allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
      loading: 'lazy',
      'data-provider': 'spotify',
      'data-provider-id': metadata.id,
      'data-spotify-type': metadata.type,
      'data-url': metadata.url,
    },
  }
}

function buildSpotifyEmbedUrl(metadata) {
  const embedUrl = new URL(`${SPOTIFY_EMBED_BASE_URL}/${metadata.type}/${metadata.id}`)
  const theme = metadata.searchParams.get('theme')
  if (theme) {
    embedUrl.searchParams.set('theme', theme)
  }
  return embedUrl.toString()
}

function getSpotifyMetadataFromUrl(rawUrl) {
  try {
    const parsed = new URL(normalizeUrl(rawUrl))
    const host = parsed.hostname.toLowerCase()
    if (host !== 'open.spotify.com' && !host.endsWith('.open.spotify.com')) {
      return null
    }

    const segments = parsed.pathname.split('/').filter(Boolean)
    const typeIndex = segments[0] === 'embed' ? 1 : 0
    const type = segments[typeIndex]
    const id = segments[typeIndex + 1]

    if (!SPOTIFY_SUPPORTED_TYPES.has(type) || !id) {
      return null
    }

    const cleanId = cleanSpotifyId(id)
    if (!cleanId) {
      return null
    }

    return {
      type,
      id: cleanId,
      url: `https://open.spotify.com/${type}/${cleanId}`,
      searchParams: parsed.searchParams,
    }
  } catch (error) {
    return null
  }
}

function cleanSpotifyId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9]/g, '')
}

function getSpotifyTitle(type) {
  const label = type === 'episode' ? 'Spotify podcast bölümü' : `Spotify ${type}`
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`
}

function getSpotifyEmbedHeight(type) {
  if (type === 'album' || type === 'artist' || type === 'playlist' || type === 'show') {
    return '352'
  }
  return '152'
}

function cleanUrlCandidate(rawUrl) {
  return String(rawUrl || '')
    .trim()
    .replace(/^[<(]+/, '')
    .replace(/[)>.,;!?]+$/, '')
}
