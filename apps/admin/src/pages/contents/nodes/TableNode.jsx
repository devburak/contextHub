import { ElementNode } from 'lexical'

export class TableNode extends ElementNode {
  __columnWidths
  __borderWidth
  __borderColor
  __borderStyle

  constructor(columnWidths = [], borderWidth = 1, borderColor = '#374151', borderStyle = 'solid', key) {
    super(key)
    this.__columnWidths = columnWidths
    this.__borderWidth = borderWidth
    this.__borderColor = borderColor
    this.__borderStyle = borderStyle
  }

  static getType() {
    return 'table'
  }

  static clone(node) {
    return new TableNode(node.__columnWidths, node.__borderWidth, node.__borderColor, node.__borderStyle, node.__key)
  }

  static importDOM() {
    return {
      table: () => ({
        conversion: convertTableElement,
        priority: 1,
      }),
    }
  }

  static importJSON(serializedNode) {
    const { columnWidths, borderWidth, borderColor, borderStyle } = serializedNode
    return $createTableNode(columnWidths, borderWidth, borderColor, borderStyle)
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'table',
      version: 1,
      columnWidths: this.__columnWidths,
      borderWidth: this.__borderWidth,
      borderColor: this.__borderColor,
      borderStyle: this.__borderStyle,
    }
  }

  createDOM() {
    const table = document.createElement('table')
    table.className = 'editor-table'
    table.setAttribute('data-lexical-table', 'true')

    // Apply border styling
    if (this.__borderStyle === 'none') {
      table.style.border = 'none'
    } else {
      table.style.border = `${this.__borderWidth}px ${this.__borderStyle} ${this.__borderColor}`
    }

    // Add selection functionality
    table.addEventListener('click', (e) => {
      // Allow selection when clicking on table border or table element itself
      if (e.target === table) {
        table.classList.add('selected')
        e.stopPropagation()
      }
    })

    return table
  }

  updateDOM(prevNode) {
    return (
      this.__borderWidth !== prevNode.__borderWidth ||
      this.__borderColor !== prevNode.__borderColor ||
      this.__borderStyle !== prevNode.__borderStyle
    )
  }

  canBeEmpty() {
    return false
  }

  isShadowRoot() {
    return false
  }

  getColumnWidths() {
    return this.__columnWidths
  }

  setColumnWidths(columnWidths) {
    const writable = this.getWritable()
    writable.__columnWidths = columnWidths
  }

  getBorderWidth() {
    return this.__borderWidth
  }

  setBorderWidth(borderWidth) {
    const writable = this.getWritable()
    writable.__borderWidth = borderWidth
  }

  getBorderColor() {
    return this.__borderColor
  }

  setBorderColor(borderColor) {
    const writable = this.getWritable()
    writable.__borderColor = borderColor
  }

  getBorderStyle() {
    return this.__borderStyle
  }

  setBorderStyle(borderStyle) {
    const writable = this.getWritable()
    writable.__borderStyle = borderStyle
  }
}

export class TableRowNode extends ElementNode {
  __height

  constructor(height = undefined, key) {
    super(key)
    this.__height = height
  }

  static getType() {
    return 'tablerow'
  }

  static clone(node) {
    return new TableRowNode(node.__height, node.__key)
  }

  static importDOM() {
    return {
      tr: () => ({
        conversion: convertTableRowElement,
        priority: 1,
      }),
    }
  }

  static importJSON(serializedNode) {
    const { height } = serializedNode
    return $createTableRowNode(height)
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'tablerow',
      version: 1,
      height: this.__height,
    }
  }

  createDOM() {
    const tr = document.createElement('tr')
    tr.className = 'editor-table-row'
    if (this.__height) {
      tr.style.height = `${this.__height}px`
    }
    return tr
  }

  updateDOM(prevNode) {
    return this.__height !== prevNode.__height
  }

  canBeEmpty() {
    return false
  }

  isShadowRoot() {
    return false
  }

  getHeight() {
    return this.__height
  }

  setHeight(height) {
    const writable = this.getWritable()
    writable.__height = height
  }
}

export class TableCellNode extends ElementNode {
  __headerState
  __width
  __backgroundColor
  __colSpan
  __rowSpan
  __borderWidth
  __borderColor
  __borderStyle

  constructor(headerState = 0, width = undefined, backgroundColor = null, colSpan = 1, rowSpan = 1, borderWidth = null, borderColor = null, borderStyle = null, key) {
    super(key)
    this.__headerState = headerState
    this.__width = width
    this.__backgroundColor = backgroundColor
    this.__colSpan = colSpan
    this.__rowSpan = rowSpan
    this.__borderWidth = borderWidth
    this.__borderColor = borderColor
    this.__borderStyle = borderStyle
  }

  static getType() {
    return 'tablecell'
  }

  static clone(node) {
    return new TableCellNode(node.__headerState, node.__width, node.__backgroundColor, node.__colSpan, node.__rowSpan, node.__borderWidth, node.__borderColor, node.__borderStyle, node.__key)
  }

  static importDOM() {
    return {
      td: () => ({
        conversion: convertTableCellElement,
        priority: 1,
      }),
      th: () => ({
        conversion: convertTableCellElement,
        priority: 1,
      }),
    }
  }

  static importJSON(serializedNode) {
    const { headerState, width, backgroundColor, colSpan, rowSpan, borderWidth, borderColor, borderStyle } = serializedNode
    return $createTableCellNode(headerState, width, backgroundColor, colSpan, rowSpan, borderWidth, borderColor, borderStyle)
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'tablecell',
      version: 1,
      headerState: this.__headerState,
      width: this.__width,
      backgroundColor: this.__backgroundColor,
      colSpan: this.__colSpan,
      rowSpan: this.__rowSpan,
      borderWidth: this.__borderWidth,
      borderColor: this.__borderColor,
      borderStyle: this.__borderStyle,
    }
  }

  createDOM() {
    const cell = document.createElement(this.__headerState !== 0 ? 'th' : 'td')
    cell.className = 'editor-table-cell'
    cell.setAttribute('data-lexical-editor', 'true')
    
    if (this.__width) {
      cell.style.width = `${this.__width}px`
    }
    if (this.__backgroundColor) {
      cell.style.backgroundColor = this.__backgroundColor
    }
    if (this.__borderWidth && this.__borderColor && this.__borderStyle && this.__borderStyle !== 'none') {
      cell.style.setProperty('border', `${this.__borderWidth}px ${this.__borderStyle} ${this.__borderColor}`, 'important')
    }
    if (this.__colSpan > 1) {
      cell.setAttribute('colspan', this.__colSpan.toString())
    }
    if (this.__rowSpan > 1) {
      cell.setAttribute('rowspan', this.__rowSpan.toString())
    }

    return cell
  }

  updateDOM(prevNode, dom) {
    let needsUpdate = false

    if (this.__headerState !== prevNode.__headerState) {
      needsUpdate = true
    }

    if (this.__width !== prevNode.__width) {
      if (this.__width) {
        dom.style.width = `${this.__width}px`
      } else {
        dom.style.width = ''
      }
      needsUpdate = true
    }

    if (this.__backgroundColor !== prevNode.__backgroundColor) {
      if (this.__backgroundColor) {
        dom.style.backgroundColor = this.__backgroundColor
      } else {
        dom.style.backgroundColor = ''
      }
      needsUpdate = true
    }

    if (this.__borderWidth !== prevNode.__borderWidth ||
        this.__borderColor !== prevNode.__borderColor ||
        this.__borderStyle !== prevNode.__borderStyle) {
      if (this.__borderWidth && this.__borderColor && this.__borderStyle && this.__borderStyle !== 'none') {
        dom.style.setProperty('border', `${this.__borderWidth}px ${this.__borderStyle} ${this.__borderColor}`, 'important')
      } else {
        dom.style.removeProperty('border')
      }
      needsUpdate = true
    }

    if (this.__colSpan !== prevNode.__colSpan) {
      if (this.__colSpan > 1) {
        dom.setAttribute('colspan', this.__colSpan.toString())
      } else {
        dom.removeAttribute('colspan')
      }
      needsUpdate = true
    }

    if (this.__rowSpan !== prevNode.__rowSpan) {
      if (this.__rowSpan > 1) {
        dom.setAttribute('rowspan', this.__rowSpan.toString())
      } else {
        dom.removeAttribute('rowspan')
      }
      needsUpdate = true
    }

    return needsUpdate
  }

  canBeEmpty() {
    return true
  }

  isShadowRoot() {
    return false
  }

  getHeaderState() {
    return this.__headerState
  }

  setHeaderState(headerState) {
    const writable = this.getWritable()
    writable.__headerState = headerState
  }

  getWidth() {
    return this.__width
  }

  setWidth(width) {
    const writable = this.getWritable()
    writable.__width = width
  }

  getColSpan() {
    return this.__colSpan
  }

  setColSpan(colSpan) {
    const writable = this.getWritable()
    writable.__colSpan = colSpan
  }

  getRowSpan() {
    return this.__rowSpan
  }

  setRowSpan(rowSpan) {
    const writable = this.getWritable()
    writable.__rowSpan = rowSpan
  }

  getBackgroundColor() {
    return this.__backgroundColor
  }

  setBackgroundColor(backgroundColor) {
    const writable = this.getWritable()
    writable.__backgroundColor = backgroundColor
  }

  getBorderWidth() {
    return this.__borderWidth
  }

  setBorderWidth(borderWidth) {
    const writable = this.getWritable()
    writable.__borderWidth = borderWidth
  }

  getBorderColor() {
    return this.__borderColor
  }

  setBorderColor(borderColor) {
    const writable = this.getWritable()
    writable.__borderColor = borderColor
  }

  getBorderStyle() {
    return this.__borderStyle
  }

  setBorderStyle(borderStyle) {
    const writable = this.getWritable()
    writable.__borderStyle = borderStyle
  }
}

function convertTableElement(domNode) {
  if (!(domNode instanceof HTMLTableElement)) {
    return null
  }

  const parsedBorder = parseCssBorder(domNode.style.border || domNode.getAttribute('border'))
  const borderWidth = parsedBorder.width ?? 1
  const borderStyle = parsedBorder.style || 'solid'
  const borderColor = parsedBorder.color || '#374151'

  return {
    node: $createTableNode([], borderWidth, borderColor, borderStyle),
  }
}

function convertTableRowElement(domNode) {
  if (!(domNode instanceof HTMLTableRowElement)) {
    return null
  }

  const heightAttr = domNode.getAttribute('height') || domNode.style.height
  const height = heightAttr ? parseInt(heightAttr, 10) || undefined : undefined

  return {
    node: $createTableRowNode(height),
  }
}

function convertTableCellElement(domNode) {
  if (!(domNode instanceof HTMLTableCellElement)) {
    return null
  }

  const headerState = domNode.tagName.toLowerCase() === 'th' ? 1 : 0
  const widthAttr = domNode.getAttribute('width') || domNode.style.width
  const width = widthAttr ? parseInt(widthAttr, 10) || undefined : undefined
  const backgroundColor = domNode.style.backgroundColor || null
  const colSpanAttr = parseInt(domNode.getAttribute('colspan') || '1', 10)
  const rowSpanAttr = parseInt(domNode.getAttribute('rowspan') || '1', 10)
  const parsedBorder = parseCssBorder(domNode.style.border || domNode.getAttribute('border'))

  const colSpan = Number.isNaN(colSpanAttr) ? 1 : colSpanAttr
  const rowSpan = Number.isNaN(rowSpanAttr) ? 1 : rowSpanAttr

  return {
    node: $createTableCellNode(
      headerState,
      width,
      backgroundColor || null,
      colSpan,
      rowSpan,
      parsedBorder.width,
      parsedBorder.color,
      parsedBorder.style
    ),
  }
}

function parseCssBorder(borderValue) {
  if (!borderValue) return { width: null, style: null, color: null }
  const parts = String(borderValue).trim().split(/\s+/).filter(Boolean)
  let width = null
  let style = null
  let color = null

  parts.forEach((part) => {
    const lower = part.toLowerCase()
    if (part.endsWith('px') || /^\d+$/.test(part)) {
      const numeric = parseInt(part, 10)
      if (!Number.isNaN(numeric)) {
        width = numeric
      }
      return
    }
    if (['solid', 'dashed', 'dotted', 'double', 'none'].includes(lower)) {
      style = lower
      return
    }
    if (part.startsWith('#') || lower.startsWith('rgb')) {
      color = part
    }
  })

  return { width, style, color }
}

// Helper functions
export function $createTableNode(columnWidths = [], borderWidth = 1, borderColor = '#374151', borderStyle = 'solid') {
  return new TableNode(columnWidths, borderWidth, borderColor, borderStyle)
}

export function $createTableRowNode(height = undefined) {
  return new TableRowNode(height)
}

export function $createTableCellNode(headerState = 0, width = undefined, backgroundColor = null, colSpan = 1, rowSpan = 1, borderWidth = null, borderColor = null, borderStyle = null) {
  return new TableCellNode(headerState, width, backgroundColor, colSpan, rowSpan, borderWidth, borderColor, borderStyle)
}

export function $isTableNode(node) {
  return node instanceof TableNode
}

export function $isTableRowNode(node) {
  return node instanceof TableRowNode
}

export function $isTableCellNode(node) {
  return node instanceof TableCellNode
}

// Table utility functions
export function $createTableWithDimensions(rows, columns, includeHeaders = false) {
  const table = $createTableNode()

  for (let r = 0; r < rows; r++) {
    const tableRow = $createTableRowNode()

    for (let c = 0; c < columns; c++) {
      const isHeader = includeHeaders && r === 0
      const cell = $createTableCellNode(isHeader ? 1 : 0)

      // Add empty paragraph to cell
      const paragraph = $createParagraphNode()
      cell.append(paragraph)

      tableRow.append(cell)
    }

    table.append(tableRow)
  }

  return table
}

// Cell merging utility functions
export function $mergeCells(selectedCells) {
  if (selectedCells.length < 2) return

  // Find the top-left cell (target cell)
  let targetCell = selectedCells[0]
  let minRow = Infinity
  let minCol = Infinity

  selectedCells.forEach(cell => {
    const { row, col } = $getCellPosition(cell)
    if (row < minRow || (row === minRow && col < minCol)) {
      minRow = row
      minCol = col
      targetCell = cell
    }
  })

  // Calculate merge dimensions
  let maxRow = minRow
  let maxCol = minCol

  selectedCells.forEach(cell => {
    const { row, col } = $getCellPosition(cell)
    maxRow = Math.max(maxRow, row + (cell.getRowSpan() - 1))
    maxCol = Math.max(maxCol, col + (cell.getColSpan() - 1))
  })

  const colSpan = maxCol - minCol + 1
  const rowSpan = maxRow - minRow + 1

  // Merge content from other cells into target cell
  selectedCells.forEach(cell => {
    if (cell !== targetCell) {
      const children = cell.getChildren()
      children.forEach(child => {
        targetCell.append(child)
      })
      cell.remove()
    }
  })

  // Set the target cell's span
  targetCell.setColSpan(colSpan)
  targetCell.setRowSpan(rowSpan)
}

export function $getCellPosition(cell) {
  const row = cell.getParent()
  const table = row.getParent()

  if (!$isTableRowNode(row) || !$isTableNode(table)) {
    return { row: -1, col: -1 }
  }

  const tableRows = table.getChildren()
  const rowIndex = tableRows.indexOf(row)

  const rowCells = row.getChildren()
  const colIndex = rowCells.indexOf(cell)

  return { row: rowIndex, col: colIndex }
}

// Import from lexical for paragraph creation
import { $createParagraphNode } from 'lexical'

// Unmerge cells function
export function $unmergeCells(cell) {
  if (!$isTableCellNode(cell)) return

  const colSpan = cell.getColSpan()
  const rowSpan = cell.getRowSpan()

  // If not merged, do nothing
  if (colSpan <= 1 && rowSpan <= 1) return

  const tableRowNode = cell.getParent()
  const tableNode = tableRowNode?.getParent()

  if (!$isTableRowNode(tableRowNode) || !$isTableNode(tableNode)) return

  // Get cell position
  const { row: startRow, col: startCol } = $getCellPosition(cell)
  const rows = tableNode.getChildren()

  // Reset original cell to single span
  cell.setColSpan(1)
  cell.setRowSpan(1)

  // Add new cells to fill the merged area
  for (let r = 0; r < rowSpan; r++) {
    const targetRowIndex = startRow + r
    if (targetRowIndex >= rows.length) break

    const targetRow = rows[targetRowIndex]
    if (!$isTableRowNode(targetRow)) continue

    for (let c = 0; c < colSpan; c++) {
      // Skip the original cell position (top-left)
      if (r === 0 && c === 0) continue

      const newCell = $createTableCellNode(0)
      const paragraph = $createParagraphNode()
      newCell.append(paragraph)

      // For first row, insert after the original cell
      if (r === 0) {
        const currentCells = targetRow.getChildren()
        const insertIndex = startCol + c

        if (insertIndex < currentCells.length) {
          currentCells[insertIndex].insertBefore(newCell)
        } else {
          targetRow.append(newCell)
        }
      } else {
        // For other rows, insert at column positions
        const currentCells = targetRow.getChildren()
        const insertIndex = startCol + c

        if (insertIndex < currentCells.length) {
          currentCells[insertIndex].insertBefore(newCell)
        } else {
          targetRow.append(newCell)
        }
      }
    }
  }
}
