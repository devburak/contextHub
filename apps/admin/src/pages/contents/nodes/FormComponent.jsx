import { memo, useCallback, useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
  $getNodeByKey,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
} from 'lexical'
import clsx from 'clsx'
import { $isFormNode } from './FormNode.jsx'

function FormComponent({ nodeKey, formId, slug, title }) {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const [draft, setDraft] = useState({ formId: formId || '', slug: slug || '', title: title || '' })

  useEffect(() => {
    setDraft({ formId: formId || '', slug: slug || '', title: title || '' })
  }, [formId, slug, title])

  const onClick = useCallback(
    (event) => {
      const target = event.target
      if (target?.closest?.('[data-form-node-controls]')) {
        return false
      }

      if (event.shiftKey) {
        setSelected(!isSelected)
      } else {
        clearSelection()
        setSelected(true)
      }
      return true
    },
    [clearSelection, isSelected, setSelected]
  )

  const onDelete = useCallback(
    (event) => {
      if (!isSelected) {
        return false
      }
      event.preventDefault()
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isFormNode(node)) {
          node.remove()
        }
      })
      return true
    },
    [editor, isSelected, nodeKey]
  )

  const applyEdit = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isFormNode(node)) {
        node.setPayload(draft)
      }
    })
  }, [draft, editor, nodeKey])

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
      editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW)
    )
  }, [editor, onClick, onDelete])

  const displayTitle = title || slug || formId || 'ContextHub Form'

  return (
    <div className="my-6">
      <div
        className={clsx(
          'rounded-lg border bg-white p-4 shadow-sm ring-offset-2 transition',
          isSelected ? 'border-blue-300 ring-2 ring-blue-500' : 'border-gray-200'
        )}
        data-contexthub-form-node
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">ContextHub form</div>
            <div className="mt-1 text-base font-semibold text-gray-900">{displayTitle}</div>
            <div className="mt-1 text-xs text-gray-500">
              {formId ? `ID: ${formId}` : 'ID yok'}
              {slug ? ` · Slug: ${slug}` : ''}
            </div>
          </div>
          <button
            type="button"
            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            onClick={() => setSelected(!isSelected)}
            data-form-node-controls
          >
            Düzenle
          </button>
        </div>

        {isSelected && (
          <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4" data-form-node-controls>
            <label className="text-xs font-medium text-gray-700">
              Başlık
              <input
                type="text"
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-gray-700">
              Form ID
              <input
                type="text"
                value={draft.formId}
                onChange={(event) => setDraft((prev) => ({ ...prev, formId: event.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-gray-700">
              Slug
              <input
                type="text"
                value={draft.slug}
                onChange={(event) => setDraft((prev) => ({ ...prev, slug: event.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={applyEdit}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Uygula
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(FormComponent)
