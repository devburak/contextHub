import {
  $createRangeSelection,
  $getNodeByKey,
  $isRangeSelection,
  $setSelection,
} from 'lexical'

function isLinkNodeLike(node) {
  const type = node?.getType?.()
  return type === 'link' || type === 'autolink'
}

export function serializeRangeSelection(selection) {
  if (!$isRangeSelection(selection)) return null

  return {
    anchor: {
      key: selection.anchor.key,
      offset: selection.anchor.offset,
      type: selection.anchor.type,
    },
    focus: {
      key: selection.focus.key,
      offset: selection.focus.offset,
      type: selection.focus.type,
    },
  }
}

export function $restoreSerializedRangeSelection(snapshot) {
  if (!snapshot?.anchor || !snapshot?.focus) return null
  if (!$getNodeByKey(snapshot.anchor.key) || !$getNodeByKey(snapshot.focus.key)) return null

  const selection = $createRangeSelection()
  selection.anchor.set(snapshot.anchor.key, snapshot.anchor.offset, snapshot.anchor.type)
  selection.focus.set(snapshot.focus.key, snapshot.focus.offset, snapshot.focus.type)
  $setSelection(selection)
  return selection
}

export function createTextLinkEditorState(selection) {
  if (!selection || typeof selection.getNodes !== 'function' || typeof selection.getTextContent !== 'function') {
    return null
  }

  const existingLink = selection
    .getNodes()
    .map((node) => {
      if (isLinkNodeLike(node)) return node
      const parent = node.getParent()
      return isLinkNodeLike(parent) ? parent : null
    })
    .find(Boolean)

  return {
    open: true,
    url: existingLink?.getURL?.() || '',
    text: existingLink?.getTextContent() || selection.getTextContent() || '',
    newTab: existingLink
      ? (existingLink.getTarget?.() || '_blank') === '_blank'
      : true,
    linkKey: existingLink?.getKey?.() || null,
    error: '',
    lockText: false,
    type: 'link',
    selection: serializeRangeSelection(selection),
  }
}
