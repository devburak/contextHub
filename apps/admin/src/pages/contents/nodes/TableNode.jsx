import { ElementNode } from 'lexical'

export class TableNode extends ElementNode {
  __columnWidths

  constructor(columnWidths = [], key) {
    super(key)
    this.__columnWidths = columnWidths
  }

  static getType() {
    return 'table'
  }

  static clone(node) {
    return new TableNode(node.__columnWidths, node.__key)
  }

  static importJSON(serializedNode) {
    const { columnWidths } = serializedNode
    return $createTableNode(columnWidths)
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'table',
      version: 1,
      columnWidths: this.__columnWidths,
    }
  }

  createDOM() {
    const table = document.createElement('table')
    table.className = 'editor-table'
    table.setAttribute('data-lexical-table', 'true')

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

  updateDOM() {
    return false
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
}

export class TableRowNode extends ElementNode {
  constructor(key) {
    super(key)
  }

  static getType() {
    return 'tablerow'
  }

  static clone(node) {
    return new TableRowNode(node.__key)
  }

  static importJSON() {
    return $createTableRowNode()
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'tablerow',
      version: 1,
    }
  }

  createDOM() {
    const tr = document.createElement('tr')
    tr.className = 'editor-table-row'
    return tr
  }

  updateDOM() {
    return false
  }

  canBeEmpty() {
    return false
  }

  isShadowRoot() {
    return false
  }
}

export class TableCellNode extends ElementNode {
  __headerState
  __width
  __backgroundColor
  __colSpan
  __rowSpan

  constructor(headerState = 0, width = undefined, backgroundColor = null, colSpan = 1, rowSpan = 1, key) {
    super(key)
    this.__headerState = headerState
    this.__width = width
    this.__backgroundColor = backgroundColor
    this.__colSpan = colSpan
    this.__rowSpan = rowSpan
  }

  static getType() {
    return 'tablecell'
  }

  static clone(node) {
    return new TableCellNode(node.__headerState, node.__width, node.__backgroundColor, node.__colSpan, node.__rowSpan, node.__key)
  }

  static importJSON(serializedNode) {
    const { headerState, width, backgroundColor, colSpan, rowSpan } = serializedNode
    return $createTableCellNode(headerState, width, backgroundColor, colSpan, rowSpan)
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
    }
  }

  createDOM() {
    const cell = document.createElement(this.__headerState !== 0 ? 'th' : 'td')
    cell.className = 'editor-table-cell'
    if (this.__width) {
      cell.style.width = `${this.__width}px`
    }
    if (this.__backgroundColor) {
      cell.style.backgroundColor = this.__backgroundColor
    }
    if (this.__colSpan > 1) {
      cell.setAttribute('colspan', this.__colSpan.toString())
    }
    if (this.__rowSpan > 1) {
      cell.setAttribute('rowspan', this.__rowSpan.toString())
    }

    // Add cell selection
    cell.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        cell.classList.toggle('cell-selected')
        e.stopPropagation()
      }
    })


    return cell
  }

  updateDOM(prevNode) {
    return (
      this.__headerState !== prevNode.__headerState ||
      this.__width !== prevNode.__width ||
      this.__backgroundColor !== prevNode.__backgroundColor ||
      this.__colSpan !== prevNode.__colSpan ||
      this.__rowSpan !== prevNode.__rowSpan
    )
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
}

// Helper functions
export function $createTableNode(columnWidths = []) {
  return new TableNode(columnWidths)
}

export function $createTableRowNode() {
  return new TableRowNode()
}

export function $createTableCellNode(headerState = 0, width = undefined, backgroundColor = null, colSpan = 1, rowSpan = 1) {
  return new TableCellNode(headerState, width, backgroundColor, colSpan, rowSpan)
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
export function $createTableWithDimensions(rows, columns, includeHeaders = true) {
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