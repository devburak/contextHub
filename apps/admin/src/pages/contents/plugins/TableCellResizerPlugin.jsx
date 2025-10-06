import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection } from 'lexical'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  $isTableCellNode,
  $isTableRowNode,
  $isTableNode
} from '../nodes/TableNode.jsx'

const MIN_COLUMN_WIDTH = 50

function TableCellResizerPlugin({ anchorElem = document.body }) {
  const [editor] = useLexicalComposerContext()
  const resizerRef = useRef(null)
  const tableRectRef = useRef(null)
  const mouseStartPosRef = useRef(null)
  const [activeCell, setActiveCell] = useState(null)
  const [isResizing, setIsResizing] = useState(false)
  const [resizerPosition, setResizerPosition] = useState({ display: 'none' })

  const resetState = useCallback(() => {
    setActiveCell(null)
    setIsResizing(false)
    setResizerPosition({ display: 'none' })
  }, [])

  const updateResizer = useCallback(() => {
    const selection = $getSelection()

    if (selection == null || !$isRangeSelection(selection)) {
      resetState()
      return
    }

    const tableCellNode = $getTableCellFromSelection(selection)

    if (!$isTableCellNode(tableCellNode)) {
      resetState()
      return
    }

    const tableCellDOM = editor.getElementByKey(tableCellNode.getKey())

    if (tableCellDOM == null) {
      resetState()
      return
    }

    const tableRowNode = tableCellNode.getParent()
    const tableNode = tableRowNode?.getParent()

    if (!$isTableRowNode(tableRowNode) || !$isTableNode(tableNode)) {
      resetState()
      return
    }

    const tableDOM = editor.getElementByKey(tableNode.getKey())

    if (tableDOM == null) {
      resetState()
      return
    }

    const tableCellRect = tableCellDOM.getBoundingClientRect()
    const tableRect = tableDOM.getBoundingClientRect()
    const anchorRect = anchorElem.getBoundingClientRect()

    // Position resizer at right edge of cell
    const left = tableCellRect.right - anchorRect.left - 4
    const top = tableCellRect.top - anchorRect.top
    const height = tableCellRect.height

    setResizerPosition({
      display: 'block',
      left: `${left}px`,
      top: `${top}px`,
      height: `${height}px`,
      cursor: 'col-resize',
    })

    setActiveCell(tableCellNode)
    tableRectRef.current = tableRect
  }, [editor, anchorElem, resetState])

  useEffect(() => {
    return editor.registerUpdateListener(() => {
      editor.getEditorState().read(() => {
        updateResizer()
      })
    })
  }, [editor, updateResizer])

  const mouseDownHandler = useCallback(
    (event) => {
      if (!activeCell) return

      event.preventDefault()
      event.stopPropagation()

      mouseStartPosRef.current = event.clientX
      setIsResizing(true)

      const mouseMoveHandler = (moveEvent) => {
        if (!activeCell || !mouseStartPosRef.current) return

        const diff = moveEvent.clientX - mouseStartPosRef.current
        const tableCellDOM = editor.getElementByKey(activeCell.getKey())

        if (tableCellDOM) {
          const computedStyle = getComputedStyle(tableCellDOM)
          let width = parseInt(computedStyle.width, 10)
          width = Math.max(width + diff, MIN_COLUMN_WIDTH)

          editor.update(() => {
            if ($isTableCellNode(activeCell)) {
              activeCell.setWidth(width)
            }
          })

          mouseStartPosRef.current = moveEvent.clientX
        }
      }

      const mouseUpHandler = () => {
        setIsResizing(false)
        mouseStartPosRef.current = null

        document.removeEventListener('mousemove', mouseMoveHandler)
        document.removeEventListener('mouseup', mouseUpHandler)
      }

      document.addEventListener('mousemove', mouseMoveHandler)
      document.addEventListener('mouseup', mouseUpHandler)
    },
    [activeCell, editor],
  )

  const mouseEnterHandler = useCallback(() => {
    if (!isResizing) {
      setResizerPosition(prev => ({
        ...prev,
        backgroundColor: 'rgba(59, 130, 246, 0.3)',
      }))
    }
  }, [isResizing])

  const mouseLeaveHandler = useCallback(() => {
    if (!isResizing) {
      setResizerPosition(prev => ({
        ...prev,
        backgroundColor: 'transparent',
      }))
    }
  }, [isResizing])

  return createPortal(
    <div
      ref={resizerRef}
      className="table-cell-resizer"
      style={{
        position: 'absolute',
        width: '8px',
        zIndex: 10,
        backgroundColor: 'transparent',
        transition: isResizing ? 'none' : 'background-color 0.2s',
        ...resizerPosition,
      }}
      onMouseDown={mouseDownHandler}
      onMouseEnter={mouseEnterHandler}
      onMouseLeave={mouseLeaveHandler}
    />,
    anchorElem,
  )
}

// Helper functions
function $getTableCellFromSelection(selection) {
  const nodes = selection.getNodes()

  for (const node of nodes) {
    const cell = $findMatchingParent(node, $isTableCellNode)
    if ($isTableCellNode(cell)) {
      return cell
    }
  }
  return null
}

function $findMatchingParent(startingNode, targetFunc) {
  let currNode = startingNode
  while (currNode != null && currNode.getParent() != null) {
    if (targetFunc(currNode)) {
      return currNode
    }
    currNode = currNode.getParent()
  }
  return null
}

export default TableCellResizerPlugin