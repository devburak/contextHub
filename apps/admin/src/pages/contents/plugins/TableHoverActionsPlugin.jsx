import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createParagraphNode } from 'lexical'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { PlusIcon } from '@heroicons/react/20/solid'
import {
  $isTableCellNode,
  $isTableRowNode,
  $isTableNode,
  $createTableRowNode,
  $createTableCellNode
} from '../nodes/TableNode.jsx'

function TableHoverActionsPlugin({ anchorElem = document.body }) {
  const [editor] = useLexicalComposerContext()
  const [showRowButton, setShowRowButton] = useState(false)
  const [showColumnButton, setShowColumnButton] = useState(false)
  const [currentTable, setCurrentTable] = useState(null)
  const [buttonPositions, setButtonPositions] = useState({
    row: { top: 0, left: 0 },
    column: { top: 0, left: 0 }
  })

  const handleTableHover = useCallback((tableElement, isHovering) => {
    if (!isHovering) {
      setShowRowButton(false)
      setShowColumnButton(false)
      setCurrentTable(null)
      return
    }

    // Get table bounds
    const tableRect = tableElement.getBoundingClientRect()
    const anchorRect = anchorElem.getBoundingClientRect()

    // Position row button (bottom center of table, closer)
    const rowButtonTop = tableRect.bottom - anchorRect.top - 12
    const rowButtonLeft = tableRect.left - anchorRect.left + (tableRect.width / 2) - 12

    // Position column button (right center of table, closer)
    const columnButtonTop = tableRect.top - anchorRect.top + (tableRect.height / 2) - 12
    const columnButtonLeft = tableRect.right - anchorRect.left - 12

    setButtonPositions({
      row: { top: rowButtonTop, left: rowButtonLeft },
      column: { top: columnButtonTop, left: columnButtonLeft }
    })

    setCurrentTable(tableElement)
    setShowRowButton(true)
    setShowColumnButton(true)
  }, [anchorElem])

  useEffect(() => {
    const rootElement = editor.getRootElement()
    if (!rootElement) return

    let hideTimeout = null

    const handleMouseMove = (event) => {
      const target = event.target
      const tableElement = target.closest('.editor-table')
      const isOnButton = target.closest('.table-add-row-button, .table-add-column-button')

      // Clear any pending hide timeout
      if (hideTimeout) {
        clearTimeout(hideTimeout)
        hideTimeout = null
      }

      if (tableElement || isOnButton) {
        if (tableElement) {
          handleTableHover(tableElement, true)
        }
        // If on button, keep showing current table buttons
      } else if (currentTable) {
        // Mouse is outside table and buttons, start hide timer
        hideTimeout = setTimeout(() => {
          handleTableHover(null, false)
        }, 100) // Small delay to prevent flicker
      }
    }

    const handleMouseLeave = (event) => {
      const relatedTarget = event.relatedTarget
      const isGoingToButton = relatedTarget?.closest('.table-add-row-button, .table-add-column-button')

      if (!isGoingToButton && !rootElement.contains(relatedTarget)) {
        handleTableHover(null, false)
      }
    }

    rootElement.addEventListener('mousemove', handleMouseMove)
    rootElement.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      if (hideTimeout) clearTimeout(hideTimeout)
      rootElement.removeEventListener('mousemove', handleMouseMove)
      rootElement.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [editor, handleTableHover, currentTable])

  const insertRowAtEnd = useCallback(() => {
    if (!currentTable) return

    editor.update(() => {
      // Find the table node by traversing editor state
      const editorState = editor.getEditorState()
      let tableNode = null

      editorState.read(() => {
        const nodeMap = editorState._nodeMap
        for (const [key, node] of nodeMap) {
          if ($isTableNode(node)) {
            const domElement = editor.getElementByKey(key)
            if (domElement === currentTable) {
              tableNode = node
              break
            }
          }
        }
      })

      if (tableNode) {
        const rows = tableNode.getChildren()
        if (rows.length > 0) {
          const firstRow = rows[0]
          if ($isTableRowNode(firstRow)) {
            const columnCount = firstRow.getChildren().length
            const newRow = $createTableRowNode()

            // Create cells for the new row
            for (let i = 0; i < columnCount; i++) {
              const cell = $createTableCellNode(0)
              const paragraph = $createParagraphNode()
              cell.append(paragraph)
              newRow.append(cell)
            }

            tableNode.append(newRow)
          }
        }
      }
    })
  }, [editor, currentTable])

  const insertColumnAtEnd = useCallback(() => {
    if (!currentTable) return

    editor.update(() => {
      // Find the table node by traversing editor state
      const editorState = editor.getEditorState()
      let tableNode = null

      editorState.read(() => {
        const nodeMap = editorState._nodeMap
        for (const [key, node] of nodeMap) {
          if ($isTableNode(node)) {
            const domElement = editor.getElementByKey(key)
            if (domElement === currentTable) {
              tableNode = node
              break
            }
          }
        }
      })

      if (tableNode) {
        const rows = tableNode.getChildren()
        rows.forEach(row => {
          if ($isTableRowNode(row)) {
            const cell = $createTableCellNode(0)
            const paragraph = $createParagraphNode()
            cell.append(paragraph)
            row.append(cell)
          }
        })
      }
    })
  }, [editor, currentTable])

  return (
    <>
      {showRowButton && createPortal(
        <button
          className="table-add-row-button"
          style={{
            position: 'absolute',
            top: `${buttonPositions.row.top}px`,
            left: `${buttonPositions.row.left}px`,
            zIndex: 20,
            opacity: 0.8
          }}
          onClick={insertRowAtEnd}
          onMouseDown={(e) => e.preventDefault()}
          title="Add row"
        >
          <PlusIcon className="w-4 h-4" />
        </button>,
        anchorElem
      )}

      {showColumnButton && createPortal(
        <button
          className="table-add-column-button"
          style={{
            position: 'absolute',
            top: `${buttonPositions.column.top}px`,
            left: `${buttonPositions.column.left}px`,
            zIndex: 20,
            opacity: 0.8
          }}
          onClick={insertColumnAtEnd}
          onMouseDown={(e) => e.preventDefault()}
          title="Add column"
        >
          <PlusIcon className="w-4 h-4" />
        </button>,
        anchorElem
      )}
    </>
  )
}

export default TableHoverActionsPlugin