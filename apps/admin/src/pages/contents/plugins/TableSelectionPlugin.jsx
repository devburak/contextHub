import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $getNodeByKey,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical'
import { useEffect, useState, useCallback, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { mergeRegister } from '@lexical/utils'
import {
  ChevronDownIcon,
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

function TableSelectionPlugin({ anchorElem: _anchorElem = document.body }) {
  const [editor] = useLexicalComposerContext()
  const [selectedCells, setSelectedCells] = useState(new Set())
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState(null)
  const [dragCurrent, setDragCurrent] = useState(null)
  const [currentTable, setCurrentTable] = useState(null)
  const [lastClickTime, setLastClickTime] = useState(0)
  const [lastClickedCell, setLastClickedCell] = useState(null)
  const [selectionRect, setSelectionRect] = useState(null)
  const [selectionToolbarPosition, setSelectionToolbarPosition] = useState(null)
  const [selectedTableKey, setSelectedTableKey] = useState(null)
  const [selectedTableRect, setSelectedTableRect] = useState(null)
  const [tableToolbarPosition, setTableToolbarPosition] = useState(null)
  const selectionToolbarRef = useRef(null)
  const tableToolbarRef = useRef(null)
  const notifySelectionChange = useCallback(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('table-selection-change'))
  }, [])

  // Clear all selection
  const clearCellSelection = useCallback(() => {
    // Clear visual classes only in current table
    if (currentTable) {
      currentTable.querySelectorAll('.editor-table-cell.selected-cell').forEach(cell => {
        cell.classList.remove('selected-cell', 'selection-start', 'selection-end', 'selection-corner')
      })
    }
    setSelectedCells(new Set())
    setSelectionRect(null)
    setSelectionToolbarPosition(null)
    setIsSelecting(false)
    setSelectionStart(null)
    setDragCurrent(null)
    setCurrentTable(null)
    notifySelectionChange()
  }, [currentTable, notifySelectionChange])

  const clearTableSelection = useCallback(() => {
    if (selectedTableKey) {
      const tableElement = editor.getElementByKey(selectedTableKey)
      tableElement?.classList.remove('table-selected')
    }
    setSelectedTableKey(null)
    setSelectedTableRect(null)
    setTableToolbarPosition(null)
    notifySelectionChange()
  }, [editor, selectedTableKey, notifySelectionChange])

  const clearAllSelections = useCallback(() => {
    clearCellSelection()
    clearTableSelection()
  }, [clearCellSelection, clearTableSelection])

  const getTableKeyFromElement = useCallback((tableElement) => {
    if (!tableElement) return null
    let tableKey = null

    editor.getEditorState().read(() => {
      const nodeMap = editor.getEditorState()._nodeMap
      for (const [key, node] of nodeMap) {
        if ($isTableNode(node)) {
          const domElement = editor.getElementByKey(key)
          if (domElement === tableElement) {
            tableKey = key
            break
          }
        }
      }
    })

    return tableKey
  }, [editor])

  const selectTable = useCallback((tableElement) => {
    const tableKey = getTableKeyFromElement(tableElement)
    if (!tableKey) return

    if (selectedTableKey && selectedTableKey !== tableKey) {
      const previousTable = editor.getElementByKey(selectedTableKey)
      previousTable?.classList.remove('table-selected')
    }

    tableElement.classList.add('table-selected')
    setSelectedTableKey(tableKey)
    setSelectedTableRect(tableElement.getBoundingClientRect())
    notifySelectionChange()
  }, [editor, getTableKeyFromElement, selectedTableKey, notifySelectionChange])

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

  const updateSelectionRect = useCallback((cellsInRange) => {
    if (!cellsInRange.length) {
      setSelectionRect(null)
      return
    }

    let top = Infinity
    let left = Infinity
    let right = -Infinity
    let bottom = -Infinity

    cellsInRange.forEach(cellElement => {
      const rect = cellElement.getBoundingClientRect()
      top = Math.min(top, rect.top)
      left = Math.min(left, rect.left)
      right = Math.max(right, rect.right)
      bottom = Math.max(bottom, rect.bottom)
    })

    setSelectionRect({
      top,
      left,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    })
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
    updateSelectionRect(cellsInRange)
    notifySelectionChange()
  }, [editor, getCellsInRange, getCellCoordinates, currentTable, updateSelectionRect, notifySelectionChange])

  // Mouse event handlers
  const handleMouseDown = useCallback((event) => {
    const cellElement = event.target.closest('.editor-table-cell')
    const tableElement = event.target.closest('.editor-table')

    if (!tableElement) {
      clearAllSelections()
      return
    }

    if (!cellElement) {
      clearCellSelection()
      selectTable(tableElement)
      event.preventDefault()
      return
    }

    clearTableSelection()

    // Double-click detection
    const now = Date.now()
    const isDoubleClick = lastClickedCell === cellElement && (now - lastClickTime) < 300
    
    setLastClickTime(now)
    setLastClickedCell(cellElement)

    // Eğer double-click ise, seçimi temizle ve edit moduna geç
    if (isDoubleClick) {
      clearCellSelection()
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
  }, [getCellCoordinates, updateSelection, clearCellSelection, clearTableSelection, clearAllSelections, selectTable, lastClickTime, lastClickedCell])

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
      handleMouseDown(event)
    }

    const handleGlobalMouseUp = () => {
      handleMouseUp()
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        clearAllSelections()
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
  }, [editor, handleMouseDown, handleMouseEnter, handleMouseUp, clearAllSelections])

  useEffect(() => {
    if (!selectedTableKey) return

    const updateTableRect = () => {
      const tableElement = editor.getElementByKey(selectedTableKey)
      if (tableElement) {
        setSelectedTableRect(tableElement.getBoundingClientRect())
      }
    }

    updateTableRect()

    window.addEventListener('scroll', updateTableRect, true)
    window.addEventListener('resize', updateTableRect)

    return () => {
      window.removeEventListener('scroll', updateTableRect, true)
      window.removeEventListener('resize', updateTableRect)
    }
  }, [editor, selectedTableKey])

  useLayoutEffect(() => {
    if (!selectionRect || !selectionToolbarRef.current) {
      setSelectionToolbarPosition(null)
      return
    }

    const toolbarRect = selectionToolbarRef.current.getBoundingClientRect()
    setSelectionToolbarPosition(getFloatingPosition(selectionRect, toolbarRect))
  }, [selectionRect])

  useLayoutEffect(() => {
    if (!selectedTableRect || !tableToolbarRef.current) {
      setTableToolbarPosition(null)
      return
    }

    const toolbarRect = tableToolbarRef.current.getBoundingClientRect()
    setTableToolbarPosition(getFloatingPosition(selectedTableRect, toolbarRect))
  }, [selectedTableRect])

  useEffect(() => {
    if (!selectionRect) return

    const updatePosition = () => {
      if (!selectionToolbarRef.current) return
      const toolbarRect = selectionToolbarRef.current.getBoundingClientRect()
      setSelectionToolbarPosition(getFloatingPosition(selectionRect, toolbarRect))
    }

    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [selectionRect])


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

    clearCellSelection()
  }, [editor, selectedCells, clearCellSelection])

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
    clearCellSelection()
  }, [editor, selectedCells, clearCellSelection])

  const toggleSelectionMenu = useCallback((event) => {
    event.preventDefault()
    event.stopPropagation()

    if (!selectionToolbarRef.current) return

    window.dispatchEvent(new CustomEvent('table-action-menu', {
      detail: {
        source: 'selection',
        toggle: true,
      }
    }))
  }, [])

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        () => {
          if (!selectedTableKey) return false
          editor.update(() => {
            const node = $getNodeByKey(selectedTableKey)
            if ($isTableNode(node)) {
              node.remove()
            }
          })
          clearTableSelection()
          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        () => {
          if (!selectedTableKey) return false
          editor.update(() => {
            const node = $getNodeByKey(selectedTableKey)
            if ($isTableNode(node)) {
              node.remove()
            }
          })
          clearTableSelection()
          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [editor, selectedTableKey, clearTableSelection])

  return (
    <>
      {selectedTableKey && createPortal(
        <div
          ref={tableToolbarRef}
          className="table-toolbar"
          style={{
            position: 'fixed',
            top: `${tableToolbarPosition?.top ?? selectedTableRect?.top ?? 0}px`,
            left: `${tableToolbarPosition?.left ?? selectedTableRect?.left ?? 0}px`,
            visibility: tableToolbarPosition ? 'visible' : 'hidden',
          }}
        >
          <span className="table-toolbar-label">Tablo seçildi</span>
          <button
            className="table-toolbar-btn danger"
            onClick={() => {
              editor.update(() => {
                const node = $getNodeByKey(selectedTableKey)
                if ($isTableNode(node)) {
                  node.remove()
                }
              })
              clearTableSelection()
            }}
            title="Tabloyu sil"
          >
            <TrashIcon className="w-4 h-4" />
            Sil
          </button>
        </div>,
        document.body,
      )}
      {selectedCells.size > 0 && createPortal(
        <div
          ref={selectionToolbarRef}
          className="table-selection-info"
          style={{
            position: 'fixed',
            top: `${selectionToolbarPosition?.top ?? selectionRect?.top ?? 0}px`,
            left: `${selectionToolbarPosition?.left ?? selectionRect?.left ?? 0}px`,
            visibility: selectionToolbarPosition ? 'visible' : 'hidden',
          }}
        >
          <div className="selection-count">
            {selectedCells.size} hücre seçili
          </div>
          <div className="selection-actions">
            <button
              className="selection-action-btn menu"
              onClick={toggleSelectionMenu}
              title="Biçimlendirme menüsünü aç"
            >
              <ChevronDownIcon className="w-4 h-4" />
              Biçimlendir
            </button>
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
              onClick={clearCellSelection}
              title="Seçimi iptal et"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

export default TableSelectionPlugin

const TOOLBAR_MARGIN = 8
const TOOLBAR_GAP = 8

function getFloatingPosition(targetRect, toolbarRect) {
  const topPreferred = targetRect.top - toolbarRect.height - TOOLBAR_GAP
  const top = topPreferred > TOOLBAR_MARGIN
    ? topPreferred
    : Math.min(targetRect.bottom + TOOLBAR_GAP, window.innerHeight - toolbarRect.height - TOOLBAR_MARGIN)

  const left = Math.min(
    Math.max(targetRect.left, TOOLBAR_MARGIN),
    window.innerWidth - toolbarRect.width - TOOLBAR_MARGIN
  )

  return { top, left }
}
