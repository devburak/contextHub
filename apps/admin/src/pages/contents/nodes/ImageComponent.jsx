import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
  $getNodeByKey,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DRAGSTART_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Captions,
  Eye,
  EyeOff,
  ImagePlus,
  Link2,
  Lock,
  Settings2,
  Trash2,
  Unlock,
  X,
} from 'lucide-react'
import { $createImageNode, $isImageNode } from './ImageNode.jsx'
import {
  dispatchEditorInteractionChange,
  requestTableSelectionClear,
} from '../utils/editorInteractionEvents.js'
import {
  MAX_IMAGE_DIMENSION,
  MIN_IMAGE_DIMENSION,
  clampImageDimension,
  getDisplayDimensions,
  normalizeImageLink,
} from './imageSettings.js'

const ALIGNMENTS = [
  { value: 'left', label: 'Sola yasla', Icon: AlignLeft },
  { value: 'center', label: 'Ortala', Icon: AlignCenter },
  { value: 'right', label: 'Sağa yasla', Icon: AlignRight },
]

function preventToolbarMouseDown(event) {
  event.preventDefault()
  event.stopPropagation()
}

function stopToolbarPropagation(event) {
  event.stopPropagation()
}

function ImageToolbarButton({
  label,
  active = false,
  danger = false,
  showLabel = false,
  disabled = false,
  onClick,
  children,
}) {
  const classNames = [
    'editor-image-toolbar-button',
    'editor-image-tooltip',
    active ? 'is-active' : '',
    danger ? 'editor-image-toolbar-button--danger' : '',
    showLabel ? 'editor-image-toolbar-button--label' : '',
  ].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      className={classNames}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick?.(event)
      }}
      data-tooltip={label}
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function getInitialSettings({
  width,
  height,
  altText,
  alignment,
  caption,
  showCaption,
  linkUrl,
  linkTarget,
}) {
  return {
    width: width ?? '',
    height: height ?? '',
    altText,
    alignment,
    caption,
    showCaption,
    linkUrl,
    openInNewTab: linkTarget === '_blank',
    lockRatio: true,
  }
}

function ImageComponent({
  src,
  altText = '',
  width,
  height,
  alignment = 'center',
  caption = '',
  showCaption = true,
  linkUrl = '',
  linkTarget = '_blank',
  nodeKey,
  resizable = true,
  onReplaceImage = null,
}) {
  const imageRef = useRef(null)
  const settingsTitleRef = useRef(null)
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [isResizing, setIsResizing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [linkError, setLinkError] = useState('')
  const [settings, setSettings] = useState(() => getInitialSettings({
    width,
    height,
    altText,
    alignment,
    caption,
    showCaption,
    linkUrl,
    linkTarget,
  }))

  const replaceImageCallback = onReplaceImage || editor?._editorCallbacks?.onReplaceImage
  const displayDimensions = getDisplayDimensions(width, height)
  const displayWidth = displayDimensions.width
  const displayHeight = displayDimensions.height

  const onDelete = useCallback((event) => {
    if (!isSelected || isEditing) return false
    event.preventDefault()
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      node?.remove()
    })
    return true
  }, [editor, isEditing, isSelected, nodeKey])

  const onClick = useCallback((event) => {
    if (isResizing) return true
    if (event.target !== imageRef.current) return false

    requestTableSelectionClear()
    if (event.shiftKey) {
      setSelected(!isSelected)
    } else {
      clearSelection()
      setSelected(true)
    }
    return true
  }, [clearSelection, isResizing, isSelected, setSelected])

  const handleKeyboardShortcuts = useCallback((event) => {
    if (!isSelected || isEditing) return

    const target = event.target
    if (target instanceof HTMLElement && (target.matches('input, textarea, select, button') || target.isContentEditable)) {
      return
    }

    const isMeta = event.metaKey || event.ctrlKey
    if (!isMeta) return

    if (event.key === 'c' || event.key === 'C' || event.key === 'x' || event.key === 'X') {
      event.preventDefault()
      const shouldRemove = event.key === 'x' || event.key === 'X'
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (!$isImageNode(node)) return
        window.__lexicalClipboard = [{
          type: 'image',
          src: node.getSrc(),
          altText: node.getAltText(),
          width: node.getWidth(),
          height: node.getHeight(),
          alignment: node.getAlignment(),
          caption: node.getCaption(),
          showCaption: node.getShowCaption(),
          linkUrl: node.getLinkUrl(),
          linkTarget: node.getLinkTarget(),
        }]
        if (shouldRemove) node.remove()
      })
      return
    }

    if ((event.key === 'v' || event.key === 'V') && window.__lexicalClipboard?.length > 0) {
      const clipboardData = window.__lexicalClipboard[0]
      if (clipboardData.type !== 'image') return
      event.preventDefault()
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (!$isImageNode(node)) return
        node.insertAfter($createImageNode(clipboardData))
      })
    }
  }, [editor, isEditing, isSelected, nodeKey])

  useEffect(() => mergeRegister(
    editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
    editor.registerCommand(DRAGSTART_COMMAND, (event) => {
      if (event.target !== imageRef.current) return false
      event.preventDefault()
      return true
    }, COMMAND_PRIORITY_LOW),
    editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
    editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
  ), [editor, onClick, onDelete])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardShortcuts)
    return () => document.removeEventListener('keydown', handleKeyboardShortcuts)
  }, [handleKeyboardShortcuts])

  const handleAlignmentChange = useCallback((nextAlignment) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isImageNode(node)) node.setAlignment(nextAlignment)
    })
  }, [editor, nodeKey])

  const handleToggleCaption = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isImageNode(node)) node.setShowCaption(!showCaption)
    })
  }, [editor, nodeKey, showCaption])

  const openSettings = useCallback(() => {
    setSettings(getInitialSettings({
      width,
      height,
      altText,
      alignment,
      caption,
      showCaption,
      linkUrl,
      linkTarget,
    }))
    setLinkError('')
    setIsEditing(true)
  }, [alignment, altText, caption, height, linkTarget, linkUrl, showCaption, width])

  const closeSettings = useCallback(() => {
    setIsEditing(false)
    setLinkError('')
  }, [])

  useEffect(() => {
    if (!isEditing) return undefined
    requestTableSelectionClear()
    dispatchEditorInteractionChange('image-settings-dialog', true)
    document.body.classList.add('editor-image-dialog-open')

    const focusTimer = window.setTimeout(() => settingsTitleRef.current?.focus(), 0)
    const handleEscape = (event) => {
      if (event.key === 'Escape') closeSettings()
    }
    document.addEventListener('keydown', handleEscape)

    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleEscape)
      document.body.classList.remove('editor-image-dialog-open')
      dispatchEditorInteractionChange('image-settings-dialog', false)
    }
  }, [closeSettings, isEditing])

  const updateDimension = useCallback((field, rawValue) => {
    if (rawValue === '') {
      setSettings((current) => ({ ...current, [field]: '' }))
      return
    }

    const value = Number.parseInt(rawValue, 10)
    if (!Number.isFinite(value) || value < 0) return
    setSettings((current) => {
      const next = { ...current, [field]: value }
      if (!current.lockRatio) return next
      const storedWidth = Number(current.width)
      const storedHeight = Number(current.height)
      const image = imageRef.current
      const ratio = storedWidth > 0 && storedHeight > 0
        ? storedWidth / storedHeight
        : image?.naturalWidth && image?.naturalHeight
          ? image.naturalWidth / image.naturalHeight
          : 1
      if (field === 'width') next.height = Math.round(value / ratio)
      if (field === 'height') next.width = Math.round(value * ratio)
      return next
    })
  }, [])

  const useOriginalDimensions = useCallback(() => {
    const image = imageRef.current
    if (!image?.naturalWidth || !image?.naturalHeight) return
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight))
    setSettings((current) => ({
      ...current,
      width: Math.round(image.naturalWidth * scale),
      height: Math.round(image.naturalHeight * scale),
    }))
  }, [])

  const saveSettings = useCallback(() => {
    const normalizedLink = normalizeImageLink(settings.linkUrl)
    if (normalizedLink === null) {
      setLinkError('http(s), e-posta, telefon veya site içi bir bağlantı girin.')
      return
    }

    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!$isImageNode(node)) return
      node.setDimensions({
        width: settings.width === '' ? undefined : clampImageDimension(settings.width),
        height: settings.height === '' ? undefined : clampImageDimension(settings.height),
      })
      node.setAltText(settings.altText.trim())
      node.setAlignment(settings.alignment)
      node.setCaption(settings.caption.trim())
      node.setShowCaption(settings.showCaption)
      node.setLink({
        url: normalizedLink,
        target: settings.openInNewTab ? '_blank' : '_self',
      })
    })
    closeSettings()
  }, [closeSettings, editor, nodeKey, settings])

  const alignmentClassName = alignment === 'left'
    ? 'justify-start'
    : alignment === 'right'
      ? 'justify-end'
      : 'justify-center'
  const draggable = isSelected && !isResizing

  return (
    <div className={`editor-image-container flex ${alignmentClassName}`}>
      <figure className={`relative inline-block max-w-full ${isSelected ? 'selected' : ''}`}>
        {linkUrl ? (
          <a href={linkUrl} target={linkTarget} rel={linkTarget === '_blank' ? 'noopener noreferrer' : undefined} tabIndex={-1} onClick={(event) => event.preventDefault()}>
            <img
              className={`editor-image ${isSelected ? 'focused' : ''} ${draggable ? 'draggable' : ''}`}
              src={src}
              alt={altText}
              ref={imageRef}
              width={displayWidth}
              height={displayHeight}
              style={{ width: displayWidth ? `${displayWidth}px` : 'auto', height: displayHeight ? `${displayHeight}px` : 'auto' }}
              draggable={draggable}
            />
          </a>
        ) : (
          <img
            className={`editor-image ${isSelected ? 'focused' : ''} ${draggable ? 'draggable' : ''}`}
            src={src}
            alt={altText}
            ref={imageRef}
            width={displayWidth}
            height={displayHeight}
            style={{ width: displayWidth ? `${displayWidth}px` : 'auto', height: displayHeight ? `${displayHeight}px` : 'auto' }}
            draggable={draggable}
          />
        )}

        {isSelected && resizable ? (
          <ImageResizer editor={editor} imageRef={imageRef} nodeKey={nodeKey} onResizeStart={() => setIsResizing(true)} onResizeEnd={() => setIsResizing(false)} />
        ) : null}

        {isSelected ? (
          <div className="editor-image-context-toolbar pointer-events-none absolute inset-x-0 top-2 flex items-start justify-center px-2">
            <div
              className="editor-image-context-toolbar__surface pointer-events-auto flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl"
              onPointerDown={stopToolbarPropagation}
              onMouseDown={preventToolbarMouseDown}
              onClick={stopToolbarPropagation}
              onDoubleClick={stopToolbarPropagation}
            >
              <div className="flex items-center" role="group" aria-label="Görsel hizalama">
                {ALIGNMENTS.map(({ value, label, Icon }) => (
                  <ImageToolbarButton key={value} label={label} active={alignment === value} onClick={() => handleAlignmentChange(value)}>
                    <Icon size={16} strokeWidth={1.8} />
                  </ImageToolbarButton>
                ))}
              </div>
              <span className="editor-image-toolbar-divider" aria-hidden="true" />
              <ImageToolbarButton label="Görsel seçeneklerini düzenle" showLabel onClick={openSettings}>
                <Settings2 size={16} strokeWidth={1.8} />
                <span>Düzenle</span>
              </ImageToolbarButton>
              <ImageToolbarButton
                label="Görseli değiştir"
                onClick={(event) => {
                  event.currentTarget.blur()
                  replaceImageCallback?.(nodeKey)
                }}
                disabled={typeof replaceImageCallback !== 'function'}
              >
                <ImagePlus size={16} strokeWidth={1.8} />
              </ImageToolbarButton>
              <ImageToolbarButton label={showCaption ? 'Caption’ı gizle' : 'Caption’ı göster'} active={showCaption} onClick={handleToggleCaption}>
                <Captions size={16} strokeWidth={1.8} />
              </ImageToolbarButton>
              <span className="editor-image-toolbar-divider" aria-hidden="true" />
              <ImageToolbarButton label="Görseli sil" danger onClick={onDelete}>
                <Trash2 size={16} strokeWidth={1.8} />
              </ImageToolbarButton>
            </div>
          </div>
        ) : null}

        {showCaption && caption ? <figcaption className="editor-image-caption mt-2 whitespace-pre-line text-center text-sm italic text-gray-600">{caption}</figcaption> : null}
      </figure>

      {isEditing ? createPortal(
        <div className="editor-image-dialog" onMouseDown={closeSettings}>
          <section className="editor-image-dialog__panel" role="dialog" aria-modal="true" aria-labelledby={`image-settings-title-${nodeKey}`} onMouseDown={(event) => event.stopPropagation()}>
            <header className="editor-image-dialog__header">
              <div>
                <p className="editor-image-dialog__eyebrow">GÖRSEL</p>
                <h2 id={`image-settings-title-${nodeKey}`} ref={settingsTitleRef} className="editor-image-dialog__title" tabIndex={-1}>Görsel seçenekleri</h2>
              </div>
              <button type="button" className="editor-image-dialog__close" onClick={closeSettings} aria-label="Kapat"><X size={20} /></button>
            </header>

            <div className="editor-image-dialog__body">
              <fieldset className="editor-image-settings-section">
                <legend>Yerleşim</legend>
                <div className="editor-image-segmented" role="group" aria-label="Görsel hizalama">
                  {ALIGNMENTS.map(({ value, label, Icon }) => (
                    <button key={value} type="button" className={settings.alignment === value ? 'is-active' : ''} onClick={() => setSettings((current) => ({ ...current, alignment: value }))} aria-pressed={settings.alignment === value}>
                      <Icon size={17} />
                      <span>{label.replace(' yasla', '')}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <section className="editor-image-settings-section">
                <div className="editor-image-settings-heading">
                  <h3>Boyut</h3>
                  <span>{MIN_IMAGE_DIMENSION}–{MAX_IMAGE_DIMENSION} px</span>
                </div>
                <div className="editor-image-dimension-grid">
                  <label>
                    <span>Genişlik</span>
                    <div className="editor-image-input-suffix">
                      <input type="number" min={MIN_IMAGE_DIMENSION} max={MAX_IMAGE_DIMENSION} value={settings.width} onChange={(event) => updateDimension('width', event.target.value)} placeholder="Otomatik" />
                      <span>px</span>
                    </div>
                  </label>
                  <button type="button" className={`editor-image-ratio-button ${settings.lockRatio ? 'is-active' : ''}`} onClick={() => setSettings((current) => ({ ...current, lockRatio: !current.lockRatio }))} aria-pressed={settings.lockRatio} title={settings.lockRatio ? 'En-boy oranı kilitli' : 'En-boy oranı serbest'}>
                    {settings.lockRatio ? <Lock size={16} /> : <Unlock size={16} />}
                  </button>
                  <label>
                    <span>Yükseklik</span>
                    <div className="editor-image-input-suffix">
                      <input type="number" min={MIN_IMAGE_DIMENSION} max={MAX_IMAGE_DIMENSION} value={settings.height} onChange={(event) => updateDimension('height', event.target.value)} placeholder="Otomatik" />
                      <span>px</span>
                    </div>
                  </label>
                </div>
                <div className="editor-image-inline-actions">
                  <button type="button" onClick={useOriginalDimensions}>Özgün boyut</button>
                  <button type="button" onClick={() => setSettings((current) => ({ ...current, width: '', height: '' }))}>Otomatik boyut</button>
                </div>
              </section>

              <fieldset className="editor-image-settings-section">
                <legend>Alternatif metin</legend>
                <label className="editor-image-field">
                  <span className="sr-only">Alternatif metin</span>
                  <textarea value={settings.altText} onChange={(event) => setSettings((current) => ({ ...current, altText: event.target.value }))} maxLength={500} rows={3} placeholder="Görseli, göremeyen birine kısaca anlatın" />
                </label>
                <p className="editor-image-help">Dekoratif görsellerde boş bırakılabilir. Dosya adını tekrar etmeyin.</p>
              </fieldset>

              <section className="editor-image-settings-section">
                <div className="editor-image-settings-heading">
                  <h3>Caption</h3>
                  <label className="editor-image-switch">
                    <input type="checkbox" checked={settings.showCaption} onChange={(event) => setSettings((current) => ({ ...current, showCaption: event.target.checked }))} />
                    <span>{settings.showCaption ? <Eye size={15} /> : <EyeOff size={15} />} Göster</span>
                  </label>
                </div>
                <label className="editor-image-field">
                  <span className="sr-only">Caption</span>
                  <textarea value={settings.caption} onChange={(event) => setSettings((current) => ({ ...current, caption: event.target.value }))} maxLength={1000} rows={3} placeholder="Okuyucuya gösterilecek kısa açıklama" />
                </label>
                <p className="editor-image-help">Güvenli HTML çıktısı için caption düz metin olarak saklanır.</p>
              </section>

              <fieldset className="editor-image-settings-section">
                <legend>Bağlantı</legend>
                <label className="editor-image-field">
                  <span className="editor-image-field__label"><Link2 size={15} /> URL</span>
                  <input type="text" value={settings.linkUrl} onChange={(event) => { setSettings((current) => ({ ...current, linkUrl: event.target.value })); setLinkError('') }} placeholder="https:// veya /site-ici-sayfa" aria-invalid={Boolean(linkError)} aria-describedby={linkError ? `image-link-error-${nodeKey}` : undefined} />
                </label>
                {linkError ? <p id={`image-link-error-${nodeKey}`} className="editor-image-error">{linkError}</p> : null}
                <label className="editor-image-checkbox">
                  <input type="checkbox" checked={settings.openInNewTab} disabled={!settings.linkUrl.trim()} onChange={(event) => setSettings((current) => ({ ...current, openInNewTab: event.target.checked }))} />
                  Yeni sekmede aç
                </label>
              </fieldset>
            </div>

            <footer className="editor-image-dialog__footer">
              <button type="button" className="editor-image-button editor-image-button--secondary" onClick={closeSettings}>İptal</button>
              <button type="button" className="editor-image-button editor-image-button--primary" onClick={saveSettings}>Uygula</button>
            </footer>
          </section>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

function ImageResizer({ editor, imageRef, nodeKey, onResizeStart, onResizeEnd }) {
  const handleMouseDown = useCallback((event) => {
    event.preventDefault()
    onResizeStart()

    const startX = event.clientX
    const image = imageRef.current
    if (!image) return
    const startWidth = Number.parseInt(document.defaultView.getComputedStyle(image).width, 10)
    const startHeight = Number.parseInt(document.defaultView.getComputedStyle(image).height, 10)
    const ratio = startWidth / startHeight

    function handleMouseMove(moveEvent) {
      const nextWidth = clampImageDimension(startWidth + (moveEvent.clientX - startX))
      if (!nextWidth) return
      image.style.width = `${nextWidth}px`
      image.style.height = `${Math.round(nextWidth / ratio)}px`
    }

    function handleMouseUp() {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      onResizeEnd()
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isImageNode(node)) node.setDimensions({ width: clampImageDimension(image.style.width), height: clampImageDimension(image.style.height) })
      })
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [editor, imageRef, nodeKey, onResizeEnd, onResizeStart])

  return <button type="button" className="editor-image-resizer absolute bottom-0 right-0" onMouseDown={handleMouseDown} title="Oranı koruyarak yeniden boyutlandır" aria-label="Görseli yeniden boyutlandır" />
}

export default memo(ImageComponent)
