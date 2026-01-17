import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isRangeSelection, $createParagraphNode } from 'lexical'
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDownIcon,
  TrashIcon,
  PlusIcon,
  SwatchIcon,
  Squares2X2Icon,
  ArrowsPointingOutIcon,
  ArrowsUpDownIcon,
  RectangleGroupIcon
} from '@heroicons/react/20/solid'
import {
  $isTableCellNode,
  $isTableRowNode,
  $isTableNode,
  $createTableRowNode,
  $createTableCellNode,
  $mergeCells,
  $unmergeCells
} from '../nodes/TableNode.jsx'

const SPACE = 6
const BUTTON_SIZE = 20
const VIEWPORT_MARGIN = 8
const SUBMENU_WIDTH = 260
const SELECTION_MENU_GAP = 8

function TableActionMenuPlugin({ anchorElem: _anchorElem = document.body }) {
  const [editor] = useLexicalComposerContext()
  const menuRef = useRef(null)
  const [tableCellNode, setTableCellNode] = useState(null)
  const [showMenu, setShowMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const [menuSource, setMenuSource] = useState('cell')
  const menuSourceRef = useRef(menuSource)
  const [menuAlignment, setMenuAlignment] = useState({
    openLeft: false,
    openUp: false,
    submenuLeft: false,
  })
  const [selectionAnchorRect, setSelectionAnchorRect] = useState(null)
  const [selectedCells, setSelectedCells] = useState([])
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showRowHeightPicker, setShowRowHeightPicker] = useState(false)
  const [showBorderPicker, setShowBorderPicker] = useState(false)

  // Predefined row heights
  const rowHeights = [
    { name: 'Otomatik', value: null },
    { name: 'Küçük (24px)', value: 24 },
    { name: 'Normal (32px)', value: 32 },
    { name: 'Orta (40px)', value: 40 },
    { name: 'Büyük (48px)', value: 48 },
    { name: 'Extra Büyük (64px)', value: 64 },
    { name: 'Çok Büyük (80px)', value: 80 },
  ]

  // Predefined border styles
  const borderStyles = [
    { name: 'Yok', value: 'none', display: 'none' },
    { name: 'Düz', value: 'solid', display: 'solid' },
    { name: 'Kesikli', value: 'dashed', display: 'dashed' },
    { name: 'Noktalı', value: 'dotted', display: 'dotted' },
    { name: 'Çift', value: 'double', display: 'double' },
  ]

  // Predefined border widths
  const borderWidths = [
    { name: 'İnce (1px)', value: 1 },
    { name: 'Normal (2px)', value: 2 },
    { name: 'Kalın (3px)', value: 3 },
    { name: 'Çok Kalın (4px)', value: 4 },
    { name: 'Extra Kalın (5px)', value: 5 },
  ]

  // Predefined border colors
  const borderColors = [
    { name: 'Siyah', value: '#000000', display: '#000000' },
    { name: 'Koyu Gri', value: '#374151', display: '#374151' },
    { name: 'Orta Gri', value: '#6b7280', display: '#6b7280' },
    { name: 'Açık Gri', value: '#9ca3af', display: '#9ca3af' },
    { name: 'Mavi', value: '#3b82f6', display: '#3b82f6' },
    { name: 'Yeşil', value: '#10b981', display: '#10b981' },
    { name: 'Sarı', value: '#f59e0b', display: '#f59e0b' },
    { name: 'Kırmızı', value: '#ef4444', display: '#ef4444' },
  ]

  // Predefined colors
  const colors = [
    { name: 'Yok', value: null, display: 'transparent' },
    { name: 'Açık Gri', value: '#f9fafb', display: '#f9fafb' },
    { name: 'Gri', value: '#f3f4f6', display: '#f3f4f6' },
    { name: 'Açık Mavi', value: '#dbeafe', display: '#dbeafe' },
    { name: 'Mavi', value: '#bfdbfe', display: '#bfdbfe' },
    { name: 'Açık Yeşil', value: '#dcfce7', display: '#dcfce7' },
    { name: 'Yeşil', value: '#bbf7d0', display: '#bbf7d0' },
    { name: 'Açık Sarı', value: '#fef3c7', display: '#fef3c7' },
    { name: 'Sarı', value: '#fde68a', display: '#fde68a' },
    { name: 'Açık Turuncu', value: '#fed7aa', display: '#fed7aa' },
    { name: 'Turuncu', value: '#fdba74', display: '#fdba74' },
    { name: 'Açık Kırmızı', value: '#fecaca', display: '#fecaca' },
    { name: 'Kırmızı', value: '#fca5a5', display: '#fca5a5' },
    { name: 'Açık Mor', value: '#e9d5ff', display: '#e9d5ff' },
    { name: 'Mor', value: '#d8b4fe', display: '#d8b4fe' },
  ]

  const findTableCellInSelection = useCallback(() => {
    return editor.getEditorState().read(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return null

      const nodes = selection.getNodes()
      for (const node of nodes) {
        let current = node
        while (current) {
          if ($isTableCellNode(current)) {
            return current
          }
          current = current.getParent()
        }
      }
      return null
    })
  }, [editor])

  const getSelectedCellElements = useCallback(() => {
    const rootElement = editor.getRootElement()
    if (!rootElement) return []
    return Array.from(rootElement.querySelectorAll('.editor-table-cell.selected-cell'))
  }, [editor])

  const getSelectionBoundingRect = useCallback((cellElements) => {
    if (!cellElements.length) return null

    let top = Infinity
    let left = Infinity
    let right = -Infinity
    let bottom = -Infinity

    cellElements.forEach((cell) => {
      const rect = cell.getBoundingClientRect()
      top = Math.min(top, rect.top)
      left = Math.min(left, rect.left)
      right = Math.max(right, rect.right)
      bottom = Math.max(bottom, rect.bottom)
    })

    return { top, left, right, bottom }
  }, [])

  const getSelectionToolbarRect = useCallback(() => {
    const selectionToolbar = document.querySelector('.table-selection-info')
    if (!selectionToolbar) return null
    return selectionToolbar.getBoundingClientRect()
  }, [])

  const getAnchorCellElement = useCallback((cellElements) => {
    if (!cellElements.length) return null

    let anchor = cellElements[0]
    let anchorRect = anchor.getBoundingClientRect()

    cellElements.forEach((cell) => {
      const rect = cell.getBoundingClientRect()
      if (rect.top < anchorRect.top || (rect.top === anchorRect.top && rect.left < anchorRect.left)) {
        anchor = cell
        anchorRect = rect
      }
    })

    return anchor
  }, [])

  const getCellNodeFromElement = useCallback((cellElement) => {
    if (!cellElement) return null
    let foundNode = null

    editor.getEditorState().read(() => {
      const nodeMap = editor.getEditorState()._nodeMap
      for (const [key, node] of nodeMap) {
        if ($isTableCellNode(node)) {
          const domElement = editor.getElementByKey(key)
          if (domElement === cellElement) {
            foundNode = node
            break
          }
        }
      }
    })

    return foundNode
  }, [editor])

  const updateMenu = useCallback(() => {
    const activeSource = menuSourceRef.current

    if (document.querySelector('.editor-table.table-selected')) {
      setTableCellNode(null)
      setShowMenu(false)
      return
    }

    const selectedCellElements = getSelectedCellElements()
    if (selectedCellElements.length > 0) {
      const selectionRect = getSelectionBoundingRect(selectedCellElements)
      if (!selectionRect) return

      const anchorCell = getAnchorCellElement(selectedCellElements)
      const anchorNode = getCellNodeFromElement(anchorCell)

      if (!anchorNode) {
        setTableCellNode(null)
        setShowMenu(false)
        return
      }

      if (activeSource === 'selection') {
        const toolbarRect = getSelectionToolbarRect()
        const anchorRect = toolbarRect || selectionRect
        const viewportWidth = window.innerWidth

        const left = Math.min(
          Math.max(anchorRect.left, VIEWPORT_MARGIN),
          viewportWidth - 240 - VIEWPORT_MARGIN,
        )
        const top = anchorRect.bottom + SELECTION_MENU_GAP

        setSelectionAnchorRect(anchorRect)
        setMenuPosition({ top, left })
        setTableCellNode(anchorNode)
        return
      }

      setSelectionAnchorRect(null)

      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const rect = selectionRect
      const shouldPlaceLeft = rect.right + BUTTON_SIZE + SPACE > viewportWidth - VIEWPORT_MARGIN
      const leftRaw = shouldPlaceLeft
        ? rect.left - BUTTON_SIZE - SPACE
        : rect.right + SPACE
      const left = Math.min(
        Math.max(leftRaw, VIEWPORT_MARGIN),
        viewportWidth - BUTTON_SIZE - VIEWPORT_MARGIN,
      )
      const top = Math.min(
        Math.max(rect.top, VIEWPORT_MARGIN),
        viewportHeight - BUTTON_SIZE - VIEWPORT_MARGIN,
      )

      setMenuPosition({ top, left })
      setTableCellNode(anchorNode)
      return
    }

    if (activeSource === 'selection') {
      setMenuSource('cell')
      menuSourceRef.current = 'cell'
      setSelectionAnchorRect(null)
    }

    const cellNode = findTableCellInSelection()
    if (cellNode) {
      const cellElement = editor.getElementByKey(cellNode.getKey())
      if (cellElement) {
        const rect = cellElement.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const shouldPlaceLeft = rect.right + BUTTON_SIZE + SPACE > viewportWidth - VIEWPORT_MARGIN
        const leftRaw = shouldPlaceLeft
          ? rect.left - BUTTON_SIZE - SPACE
          : rect.right + SPACE
        const left = Math.min(
          Math.max(leftRaw, VIEWPORT_MARGIN),
          viewportWidth - BUTTON_SIZE - VIEWPORT_MARGIN,
        )
        const top = Math.min(
          Math.max(rect.top, VIEWPORT_MARGIN),
          viewportHeight - BUTTON_SIZE - VIEWPORT_MARGIN,
        )

        setMenuPosition({
          top,
          left,
        })
        setTableCellNode(cellNode)
        return
      }
    }

    setTableCellNode(null)
    setShowMenu(false)
  }, [
    editor,
    findTableCellInSelection,
    getSelectedCellElements,
    getSelectionBoundingRect,
    getSelectionToolbarRect,
    getAnchorCellElement,
    getCellNodeFromElement,
  ])

  useEffect(() => {
    return editor.registerUpdateListener(() => {
      updateMenu()
    })
  }, [editor, updateMenu])

  useEffect(() => {
    const handleSelectionChange = () => updateMenu()
    window.addEventListener('table-selection-change', handleSelectionChange)

    return () => {
      window.removeEventListener('table-selection-change', handleSelectionChange)
    }
  }, [updateMenu])

  useEffect(() => {
    const handleReposition = () => updateMenu()
    window.addEventListener('scroll', handleReposition, true)
    window.addEventListener('resize', handleReposition)

    return () => {
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [updateMenu])

  useLayoutEffect(() => {
    if (!showMenu || !menuRef.current) return

    const menuRect = menuRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    if (menuSourceRef.current === 'selection' && selectionAnchorRect) {
      let top = selectionAnchorRect.bottom + SELECTION_MENU_GAP
      if (top + menuRect.height > viewportHeight - VIEWPORT_MARGIN) {
        top = selectionAnchorRect.top - menuRect.height - SELECTION_MENU_GAP
      }
      top = Math.min(
        Math.max(top, VIEWPORT_MARGIN),
        viewportHeight - menuRect.height - VIEWPORT_MARGIN,
      )

      const left = Math.min(
        Math.max(selectionAnchorRect.left, VIEWPORT_MARGIN),
        viewportWidth - menuRect.width - VIEWPORT_MARGIN,
      )

      if (top !== menuPosition.top || left !== menuPosition.left) {
        setMenuPosition({ top, left })
      }

      const submenuLeft = menuRect.right + SUBMENU_WIDTH > viewportWidth - VIEWPORT_MARGIN
      setMenuAlignment((prev) => {
        if (prev.openUp === false && prev.openLeft === false && prev.submenuLeft === submenuLeft) {
          return prev
        }
        return { openUp: false, openLeft: false, submenuLeft }
      })
      return
    }

    let openUp = menuRect.bottom > viewportHeight - VIEWPORT_MARGIN
    if (openUp && menuRect.top < VIEWPORT_MARGIN) {
      openUp = false
    }

    let openLeft = menuRect.right > viewportWidth - VIEWPORT_MARGIN
    if (openLeft && menuRect.left < VIEWPORT_MARGIN) {
      openLeft = false
    }

    const submenuLeft = menuRect.right + SUBMENU_WIDTH > viewportWidth - VIEWPORT_MARGIN

    setMenuAlignment((prev) => {
      if (prev.openUp === openUp && prev.openLeft === openLeft && prev.submenuLeft === submenuLeft) {
        return prev
      }
      return { openUp, openLeft, submenuLeft }
    })
  }, [showMenu, menuPosition, selectionAnchorRect])

  const getSelectedCells = useCallback(() => {
    const selectedElements = getSelectedCellElements()
    if (!selectedElements.length) return []
    const selectedNodes = []

    editor.getEditorState().read(() => {
      const nodeMap = editor.getEditorState()._nodeMap
      selectedElements.forEach(cellElement => {
        for (const [key, node] of nodeMap) {
          if ($isTableCellNode(node)) {
            const domElement = editor.getElementByKey(key)
            if (domElement === cellElement) {
              selectedNodes.push(node)
              break
            }
          }
        }
      })
    })

    return selectedNodes
  }, [editor, getSelectedCellElements])

  const handleMenuClick = useCallback((event) => {
    event.stopPropagation()
    const cells = getSelectedCells()
    const currentSource = menuSource
    setSelectedCells(cells)
    setMenuSource('cell')
    menuSourceRef.current = 'cell'
    setShowMenu((prev) => (prev && currentSource === 'cell' ? !prev : true))
    updateMenu()
  }, [getSelectedCells, menuSource, updateMenu])

  const resetSubmenus = useCallback(() => {
    setShowColorPicker(false)
    setShowRowHeightPicker(false)
    setShowBorderPicker(false)
  }, [])

  const closeMenu = useCallback(() => {
    setShowMenu(false)
    resetSubmenus()
  }, [resetSubmenus])

  useEffect(() => {
    menuSourceRef.current = menuSource
  }, [menuSource])

  useEffect(() => {
    const handleMenuToggle = (event) => {
      const detail = event?.detail || {}
      const source = detail.source || 'selection'
      const shouldToggle = detail.toggle === true

      if (shouldToggle && showMenu && menuSource === source) {
        closeMenu()
        return
      }

      setMenuSource(source)
      menuSourceRef.current = source
      resetSubmenus()
      setShowMenu(true)
      updateMenu()
    }

    window.addEventListener('table-action-menu', handleMenuToggle)
    return () => {
      window.removeEventListener('table-action-menu', handleMenuToggle)
    }
  }, [showMenu, menuSource, closeMenu, resetSubmenus, updateMenu])

  const toggleColorPicker = useCallback((event) => {
    event.stopPropagation()
    setShowColorPicker(!showColorPicker)
    setShowRowHeightPicker(false)
    setShowBorderPicker(false)
  }, [showColorPicker])

  const toggleRowHeightPicker = useCallback((event) => {
    event.stopPropagation()
    setShowRowHeightPicker(!showRowHeightPicker)
    setShowColorPicker(false)
    setShowBorderPicker(false)
  }, [showRowHeightPicker])

  const toggleBorderPicker = useCallback((event) => {
    event.stopPropagation()
    setShowBorderPicker(!showBorderPicker)
    setShowColorPicker(false)
    setShowRowHeightPicker(false)
  }, [showBorderPicker])

  // Check if current cell is merged
  const isCellMerged = useCallback(() => {
    if (!tableCellNode) return false
    const colSpan = tableCellNode.getColSpan()
    const rowSpan = tableCellNode.getRowSpan()
    return colSpan > 1 || rowSpan > 1
  }, [tableCellNode])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        closeMenu()
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu, closeMenu])

  // Menu Actions
  const mergeCells = useCallback(() => {
    if (selectedCells.length < 2) return
    editor.update(() => {
      $mergeCells(selectedCells)
    })
    closeMenu()
  }, [editor, selectedCells, closeMenu])

  const unmergeCells = useCallback(() => {
    if (!tableCellNode) return
    editor.update(() => {
      $unmergeCells(tableCellNode)
    })
    closeMenu()
  }, [editor, tableCellNode, closeMenu])

  const insertRowAbove = useCallback(() => {
    if (!tableCellNode) return
    editor.update(() => {
      const tableRowNode = tableCellNode.getParent()
      if (!$isTableRowNode(tableRowNode)) return

      const columnCount = tableRowNode.getChildren().length
      const newRow = $createTableRowNode()

      for (let i = 0; i < columnCount; i++) {
        const cell = $createTableCellNode(0)
        cell.append($createParagraphNode())
        newRow.append(cell)
      }

      tableRowNode.insertBefore(newRow)
    })
    closeMenu()
  }, [editor, tableCellNode, closeMenu])

  const insertRowBelow = useCallback(() => {
    if (!tableCellNode) return
    editor.update(() => {
      const tableRowNode = tableCellNode.getParent()
      if (!$isTableRowNode(tableRowNode)) return

      const columnCount = tableRowNode.getChildren().length
      const newRow = $createTableRowNode()

      for (let i = 0; i < columnCount; i++) {
        const cell = $createTableCellNode(0)
        cell.append($createParagraphNode())
        newRow.append(cell)
      }

      tableRowNode.insertAfter(newRow)
    })
    closeMenu()
  }, [editor, tableCellNode, closeMenu])

  const insertColumnLeft = useCallback(() => {
    if (!tableCellNode) return
    editor.update(() => {
      const tableRowNode = tableCellNode.getParent()
      const tableNode = tableRowNode?.getParent()

      if (!$isTableRowNode(tableRowNode) || !$isTableNode(tableNode)) return

      const cellIndex = tableRowNode.getChildren().indexOf(tableCellNode)
      const rows = tableNode.getChildren()

      rows.forEach(row => {
        if (!$isTableRowNode(row)) return
        const cells = row.getChildren()
        const targetCell = cells[cellIndex]

        if (targetCell) {
          const newCell = $createTableCellNode(0)
          newCell.append($createParagraphNode())
          targetCell.insertBefore(newCell)
        }
      })
    })
    closeMenu()
  }, [editor, tableCellNode, closeMenu])

  const insertColumnRight = useCallback(() => {
    if (!tableCellNode) return
    editor.update(() => {
      const tableRowNode = tableCellNode.getParent()
      const tableNode = tableRowNode?.getParent()

      if (!$isTableRowNode(tableRowNode) || !$isTableNode(tableNode)) return

      const cellIndex = tableRowNode.getChildren().indexOf(tableCellNode)
      const rows = tableNode.getChildren()

      rows.forEach(row => {
        if (!$isTableRowNode(row)) return
        const cells = row.getChildren()
        const targetCell = cells[cellIndex]

        if (targetCell) {
          const newCell = $createTableCellNode(0)
          newCell.append($createParagraphNode())
          targetCell.insertAfter(newCell)
        }
      })
    })
    closeMenu()
  }, [editor, tableCellNode, closeMenu])

  const deleteRow = useCallback(() => {
    if (!tableCellNode) return
    editor.update(() => {
      const tableRowNode = tableCellNode.getParent()
      if ($isTableRowNode(tableRowNode)) {
        tableRowNode.remove()
      }
    })
    closeMenu()
  }, [editor, tableCellNode, closeMenu])

  const deleteColumn = useCallback(() => {
    if (!tableCellNode) return
    editor.update(() => {
      const tableRowNode = tableCellNode.getParent()
      const tableNode = tableRowNode?.getParent()

      if (!$isTableRowNode(tableRowNode) || !$isTableNode(tableNode)) return

      const cellIndex = tableRowNode.getChildren().indexOf(tableCellNode)
      const rows = tableNode.getChildren()

      rows.forEach(row => {
        if (!$isTableRowNode(row)) return
        const cells = row.getChildren()
        const targetCell = cells[cellIndex]
        if (targetCell) {
          targetCell.remove()
        }
      })
    })
    closeMenu()
  }, [editor, tableCellNode, closeMenu])

  const deleteTable = useCallback(() => {
    if (!tableCellNode) return
    const confirmed = window.confirm('Tabloyu tamamen silmek istediğinizden emin misiniz?')
    if (!confirmed) return

    editor.update(() => {
      let tableNode = tableCellNode.getParent()
      while (tableNode && !$isTableNode(tableNode)) {
        tableNode = tableNode.getParent()
      }

      if ($isTableNode(tableNode)) {
        tableNode.remove()
      }
    })
    closeMenu()
  }, [editor, tableCellNode, closeMenu])

  const setCellBackgroundColor = useCallback((color) => {
    editor.update(() => {
      if (selectedCells.length === 0 && tableCellNode) {
        // Single cell
        tableCellNode.setBackgroundColor(color)
      } else if (selectedCells.length > 0) {
        // Multiple cells
        selectedCells.forEach(cell => {
          if ($isTableCellNode(cell)) {
            cell.setBackgroundColor(color)
          }
        })
      }
    })
    setShowColorPicker(false)
  }, [editor, selectedCells, tableCellNode])

  const setRowHeight = useCallback((height) => {
    if (!tableCellNode) return

    editor.update(() => {
      const tableRowNode = tableCellNode.getParent()
      if ($isTableRowNode(tableRowNode)) {
        tableRowNode.setHeight(height)
      }
    })
    setShowRowHeightPicker(false)
  }, [editor, tableCellNode])

  const setBorderStyle = useCallback((style) => {
    if (!tableCellNode) return

    editor.update(() => {
      if (selectedCells.length > 0) {
        // Apply to selected cells
        selectedCells.forEach(cell => {
          if ($isTableCellNode(cell)) {
            cell.setBorderStyle(style)
            // Set default width and color if not already set
            if (!cell.getBorderWidth()) cell.setBorderWidth(1)
            if (!cell.getBorderColor()) cell.setBorderColor('#374151')
          }
        })
      } else {
        // Apply to entire table
        let current = tableCellNode.getParent()
        while (current && !$isTableNode(current)) {
          current = current.getParent()
        }
        if (current && $isTableNode(current)) {
          current.setBorderStyle(style)
        }
      }
    })
    setShowBorderPicker(false)
  }, [editor, tableCellNode, selectedCells])

  const setBorderWidth = useCallback((width) => {
    if (!tableCellNode) return

    editor.update(() => {
      if (selectedCells.length > 0) {
        // Apply to selected cells
        selectedCells.forEach(cell => {
          if ($isTableCellNode(cell)) {
            cell.setBorderWidth(width)
            // Set default style and color if not already set
            if (!cell.getBorderStyle()) cell.setBorderStyle('solid')
            if (!cell.getBorderColor()) cell.setBorderColor('#374151')
          }
        })
      } else {
        // Apply to entire table
        let current = tableCellNode.getParent()
        while (current && !$isTableNode(current)) {
          current = current.getParent()
        }
        if (current && $isTableNode(current)) {
          current.setBorderWidth(width)
        }
      }
    })
    setShowBorderPicker(false)
  }, [editor, tableCellNode, selectedCells])

  const setBorderColor = useCallback((color) => {
    if (!tableCellNode) return

    editor.update(() => {
      if (selectedCells.length > 0) {
        // Apply to selected cells
        selectedCells.forEach(cell => {
          if ($isTableCellNode(cell)) {
            cell.setBorderColor(color)
            // Set default style and width if not already set
            if (!cell.getBorderStyle()) cell.setBorderStyle('solid')
            if (!cell.getBorderWidth()) cell.setBorderWidth(1)
          }
        })
      } else {
        // Apply to entire table
        let current = tableCellNode.getParent()
        while (current && !$isTableNode(current)) {
          current = current.getParent()
        }
        if (current && $isTableNode(current)) {
          current.setBorderColor(color)
        }
      }
    })
    setShowBorderPicker(false)
  }, [editor, tableCellNode, selectedCells])

  if (!tableCellNode) {
    return null
  }

  const menuClassName = [
    'table-cell-action-button-container',
    menuAlignment.openLeft ? 'is-menu-left' : '',
    menuAlignment.openUp ? 'is-menu-up' : '',
    menuAlignment.submenuLeft ? 'is-submenu-left' : '',
    menuSource === 'selection' ? 'is-selection-source' : '',
  ].filter(Boolean).join(' ')

  return createPortal(
    <div
      className={menuClassName}
      style={{
        position: 'fixed',
        top: `${menuPosition.top}px`,
        left: `${menuPosition.left}px`,
        zIndex: 20
      }}
    >
      <button
        className="table-cell-action-button chevron-down"
        onClick={handleMenuClick}
        onMouseDown={(e) => e.preventDefault()}
      >
        <ChevronDownIcon className="w-4 h-4" />
      </button>

      {showMenu && (
        <div ref={menuRef} className="table-action-menu">
          {selectedCells.length > 1 && (
            <>
              <button
                className="table-action-item"
                onClick={mergeCells}
              >
                <Squares2X2Icon className="w-4 h-4" />
                Hücreleri birleştir ({selectedCells.length})
              </button>
              <hr className="table-action-divider" />
            </>
          )}

          {isCellMerged() && (
            <>
              <button
                className="table-action-item"
                onClick={unmergeCells}
              >
                <ArrowsPointingOutIcon className="w-4 h-4" />
                Hücreleri ayır
              </button>
              <hr className="table-action-divider" />
            </>
          )}

          <div className="table-action-item-with-submenu">
            <button
              className="table-action-item"
              onClick={toggleColorPicker}
            >
              <SwatchIcon className="w-4 h-4" />
              Arka plan rengi
            </button>

            {showColorPicker && (
              <div className="color-picker-panel">
                <div className="color-picker-header">
                  <span className="color-picker-title">Renk seç</span>
                </div>
                <div className="color-grid">
                  {colors.map((color) => (
                    <button
                      key={color.name}
                      className="color-option"
                      style={{
                        backgroundColor: color.display,
                        border: color.value === null ? '2px solid #e5e7eb' : '1px solid #d1d5db'
                      }}
                      onClick={() => setCellBackgroundColor(color.value)}
                      title={color.name}
                    >
                      {color.value === null && (
                        <div className="no-color-indicator">×</div>
                      )}
                    </button>
                  ))}
                </div>
                <div className="color-picker-footer">
                  <label className="custom-color-label">
                    <span>Özel renk:</span>
                    <input
                      type="color"
                      className="custom-color-input"
                      onChange={(e) => setCellBackgroundColor(e.target.value)}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="table-action-item-with-submenu">
            <button
              className="table-action-item"
              onClick={toggleRowHeightPicker}
            >
              <ArrowsUpDownIcon className="w-4 h-4" />
              Satır yüksekliği
            </button>

            {showRowHeightPicker && (
              <div className="row-height-picker-panel">
                <div className="row-height-picker-header">
                  <span className="row-height-picker-title">Yükseklik seç</span>
                </div>
                <div className="row-height-options">
                  {rowHeights.map((height) => (
                    <button
                      key={height.name}
                      className="row-height-option"
                      onClick={() => setRowHeight(height.value)}
                      title={height.name}
                    >
                      {height.name}
                    </button>
                  ))}
                </div>
                <div className="row-height-picker-footer">
                  <label className="custom-height-label">
                    <span>Özel yükseklik (px):</span>
                    <input
                      type="number"
                      className="custom-height-input"
                      placeholder="32"
                      min="16"
                      max="200"
                      onChange={(e) => {
                        const value = parseInt(e.target.value, 10)
                        if (value && value >= 16 && value <= 200) {
                          setRowHeight(value)
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="table-action-item-with-submenu">
            <button
              className="table-action-item"
              onClick={toggleBorderPicker}
            >
              <RectangleGroupIcon className="w-4 h-4" />
              Tablo kenarlığı
            </button>

            {showBorderPicker && (
              <div className="border-picker-panel">
                <div className="border-picker-header">
                  <span className="border-picker-title">Kenarlık ayarları</span>
                </div>

                <div className="border-picker-section">
                  <label className="border-picker-label">Stil:</label>
                  <div className="border-style-options">
                    {borderStyles.map((style) => (
                      <button
                        key={style.name}
                        className="border-style-option"
                        onClick={() => setBorderStyle(style.value)}
                        title={style.name}
                      >
                        <div className="border-style-preview" style={{
                          borderTop: style.display === 'none' ? 'none' : `2px ${style.display} #374151`,
                          width: '20px',
                          height: '2px'
                        }} />
                        <span>{style.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-picker-section">
                  <label className="border-picker-label">Kalınlık:</label>
                  <div className="border-width-options">
                    {borderWidths.map((width) => (
                      <button
                        key={width.name}
                        className="border-width-option"
                        onClick={() => setBorderWidth(width.value)}
                        title={width.name}
                      >
                        {width.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-picker-section">
                  <label className="border-picker-label">Renk:</label>
                  <div className="border-color-grid">
                    {borderColors.map((color) => (
                      <button
                        key={color.name}
                        className="border-color-option"
                        style={{
                          backgroundColor: color.display,
                          border: '1px solid #d1d5db'
                        }}
                        onClick={() => setBorderColor(color.value)}
                        title={color.name}
                      >
                      </button>
                    ))}
                  </div>
                  <label className="custom-border-color-label">
                    <span>Özel renk:</span>
                    <input
                      type="color"
                      className="custom-border-color-input"
                      onChange={(e) => setBorderColor(e.target.value)}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          <hr className="table-action-divider" />

          <button
            className="table-action-item"
            onClick={insertRowAbove}
          >
            <PlusIcon className="w-4 h-4" />
            Satır yukarı ekle
          </button>
          <button
            className="table-action-item"
            onClick={insertRowBelow}
          >
            <PlusIcon className="w-4 h-4" />
            Satır aşağı ekle
          </button>

          <hr className="table-action-divider" />

          <button
            className="table-action-item"
            onClick={insertColumnLeft}
          >
            <PlusIcon className="w-4 h-4" />
            Sütun sol ekle
          </button>
          <button
            className="table-action-item"
            onClick={insertColumnRight}
          >
            <PlusIcon className="w-4 h-4" />
            Sütun sağ ekle
          </button>

          <hr className="table-action-divider" />

          <button
            className="table-action-item danger"
            onClick={deleteRow}
          >
            <TrashIcon className="w-4 h-4" />
            Satır sil
          </button>
          <button
            className="table-action-item danger"
            onClick={deleteColumn}
          >
            <TrashIcon className="w-4 h-4" />
            Sütun sil
          </button>
          <button
            className="table-action-item danger"
            onClick={deleteTable}
          >
            <TrashIcon className="w-4 h-4" />
            Tabloyu sil
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}

export default TableActionMenuPlugin
