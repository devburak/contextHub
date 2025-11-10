import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createParagraphNode } from 'lexical'
import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Squares2X2Icon,
  TrashIcon,
  XMarkIcon
} from '@heroicons/react/20/solid'
import {
  $isTableCellNode,
  $isTableRowNode,
  $isTableNode,
  $mergeCells,
  $getCellPosition
} from '../nodes/TableNode.jsx'

function TableSelectionPlugin({ anchorElem = document.body }) {
  const [editor] = useLexicalComposerContext()
  const [selectedCells, setSelectedCells] = useState(new Set())
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState(null)
  const [dragCurrent, setDragCurrent] = useState(null)
  const [currentTable, setCurrentTable] = useState(null)
  const [lastClickTime, setLastClickTime] = useState(0)
  const [lastClickedCell, setLastClickedCell] = useState(null)

  // Clear all selection
  const clearSelection = useCallback(() => {
    // Clear visual classes only in current table
    if (currentTable) {
      currentTable.querySelectorAll('.editor-table-cell.selected-cell').forEach(cell => {
        cell.classList.remove('selected-cell', 'selection-start', 'selection-end', 'selection-corner')
      })
    }
    setSelectedCells(new Set())
    setIsSelecting(false)
    setSelectionStart(null)
    setDragCurrent(null)
    setCurrentTable(null)
  }, [currentTable])

  // Find cell coordinates in table
  const getCellCoordinates = useCallback((cellElement) => {
    const tableElement = cellElement.closest('.editor-table')
    if (!tableElement) return null

    const rows = Array.from(tableElement.querySelectorAll('.editor-table-row'))
    const rowIndex = rows.findIndex(row => row.contains(cellElement))

    if (rowIndex === -1) return null

    const cells = Array.from(rows[rowIndex].querySelectorAll('.editor-table-cell'))
    const colIndex = cells.indexOf(cellElement)

    return colIndex === -1 ? null : { row: rowIndex, col: colIndex }
  }, [])

  // Get cells in rectangle between start and end within the same table
  const getCellsInRange = useCallback((startCoords, endCoords, tableElement) => {
    if (!startCoords || !endCoords || !tableElement) return []

    const minRow = Math.min(startCoords.row, endCoords.row)
    const maxRow = Math.max(startCoords.row, endCoords.row)
    const minCol = Math.min(startCoords.col, endCoords.col)
    const maxCol = Math.max(startCoords.col, endCoords.col)

    const cells = []
    const rows = Array.from(tableElement.querySelectorAll('.editor-table-row'))

    for (let r = minRow; r <= maxRow; r++) {
      if (r >= rows.length) break
      const rowCells = Array.from(rows[r].querySelectorAll('.editor-table-cell'))

      for (let c = minCol; c <= maxCol; c++) {
        if (c < rowCells.length) {
          cells.push(rowCells[c])
        }
      }
    }

    return cells
  }, [])

  // Update visual selection
  const updateSelection = useCallback((startCoords, endCoords, tableElement) => {
    // Clear previous selection only in the current table
    if (currentTable) {
      currentTable.querySelectorAll('.editor-table-cell.selected-cell').forEach(cell => {
        cell.classList.remove('selected-cell', 'selection-start', 'selection-end', 'selection-corner')
      })
    }

    const cellsInRange = getCellsInRange(startCoords, endCoords, tableElement)
    const cellKeys = new Set()

    cellsInRange.forEach((cellElement, index) => {
      cellElement.classList.add('selected-cell')

      // Add position classes
      const coords = getCellCoordinates(cellElement)
      if (!coords) return

      if (coords.row === startCoords.row && coords.col === startCoords.col) {
        cellElement.classList.add('selection-start')
      }
      if (coords.row === endCoords.row && coords.col === endCoords.col) {
        cellElement.classList.add('selection-end')
      }

      // Find cell key
      editor.getEditorState().read(() => {
        const nodeMap = editor.getEditorState()._nodeMap
        for (const [key, node] of nodeMap) {
          if ($isTableCellNode(node)) {
            const domElement = editor.getElementByKey(key)
            if (domElement === cellElement) {
              cellKeys.add(key)
              break
            }
          }
        }
      })
    })

    setSelectedCells(cellKeys)
  }, [editor, getCellsInRange, getCellCoordinates, currentTable])

  // Mouse event handlers
  const handleMouseDown = useCallback((event) => {
    const cellElement = event.target.closest('.editor-table-cell')
    if (!cellElement) {
      clearSelection()
      return
    }

    const tableElement = cellElement.closest('.editor-table')
    if (!tableElement) return

    // Double-click detection
    const now = Date.now()
    const isDoubleClick = lastClickedCell === cellElement && (now - lastClickTime) < 300
    
    setLastClickTime(now)
    setLastClickedCell(cellElement)

    // Eğer double-click ise, seçimi temizle ve edit moduna geç
    if (isDoubleClick) {
      clearSelection()
      return
    }

    const coords = getCellCoordinates(cellElement)
    if (!coords) return

    setCurrentTable(tableElement)
    setIsSelecting(true)
    setSelectionStart(coords)
    setDragCurrent(coords)

    // Start with single cell selection
    updateSelection(coords, coords, tableElement)

    event.preventDefault()
  }, [getCellCoordinates, updateSelection, clearSelection, lastClickTime, lastClickedCell])

  const handleMouseEnter = useCallback((event) => {
    if (!isSelecting || !selectionStart || !currentTable) return

    const cellElement = event.target.closest('.editor-table-cell')
    if (!cellElement) return

    // Check if the cell belongs to the same table
    const tableElement = cellElement.closest('.editor-table')
    if (tableElement !== currentTable) return

    const coords = getCellCoordinates(cellElement)
    if (!coords) return

    setDragCurrent(coords)
    updateSelection(selectionStart, coords, currentTable)
  }, [isSelecting, selectionStart, getCellCoordinates, updateSelection, currentTable])

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false)
  }, [])

  // Setup event listeners
  useEffect(() => {
    const rootElement = editor.getRootElement()
    if (!rootElement) return

    const handleGlobalMouseDown = (event) => {
      const isTableClick = event.target.closest('.editor-table')
      if (!isTableClick) {
        clearSelection()
      } else {
        handleMouseDown(event)
      }
    }

    const handleGlobalMouseUp = () => {
      handleMouseUp()
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        clearSelection()
      }
    }

    rootElement.addEventListener('mousedown', handleGlobalMouseDown)
    rootElement.addEventListener('mouseenter', handleMouseEnter, true)
    document.addEventListener('mouseup', handleGlobalMouseUp)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      rootElement.removeEventListener('mousedown', handleGlobalMouseDown)
      rootElement.removeEventListener('mouseenter', handleMouseEnter, true)
      document.removeEventListener('mouseup', handleGlobalMouseUp)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [editor, handleMouseDown, handleMouseEnter, handleMouseUp, clearSelection])

  // Actions
  const mergeCells = useCallback(() => {
    if (selectedCells.size < 2) return

    editor.update(() => {
      const cellNodes = []
      editor.getEditorState().read(() => {
        const nodeMap = editor.getEditorState()._nodeMap
        selectedCells.forEach(key => {
          const node = nodeMap.get(key)
          if ($isTableCellNode(node)) {
            cellNodes.push(node)
          }
        })
      })

      if (cellNodes.length >= 2) {
        $mergeCells(cellNodes)
      }
    })

    clearSelection()
  }, [editor, selectedCells, clearSelection])

  const clearCellContent = useCallback(() => {
    editor.update(() => {
      const nodeMap = editor.getEditorState()._nodeMap
      selectedCells.forEach(key => {
        const cell = nodeMap.get(key)
        if ($isTableCellNode(cell)) {
          const writable = cell.getWritable()
          // Clear cell content
          const children = writable.getChildren()
          children.forEach(child => child.remove())

          // Add empty paragraph
          const paragraph = $createParagraphNode()
          writable.append(paragraph)
        }
      })
    })
    clearSelection()
  }, [editor, selectedCells, clearSelection])

  return (
    <>
      {selectedCells.size > 0 && (
        <div className="table-selection-info">
          <div className="selection-count">
            {selectedCells.size} hücre seçili
          </div>
          <div className="selection-actions">
            {selectedCells.size > 1 && (
              <button
                className="selection-action-btn merge"
                onClick={mergeCells}
                title="Hücreleri birleştir"
              >
                <Squares2X2Icon className="w-4 h-4" />
                Birleştir
              </button>
            )}
            <button
              className="selection-action-btn clear"
              onClick={clearCellContent}
              title="İçeriği temizle"
            >
              <TrashIcon className="w-4 h-4" />
              Temizle
            </button>
            <button
              className="selection-action-btn cancel"
              onClick={clearSelection}
              title="Seçimi iptal et"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default TableSelectionPlugin