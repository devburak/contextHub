import { $getRoot, createEditor } from 'lexical'
import { describe, expect, it } from 'vitest'
import {
  $createTableWithDimensions,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '../nodes/TableNode.jsx'
import { $getAdjacentTableCell } from './tableNavigation.js'

function createTableEditor() {
  return createEditor({
    nodes: [TableNode, TableRowNode, TableCellNode],
    onError(error) {
      throw error
    },
  })
}

describe('$getAdjacentTableCell', () => {
  it('moves between existing cells in both directions', () => {
    const editor = createTableEditor()
    let result

    editor.update(() => {
      const table = $createTableWithDimensions(1, 2)
      $getRoot().append(table)
      const [firstCell, secondCell] = table.getFirstChild().getChildren()

      result = {
        forwards: $getAdjacentTableCell(firstCell) === secondCell,
        backwards: $getAdjacentTableCell(secondCell, true) === firstCell,
      }
    }, { discrete: true })

    expect(result).toEqual({ forwards: true, backwards: true })
  })

  it('adds a matching row when Tab is pressed in the final cell', () => {
    const editor = createTableEditor()
    let result

    editor.update(() => {
      const table = $createTableWithDimensions(1, 3)
      $getRoot().append(table)
      const finalCell = table.getLastChild().getLastChild()
      const nextCell = $getAdjacentTableCell(finalCell)
      const rows = table.getChildren()

      result = {
        rowCount: rows.length,
        newColumnCount: rows[1].getChildrenSize(),
        selectedFirstNewCell: nextCell === rows[1].getFirstChild(),
      }
    }, { discrete: true })

    expect(result).toEqual({
      rowCount: 2,
      newColumnCount: 3,
      selectedFirstNewCell: true,
    })
  })
})
