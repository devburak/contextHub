import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'
import { $getSelection, $isRangeSelection } from 'lexical'
import { $isTableCellNode, $isTableRowNode, $isTableNode } from '../nodes/TableNode.jsx'

/**
 * TableCellFocusPlugin: Google Docs tarzı tablo hücre navigasyonu
 * - Tab/Shift+Tab ile sonraki/önceki hücreye git
 * - Arrow keys ile hücre içinde navigasyon
 * - Double-click ile hücre içeriğini düzenleme moduna al
 */
function TableCellFocusPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    // Tab ve Shift+Tab tuşu işleme
    const handleKeyDown = (event) => {
      const { keyCode, shiftKey } = event
      
      // Tab: 9, Shift+Tab: 9 + shiftKey
      if (keyCode === 9) {
        editor.update(() => {
          const selection = $getSelection()
          
          if (!$isRangeSelection(selection)) return
          
          const currentNode = selection.getNodes()[0]
          if (!currentNode) return
          
          let tableCellNode = null
          
          // Eğer seçim hücre içindeyse, hücreyi bul
          let node = currentNode
          while (node) {
            if ($isTableCellNode(node)) {
              tableCellNode = node
              break
            }
            node = node.getParent()
          }
          
          if (!tableCellNode) return
          
          const tableRowNode = tableCellNode.getParent()
          if (!$isTableRowNode(tableRowNode)) return
          
          const tableNode = tableRowNode.getParent()
          if (!$isTableNode(tableNode)) return
          
          // Hücrenin satır içindeki indeksini bul
          const cellIndex = tableRowNode.getChildren().indexOf(tableCellNode)
          const rows = tableNode.getChildren()
          const rowIndex = rows.indexOf(tableRowNode)
          
          if (cellIndex === -1 || rowIndex === -1) return
          
          let nextCell = null
          
          if (shiftKey) {
            // Shift+Tab: Önceki hücreye git
            if (cellIndex > 0) {
              nextCell = tableRowNode.getChildren()[cellIndex - 1]
            } else if (rowIndex > 0) {
              const prevRow = rows[rowIndex - 1]
              const prevRowCells = prevRow.getChildren()
              nextCell = prevRowCells[prevRowCells.length - 1]
            }
          } else {
            // Tab: Sonraki hücreye git
            if (cellIndex < tableRowNode.getChildren().length - 1) {
              nextCell = tableRowNode.getChildren()[cellIndex + 1]
            } else if (rowIndex < rows.length - 1) {
              const nextRow = rows[rowIndex + 1]
              nextCell = nextRow.getChildren()[0]
            }
          }
          
          if (nextCell && $isTableCellNode(nextCell)) {
            const cellChildren = nextCell.getChildren()
            if (cellChildren.length > 0) {
              // Hücre içindeki ilk paragrafın sonuna imleç koy
              const firstChild = cellChildren[0]
              const endOffset = firstChild.getTextContent().length
              selection.setTextNodeRange(firstChild, endOffset, firstChild, endOffset)
            }
            
            event.preventDefault()
          }
        })
      }
    }

    // Double-click: Hücre içeriğini düzenle - editor state'e focus koy
    const handleDoubleClick = (event) => {
      const cellElement = event.target.closest('.editor-table-cell')
      if (!cellElement) return

      event.preventDefault()
      event.stopPropagation()

      // Seçili class'ını kaldır
      const tableElement = cellElement.closest('.editor-table')
      if (tableElement) {
        tableElement.querySelectorAll('.editor-table-cell.cell-selected').forEach(cell => {
          cell.classList.remove('cell-selected')
        })
      }
      cellElement.classList.remove('cell-selected')

      // Hücrenin contenteditable'ını bul
      const contentEditableDiv = cellElement.querySelector('[contenteditable="true"]')
      if (contentEditableDiv) {
        contentEditableDiv.focus()
      }
    }

    // Global event listeners
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('dblclick', handleDoubleClick, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('dblclick', handleDoubleClick, true)
    }
  }, [editor])

  return null
}

export default TableCellFocusPlugin
