import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_DELETE_COMMAND,
  KEY_BACKSPACE_COMMAND,
} from 'lexical'
import { $isTableNode } from '../nodes/TableNode.jsx'
import TableContextMenu from './TableContextMenu.jsx'

function TableComponent({ nodeKey, children }) {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })
  const tableRef = useRef(null)

  const onDelete = useCallback(
    (payload) => {
      if (isSelected) {
        const event = payload
        event.preventDefault()
        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (node) {
            node.remove()
          }
        })
        return true
      }
      return false
    },
    [isSelected, nodeKey, editor]
  )

  const onClick = useCallback(
    (payload) => {
      const event = payload
      if (event.target === tableRef.current || tableRef.current?.contains(event.target)) {
        if (event.shiftKey) {
          setSelected(!isSelected)
        } else {
          clearSelection()
          setSelected(true)
        }
        return true
      }
      return false
    },
    [isSelected, setSelected, clearSelection]
  )

  const onRightClick = useCallback(
    (event) => {
      event.preventDefault()
      if (tableRef.current?.contains(event.target)) {
        setContextMenuPosition({ x: event.clientX, y: event.clientY })
        setShowContextMenu(true)
        setSelected(true)
      }
    },
    [setSelected]
  )

  useEffect(() => {
    const table = tableRef.current
    if (table) {
      table.addEventListener('contextmenu', onRightClick)
      return () => table.removeEventListener('contextmenu', onRightClick)
    }
  }, [onRightClick])

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW)
    )
  }, [editor, onClick, onDelete])

  return (
    <div className={`table-wrapper ${isSelected ? 'selected' : ''}`}>
      <table
        ref={tableRef}
        className="editor-table"
        data-lexical-table
      >
        {children}
      </table>

      {showContextMenu && (
        <TableContextMenu
          show={showContextMenu}
          x={contextMenuPosition.x}
          y={contextMenuPosition.y}
          nodeKey={nodeKey}
          nodeType="table"
          onClose={() => setShowContextMenu(false)}
        />
      )}

      {isSelected && (
        <div className="table-selection-toolbar">
          <span className="table-selected-label">Tablo seçildi</span>
          <button
            className="table-delete-btn"
            onClick={() => {
              editor.update(() => {
                const node = $getNodeByKey(nodeKey)
                if (node) {
                  node.remove()
                }
              })
            }}
            title="Tabloyu sil"
          >
            🗑️
          </button>
        </div>
      )}
    </div>
  )
}

export default TableComponent

import { $getNodeByKey } from 'lexical'