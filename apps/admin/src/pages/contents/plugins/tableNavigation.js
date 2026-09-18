import { $createParagraphNode } from 'lexical'
import {
  $createTableCellNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableRowNode,
  $isTableNode,
} from '../nodes/TableNode.jsx'

export function $getAdjacentTableCell(tableCellNode, backwards = false) {
  if (!$isTableCellNode(tableCellNode)) return null

  const tableRowNode = tableCellNode.getParent()
  if (!$isTableRowNode(tableRowNode)) return null

  const tableNode = tableRowNode.getParent()
  if (!$isTableNode(tableNode)) return null

  const rowCells = tableRowNode.getChildren()
  const rows = tableNode.getChildren()
  const cellIndex = rowCells.indexOf(tableCellNode)
  const rowIndex = rows.indexOf(tableRowNode)

  if (cellIndex === -1 || rowIndex === -1) return null

  if (backwards) {
    if (cellIndex > 0) return rowCells[cellIndex - 1]
    if (rowIndex === 0) return null

    const previousRow = rows[rowIndex - 1]
    const previousRowCells = previousRow.getChildren()
    return previousRowCells[previousRowCells.length - 1] || null
  }

  if (cellIndex < rowCells.length - 1) return rowCells[cellIndex + 1]
  if (rowIndex < rows.length - 1) return rows[rowIndex + 1].getFirstChild()

  // Google Docs davranışı: son hücrede Tab yeni bir satır açar.
  const newRow = $createTableRowNode()

  for (let index = 0; index < rowCells.length; index += 1) {
    const cell = $createTableCellNode()
    cell.append($createParagraphNode())
    newRow.append(cell)
  }

  tableNode.append(newRow)
  return newRow.getFirstChild()
}
