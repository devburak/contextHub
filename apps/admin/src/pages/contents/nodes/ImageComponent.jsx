import { memo, useRef, useEffect, useCallback, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
  $getSelection,
  $isNodeSelection,
  $getNodeByKey,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DRAGSTART_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_BACKSPACE_COMMAND,
} from 'lexical'
import { $isImageNode } from './ImageNode.jsx'

const DEFAULT_IMAGE_DIMENSION = 640

function ImageComponent({
  src,
  altText = '',
  width,
  height,
  alignment = 'center',
  caption = '',
  showCaption = true,
  nodeKey,
  resizable = true
}) {
  const imageRef = useRef(null)
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [isResizing, setIsResizing] = useState(false)
  const [isEditingCaption, setIsEditingCaption] = useState(false)
  const [editCaption, setEditCaption] = useState(caption)

  const clampedWidth = typeof width === 'number' ? Math.min(width, DEFAULT_IMAGE_DIMENSION) : undefined
  const clampedHeight = typeof height === 'number' ? Math.min(height, DEFAULT_IMAGE_DIMENSION) : undefined

  const onDelete = useCallback(
    (payload) => {
      if (isSelected) {
        const event = payload
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (node) {
            node.remove()
          }
        })
        return true
      }
      return false
    },
    [isSelected, nodeKey, editor]
  )

  const onClick = useCallback(
    (payload) => {
      const event = payload
      if (isResizing) {
        return true
      }
      if (event.target === imageRef.current) {
        if (event.shiftKey) {
          setSelected(!isSelected)
        } else {
          clearSelection()
          setSelected(true)
        }
        return true
      }
      return false
    },
    [isResizing, isSelected, setSelected, clearSelection]
  )

  useEffect(() => {
    const unregister = mergeRegister(
      editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
      editor.registerCommand(
        DRAGSTART_COMMAND,
        (event) => {
          if (event.target === imageRef.current) {
            event.preventDefault()
            return true
          }
          return false
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        onDelete,
        COMMAND_PRIORITY_LOW
      )
    )
    return () => {
      unregister()
    }
  }, [editor, onDelete, onClick])

  const handleAlignmentChange = useCallback((newAlignment) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isImageNode(node)) {
        node.setAlignment(newAlignment)
      }
    })
  }, [editor, nodeKey])

  const handleCaptionChange = useCallback((newCaption) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isImageNode(node)) {
        node.setCaption(newCaption)
      }
    })
  }, [editor, nodeKey])

  const handleToggleCaption = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isImageNode(node)) {
        node.setShowCaption(!showCaption)
      }
    })
  }, [editor, nodeKey, showCaption])

  const handleSaveCaption = useCallback(() => {
    handleCaptionChange(editCaption)
    setIsEditingCaption(false)
  }, [handleCaptionChange, editCaption])

  const handleCancelCaption = useCallback(() => {
    setEditCaption(caption)
    setIsEditingCaption(false)
  }, [caption])

  // Sync edit caption with prop changes
  useEffect(() => {
    setEditCaption(caption)
  }, [caption])

  const draggable = isSelected && !isResizing

  const getAlignmentStyle = () => {
    switch (alignment) {
      case 'left':
        return 'justify-start'
      case 'right':
        return 'justify-end'
      case 'center':
      default:
        return 'justify-center'
    }
  }

  return (
    <div className={`editor-image-container flex ${getAlignmentStyle()}`}>
      <div
        className={`relative inline-block max-w-full ${
          isSelected ? 'selected' : ''
        }`}
      >
        <img
          className={`editor-image ${
            isSelected ? 'focused' : ''
          } ${draggable ? 'draggable' : ''}`}
          src={src}
          alt={altText}
          ref={imageRef}
          style={{
            maxWidth: `${DEFAULT_IMAGE_DIMENSION}px`,
            maxHeight: `${DEFAULT_IMAGE_DIMENSION}px`,
            width: clampedWidth ? `${clampedWidth}px` : 'auto',
            height: clampedHeight ? `${clampedHeight}px` : 'auto',
          }}
          draggable={draggable}
        />

        {isSelected && resizable && (
          <ImageResizer
            editor={editor}
            imageRef={imageRef}
            nodeKey={nodeKey}
            onResizeStart={() => setIsResizing(true)}
            onResizeEnd={() => setIsResizing(false)}
          />
        )}

        {isSelected && (
          <div className="absolute -top-16 left-0 flex items-center gap-2 bg-blue-600 text-white px-2 py-1 rounded text-xs font-medium">
            <span>Görsel seçildi</span>
            <div className="flex items-center gap-1 ml-2">
              <button
                className={`w-6 h-6 flex items-center justify-center rounded ${alignment === 'left' ? 'bg-blue-400' : 'bg-blue-700'} hover:bg-blue-500`}
                onClick={() => handleAlignmentChange('left')}
                title="Sola yasla"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 6h16M4 12h8M4 18h16"/>
                </svg>
              </button>
              <button
                className={`w-6 h-6 flex items-center justify-center rounded ${alignment === 'center' ? 'bg-blue-400' : 'bg-blue-700'} hover:bg-blue-500`}
                onClick={() => handleAlignmentChange('center')}
                title="Ortala"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 6h16M8 12h8M4 18h16"/>
                </svg>
              </button>
              <button
                className={`w-6 h-6 flex items-center justify-center rounded ${alignment === 'right' ? 'bg-blue-400' : 'bg-blue-700'} hover:bg-blue-500`}
                onClick={() => handleAlignmentChange('right')}
                title="Sağa yasla"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 6h16M12 12h8M4 18h16"/>
                </svg>
              </button>
            </div>
            <div className="w-px h-4 bg-blue-400 mx-1"></div>
            <div className="flex items-center gap-1">
              <button
                className={`w-6 h-6 flex items-center justify-center rounded ${showCaption ? 'bg-blue-400' : 'bg-blue-700'} hover:bg-blue-500`}
                onClick={handleToggleCaption}
                title="Caption görünürlüğü"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 10h18M3 14h18M3 6h18M3 18h18"/>
                </svg>
              </button>
              {showCaption && (
                <button
                  className="w-6 h-6 flex items-center justify-center rounded bg-blue-700 hover:bg-blue-500"
                  onClick={() => setIsEditingCaption(true)}
                  title="Caption düzenle"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              )}
            </div>
            <button
              className="text-white hover:text-red-200 ml-2"
              onClick={() => {
                editor.update(() => {
                  const node = $getNodeByKey(nodeKey)
                  if (node) {
                    node.remove()
                  }
                })
              }}
              title="Görseli sil"
            >
              ×
            </button>
          </div>
        )}

        {showCaption && caption && (
          <div className="mt-2 text-sm text-gray-600 text-center italic">
            {caption}
          </div>
        )}
      </div>

      {/* Caption Edit Modal */}
      {isEditingCaption && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium mb-4">Caption Düzenle</h3>
            <textarea
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg resize-none"
              rows="3"
              placeholder="Görsel açıklaması..."
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={handleCancelCaption}
                className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                İptal
              </button>
              <button
                onClick={handleSaveCaption}
                className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ImageResizer({ editor, imageRef, nodeKey, onResizeStart, onResizeEnd }) {
  const controlRef = useRef(null)

  const handleMouseDown = useCallback(
    (event) => {
      event.preventDefault()
      onResizeStart()

      const startX = event.clientX
      const startY = event.clientY
      const image = imageRef.current
      if (!image) return

      const startWidth = parseInt(document.defaultView.getComputedStyle(image).width, 10)
      const startHeight = parseInt(document.defaultView.getComputedStyle(image).height, 10)
      const ratio = startWidth / startHeight

      function handleMouseMove(moveEvent) {
        const currentX = moveEvent.clientX
        const currentY = moveEvent.clientY
        const diffX = currentX - startX
        const diffY = currentY - startY

        const newWidth = startWidth + diffX
        const newHeight = startHeight + diffY

        const constrainedWidth = Math.max(100, Math.min(newWidth, DEFAULT_IMAGE_DIMENSION))
        const constrainedHeight = constrainedWidth / ratio

        if (image) {
          image.style.width = `${constrainedWidth}px`
          image.style.height = `${constrainedHeight}px`
        }
      }

      function handleMouseUp() {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        onResizeEnd()

        const image = imageRef.current
        if (!image) return

        const newWidth = parseInt(image.style.width, 10)
        const newHeight = parseInt(image.style.height, 10)

        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if ($isImageNode(node)) {
            node.setDimensions({ width: newWidth, height: newHeight })
          }
        })
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [editor, imageRef, nodeKey, onResizeEnd, onResizeStart]
  )

  return (
    <div
      ref={controlRef}
      className="absolute bottom-0 right-0 w-4 h-4 bg-blue-600 cursor-se-resize border border-white"
      style={{
        transform: 'translate(50%, 50%)',
      }}
      onMouseDown={handleMouseDown}
      title="Yeniden boyutlandır"
    />
  )
}

export default memo(ImageComponent)
export { DEFAULT_IMAGE_DIMENSION }
