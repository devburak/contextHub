import { useState, useRef, useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
} from 'lexical'
import {
  $isTableNode,
  $isTableRowNode,
  $isTableCellNode,
  $createTableRowNode,
  $createTableCellNode,
  $mergeCells
} from '../nodes/TableNode.jsx'

function TableContextMenu({ show, x, y, nodeKey, nodeType, onClose, selectedCells = [] }) {
  const [editor] = useLexicalComposerContext()
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose()
      }
    }

    if (show) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [show, onClose])

  const handleInsertRowAbove = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isTableRowNode(node)) {
        const table = node.getParent()
        if ($isTableNode(table)) {
          const newRow = $createTableRowNode()
          const cellCount = node.getChildrenSize()

          for (let i = 0; i < cellCount; i++) {
            const cell = $createTableCellNode()
            const paragraph = $createParagraphNode()
            cell.append(paragraph)
            newRow.append(cell)
          }

          node.insertBefore(newRow)
        }
      }
    })
    onClose()
  }

  const handleInsertRowBelow = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isTableRowNode(node)) {
        const table = node.getParent()
        if ($isTableNode(table)) {
          const newRow = $createTableRowNode()
          const cellCount = node.getChildrenSize()

          for (let i = 0; i < cellCount; i++) {
            const cell = $createTableCellNode()
            const paragraph = $createParagraphNode()
            cell.append(paragraph)
            newRow.append(cell)
          }

          node.insertAfter(newRow)
        }
      }
    })
    onClose()
  }

  const handleDeleteRow = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isTableRowNode(node)) {
        node.remove()
      }
    })
    onClose()
  }

  const handleDeleteTable = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isTableNode(node)) {
        node.remove()
      } else if ($isTableRowNode(node) || $isTableCellNode(node)) {
        // Find parent table
        let parent = node.getParent()
        while (parent && !$isTableNode(parent)) {
          parent = parent.getParent()
        }
        if ($isTableNode(parent)) {
          parent.remove()
        }
      }
    })
    onClose()
  }

  const handleMergeCells = () => {
    if (selectedCells.length < 2) return

    editor.update(() => {
      const cellNodes = selectedCells.map(cellKey => $getNodeByKey(cellKey)).filter($isTableCellNode)
      if (cellNodes.length >= 2) {
        $mergeCells(cellNodes)
      }
    })
    onClose()
  }

  const handleCellBackgroundColor = (color) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isTableCellNode(node)) {
        node.setBackgroundColor(color)
      }
    })
    onClose()
  }

  if (!show) return null

  return (
    <div
      ref={menuRef}
      className="table-context-menu"
      style={{
        position: 'fixed',
        top: y,
        left: x,
        zIndex: 1000
      }}
    >
      {nodeType === 'tablerow' && (
        <>
          <button
            className="context-menu-item"
            onClick={handleInsertRowAbove}
          >
            Üsüne satır ekle
          </button>
          <button
            className="context-menu-item"
            onClick={handleInsertRowBelow}
          >
            Altına satır ekle
          </button>
          <div className="context-menu-divider" />
          <button
            className="context-menu-item danger"
            onClick={handleDeleteRow}
          >
            Satırı sil
          </button>
        </>
      )}

      {nodeType === 'tablecell' && (
        <>
          {selectedCells.length >= 2 && (
            <>
              <button
                className="context-menu-item"
                onClick={handleMergeCells}
              >
                Hücreleri birleştir
              </button>
              <div className="context-menu-divider" />
            </>
          )}
          <div className="context-menu-item">
            <span>Arka plan rengi:</span>
            <div className="flex gap-1 mt-1">
              <button
                className="w-5 h-5 rounded border border-gray-300"
                style={{ backgroundColor: 'transparent' }}
                onClick={() => handleCellBackgroundColor(null)}
                title="Renk yok"
              />
              <button
                className="w-5 h-5 rounded border border-gray-300"
                style={{ backgroundColor: '#fef3c7' }}
                onClick={() => handleCellBackgroundColor('#fef3c7')}
                title="Sarı"
              />
              <button
                className="w-5 h-5 rounded border border-gray-300"
                style={{ backgroundColor: '#dbeafe' }}
                onClick={() => handleCellBackgroundColor('#dbeafe')}
                title="Mavi"
              />
              <button
                className="w-5 h-5 rounded border border-gray-300"
                style={{ backgroundColor: '#dcfce7' }}
                onClick={() => handleCellBackgroundColor('#dcfce7')}
                title="Yeşil"
              />
              <button
                className="w-5 h-5 rounded border border-gray-300"
                style={{ backgroundColor: '#fed7d7' }}
                onClick={() => handleCellBackgroundColor('#fed7d7')}
                title="Kırmızı"
              />
            </div>
          </div>
        </>
      )}

      <div className="context-menu-divider" />
      <button
        className="context-menu-item danger"
        onClick={handleDeleteTable}
      >
        Tabloyu sil
      </button>
    </div>
  )
}

export default TableContextMenu

// Import from lexical for paragraph creation
import { $createParagraphNode } from 'lexical'