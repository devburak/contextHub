import { $createTextNode, $getRoot, createEditor } from 'lexical'
import { describe, expect, it } from 'vitest'
import {
  $createTableWithDimensions,
  $getTableCellTextAlignment,
  $setTableCellTextAlignment,
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

describe('table cell text alignment', () => {
  it('survives JSON and HTML serialization', () => {
    const editor = createTableEditor()
    let result

    editor.update(() => {
      const table = $createTableWithDimensions(1, 1)
      const cell = table.getFirstChild().getFirstChild()
      const paragraph = cell.getFirstChild()
      paragraph.append($createTextNode('Ortalanmış metin'))
      $getRoot().append(table)

      $setTableCellTextAlignment(cell, 'center')
      const serializedCell = cell.exportJSON()
      const restoredCell = TableCellNode.importJSON(serializedCell)
      const html = cell.exportDOM(editor).element.outerHTML

      result = {
        alignment: $getTableCellTextAlignment(cell),
        jsonFormat: serializedCell.format,
        restoredFormat: restoredCell.getFormatType(),
        html,
      }
    }, { discrete: true })

    expect(result.alignment).toBe('center')
    expect(result.jsonFormat).toBe('center')
    expect(result.restoredFormat).toBe('center')
    expect(result.html).toContain('text-align: center')
  })

  it('restores alignment from HTML table cells', () => {
    const editor = createTableEditor()
    const document = new DOMParser().parseFromString(
      '<table><tbody><tr><td style="text-align: right"><p>Sağda</p></td></tr></tbody></table>',
      'text/html'
    )
    let result

    editor.update(() => {
      const htmlCell = document.querySelector('td')
      const conversion = TableCellNode.importDOM().td(htmlCell).conversion(htmlCell)
      const cell = conversion.node
      result = {
        cellFormat: cell.getFormatType(),
        alignment: $getTableCellTextAlignment(cell),
      }
    }, { discrete: true })

    expect(result).toEqual({ cellFormat: 'right', alignment: 'right' })
  })
})
