import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  KEY_TAB_COMMAND,
} from 'lexical'
import { $isTableCellNode } from '../nodes/TableNode.jsx'
import { $getAdjacentTableCell } from './tableNavigation.js'

/**
 * TableCellFocusPlugin: Google Docs tarzı tablo hücre navigasyonu
 * - Tab/Shift+Tab ile sonraki/önceki hücreye git
 * - Son hücrede Tab ile yeni satır ekle
 * - Tek tıklamada Lexical'ın doğal hücre düzenleme davranışını koru
 */
function TableCellFocusPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => {
        const { shiftKey } = event
        let handled = false

        editor.update(() => {
          const selection = $getSelection()
          
          if (!$isRangeSelection(selection)) return
          
          const currentNode = selection.anchor.getNode()
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
          
          const nextCell = $getAdjacentTableCell(tableCellNode, shiftKey)
          
          if (nextCell && $isTableCellNode(nextCell)) {
            nextCell.selectStart()
            event.preventDefault()
            handled = true
          }
        })

        return handled
      },
      COMMAND_PRIORITY_EDITOR,
    )
  }, [editor])

  return null
}

export default TableCellFocusPlugin
