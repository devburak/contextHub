import { DecoratorNode } from 'lexical'
import { detectVideoProvider } from '../../../utils/externalMedia.js'
import VideoComponent from './VideoComponent.jsx'

export class VideoNode extends DecoratorNode {
  __url
  __externalUrl
  __provider
  __providerId
  __thumbnailUrl
  __title
  __caption
  __mimeType
  __duration

  constructor({
    url,
    externalUrl,
    provider,
    providerId,
    thumbnailUrl,
    title,
    caption,
    mimeType,
    duration,
  } = {}, key) {
    super(key)
    this.__url = url || externalUrl || ''
    this.__externalUrl = externalUrl || url || ''
    this.__provider = provider || null
    this.__providerId = providerId || null
    this.__thumbnailUrl = thumbnailUrl || null
    this.__title = title || ''
    this.__caption = caption || ''
    this.__mimeType = mimeType || null
    this.__duration = typeof duration === 'number' ? duration : null
  }

  static getType() {
    return 'video'
  }

  static clone(node) {
    return new VideoNode(
      {
        url: node.__url,
        externalUrl: node.__externalUrl,
        provider: node.__provider,
        providerId: node.__providerId,
        thumbnailUrl: node.__thumbnailUrl,
        title: node.__title,
        caption: node.__caption,
        mimeType: node.__mimeType,
        duration: node.__duration,
      },
      node.__key
    )
  }

  static importJSON(serializedNode) {
    const {
      url,
      externalUrl,
      provider,
      providerId,
      thumbnailUrl,
      title,
      caption,
      mimeType,
      duration,
    } = serializedNode
    return $createVideoNode({
      url,
      externalUrl,
      provider,
      providerId,
      thumbnailUrl,
      title,
      caption,
      mimeType,
      duration,
    })
  }

  static importDOM() {
    return {
      iframe: () => ({
        conversion: convertVideoElement,
        priority: 2,
      }),
      video: () => ({
        conversion: convertVideoElement,
        priority: 2,
      }),
    }
  }

  exportJSON() {
    return {
      type: 'video',
      version: 1,
      url: this.__url,
      externalUrl: this.__externalUrl,
      provider: this.__provider,
      providerId: this.__providerId,
      thumbnailUrl: this.__thumbnailUrl,
      title: this.__title,
      caption: this.__caption,
      mimeType: this.__mimeType,
      duration: this.__duration,
    }
  }

  exportDOM() {
    const element = document.createElement('div')
    element.setAttribute('class', 'video-container')

    // Create video element based on source type
    let videoElement

    if (this.__provider === 'youtube' && this.__providerId) {
      // YouTube iframe embed
      videoElement = document.createElement('iframe')
      videoElement.setAttribute('src', `https://www.youtube.com/embed/${this.__providerId}`)
      videoElement.setAttribute('width', '560')
      videoElement.setAttribute('height', '315')
      videoElement.setAttribute('frameborder', '0')
      videoElement.setAttribute('allowfullscreen', 'true')
      videoElement.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture')
    } else if (this.__provider === 'vimeo' && this.__providerId) {
      // Vimeo iframe embed
      videoElement = document.createElement('iframe')
      videoElement.setAttribute('src', `https://player.vimeo.com/video/${this.__providerId}`)
      videoElement.setAttribute('width', '560')
      videoElement.setAttribute('height', '315')
      videoElement.setAttribute('frameborder', '0')
      videoElement.setAttribute('allowfullscreen', 'true')
    } else if (this.__url || this.__externalUrl) {
      // Regular video tag for direct video URLs
      videoElement = document.createElement('video')
      videoElement.setAttribute('controls', 'true')
      videoElement.setAttribute('width', '560')
      if (this.__thumbnailUrl) {
        videoElement.setAttribute('poster', this.__thumbnailUrl)
      }
      videoElement.setAttribute('src', this.__url || this.__externalUrl)
    } else {
      // Fallback: create a placeholder
      videoElement = document.createElement('div')
      videoElement.setAttribute('class', 'video-placeholder')
      videoElement.textContent = 'Video'
    }

    if (this.__title) {
      videoElement.setAttribute('title', this.__title)
    }

    // Preserve metadata for round-trip HTML <-> Lexical conversions
    const dataAttributes = {
      'data-lexical-video': 'true',
      'data-provider': this.__provider || '',
      'data-provider-id': this.__providerId || '',
      'data-url': this.__url || '',
      'data-external-url': this.__externalUrl || '',
      'data-thumbnail': this.__thumbnailUrl || '',
      'data-title': this.__title || '',
      'data-caption': this.__caption || '',
      'data-mime-type': this.__mimeType || '',
      'data-duration': typeof this.__duration === 'number' ? String(this.__duration) : '',
    }

    Object.entries(dataAttributes).forEach(([name, value]) => {
      if (value) {
        videoElement.setAttribute(name, value)
      }
    })

    element.appendChild(videoElement)

    // Add caption if exists
    if (this.__caption) {
      const captionElement = document.createElement('p')
      captionElement.setAttribute('class', 'video-caption')
      captionElement.textContent = this.__caption
      element.appendChild(captionElement)
    }

    return { element }
  }

  createDOM() {
    const span = document.createElement('span')
    span.className = 'editor-video-wrapper'
    return span
  }

  updateDOM() {
    return false
  }

  decorate() {
    return (
      <VideoComponent
        nodeKey={this.getKey()}
        url={this.__url}
        externalUrl={this.__externalUrl}
        provider={this.__provider}
        providerId={this.__providerId}
        thumbnailUrl={this.__thumbnailUrl}
        title={this.__title}
        caption={this.__caption}
        mimeType={this.__mimeType}
        duration={this.__duration}
      />
    )
  }

  setCaption(caption) {
    const writable = this.getWritable()
    writable.__caption = caption || ''
  }

  getCaption() {
    return this.__caption
  }
}

export function $createVideoNode(payload) {
  return new VideoNode(payload || {})
}

export function $isVideoNode(node) {
  return node instanceof VideoNode
}

function convertVideoElement(domNode) {
  const payload = {}

  const dataset = domNode.dataset || {}

  if (domNode instanceof HTMLIFrameElement) {
    const src = domNode.getAttribute('src') || dataset.url || dataset.externalUrl || ''
    if (!src) return null

    const { provider, providerId } = readProviderData(domNode)
    if (!provider) {
      return null
    }
    payload.url = src
    payload.externalUrl = dataset.externalUrl || src
    payload.provider = provider
    payload.providerId = providerId
    payload.title = domNode.getAttribute('title') || dataset.title || ''
  } else if (domNode instanceof HTMLVideoElement) {
    const src = domNode.getAttribute('src') ||
      domNode.querySelector('source')?.getAttribute('src') ||
      dataset.url ||
      dataset.externalUrl ||
      ''
    if (!src) return null

    payload.url = src
    payload.externalUrl = dataset.externalUrl || src
    payload.thumbnailUrl = domNode.getAttribute('poster') || dataset.thumbnail || null
    payload.mimeType = domNode.getAttribute('type') || domNode.querySelector('source')?.getAttribute('type') || dataset.mimeType || null
    payload.title = domNode.getAttribute('title') || dataset.title || ''
    payload.provider = dataset.provider || null
    payload.providerId = dataset.providerId || null
  } else {
    return null
  }

  const captionElement = domNode.parentElement?.querySelector('.video-caption')
  payload.caption = captionElement?.textContent?.trim() || dataset.caption || ''

  if (typeof dataset.duration === 'string' && dataset.duration.trim() !== '') {
    const parsedDuration = Number(dataset.duration)
    if (!Number.isNaN(parsedDuration)) {
      payload.duration = parsedDuration
    }
  }

  return {
    node: $createVideoNode(payload),
  }
}

function readProviderData(domNode) {
  const dataset = domNode.dataset || {}
  const dataProvider = dataset.provider || dataset.providerId ? dataset.provider : null
  const dataProviderId = dataset.providerId || null

  if (dataProvider && dataProviderId) {
    return { provider: dataProvider, providerId: dataProviderId }
  }

  const src = domNode.getAttribute('src') || ''
  return detectVideoProvider(src)
}
