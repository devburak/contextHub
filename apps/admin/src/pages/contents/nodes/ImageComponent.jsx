import { memo, useRef, useEffect, useCallback, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
  $getSelection,
  $isNodeSelection,
  $setSelection,
  $getNodeByKey,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DRAGSTART_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_BACKSPACE_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical'
import { $isImageNode } from './ImageNode.jsx'

const DEFAULT_IMAGE_DIMENSION = 640

function ImageComponent({
  src,
  altText = '',
  width,
  height,
  nodeKey,
  resizable = true
}) {
  const imageRef = useRef(null)
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [isResizing, setIsResizing] = useState(false)

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

  const onEnter = useCallback(
    (event) => {
      const latestSelection = $getSelection()
      const buttonElem = event.target
      if (isSelected && $isNodeSelection(latestSelection) && latestSelection.getNodes().length === 1) {
        if (buttonElem !== null && buttonElem === imageRef.current) {
          event.preventDefault()
          return true
        }
      }
      return false
    },
    [isSelected]
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

  const onRightClick = useCallback(
    (event) => {
      editor.getEditorState().read(() => {
        const latestSelection = $getSelection()
        const domElement = event.target
        if (
          domElement === imageRef.current &&
          $isNodeSelection(latestSelection) &&
          latestSelection.getNodes().length === 1
        ) {
          editor.dispatchCommand(
            RIGHT_CLICK_IMAGE_COMMAND,
            event
          )
        }
      })
    },
    [editor]
  )

  useEffect(() => {
    let isMounted = true
    const unregister = mergeRegister(
      editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
      editor.registerCommand(
        RIGHT_CLICK_IMAGE_COMMAND,
        onClick,
        COMMAND_PRIORITY_LOW
      ),
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
      isMounted = false
      unregister()
    }
  }, [editor, onDelete, onClick])

  const draggable = isSelected && !isResizing

  return (
    <div className="editor-image-container">
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
          <div className="absolute -top-8 left-0 flex items-center gap-2 bg-blue-600 text-white px-2 py-1 rounded text-xs font-medium">
            <span>Görsel seçildi</span>
            <button
              className="text-white hover:text-red-200"
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
      </div>
    </div>
  )
}

const RIGHT_CLICK_IMAGE_COMMAND = 'RIGHT_CLICK_IMAGE_COMMAND'

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
