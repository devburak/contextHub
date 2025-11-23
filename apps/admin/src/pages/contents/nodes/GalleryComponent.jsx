import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { mergeRegister } from '@lexical/utils'
import {
    $getNodeByKey,
    $getSelection,
    $isNodeSelection,
    CLICK_COMMAND,
    COMMAND_PRIORITY_LOW,
    KEY_DELETE_COMMAND,
    KEY_BACKSPACE_COMMAND,
} from 'lexical'
import { useCallback, useEffect } from 'react'
import clsx from 'clsx'
import { $isGalleryNode } from './GalleryNode'
import { mediaToImagePayload } from '../utils/mediaHelpers.js'

export default function GalleryComponent({
    images,
    layout,
    nodeKey,
}) {
    const [editor] = useLexicalComposerContext()
    const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
    const galleryImages = Array.isArray(images) ? images : []
    const openMediaPicker = editor?._editorCallbacks?.openMediaPicker
    const canEditImages = typeof openMediaPicker === 'function'

    const onDelete = useCallback(
        (payload) => {
            if (isSelected && $isNodeSelection($getSelection())) {
                const event = payload
                event.preventDefault()
                const node = $getNodeByKey(nodeKey)
                if ($isGalleryNode(node)) {
                    node.remove()
                }
            }
            return false
        },
        [isSelected, nodeKey]
    )

    useEffect(() => {
        return mergeRegister(
            editor.registerCommand(
                CLICK_COMMAND,
                (event) => {
                    if (event.target.closest('.editor-gallery-wrapper')) {
                        clearSelection()
                        setSelected(true)
                        return true
                    }
                    return false
                },
                COMMAND_PRIORITY_LOW
            ),
            editor.registerCommand(
                KEY_DELETE_COMMAND,
                onDelete,
                COMMAND_PRIORITY_LOW
            ),
            editor.registerCommand(
                KEY_BACKSPACE_COMMAND,
                onDelete,
                COMMAND_PRIORITY_LOW
            )
        )
    }, [clearSelection, editor, isSelected, onDelete, setSelected])

    const handleReplaceImage = useCallback((index) => {
        if (typeof openMediaPicker !== 'function') return

        openMediaPicker({
            mode: 'image',
            onSelect: (media) => {
                const payload = mediaToImagePayload(media)
                if (!payload) return

                editor.update(() => {
                    const node = $getNodeByKey(nodeKey)
                    if ($isGalleryNode(node)) {
                        node.updateImageAt(index, payload)
                    }
                })
            },
        })
    }, [editor, nodeKey, openMediaPicker])

    const handleRemoveImage = useCallback((index) => {
        editor.update(() => {
            const node = $getNodeByKey(nodeKey)
            if ($isGalleryNode(node)) {
                node.removeImageAt(index)
            }
        })
    }, [editor, nodeKey])

    const gridClass = clsx(
        'grid gap-4',
        {
            'grid-cols-1': layout === '1-column',
            'grid-cols-1 sm:grid-cols-2': layout === '2-columns',
            'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3': layout === '3-columns',
        }
    )

    return (
        <div className={clsx('my-4', isSelected && 'ring-2 ring-blue-500 rounded-lg p-1')}>
            <div className={gridClass}>
                {galleryImages.map((img, index) => (
                    <div key={index} className="relative aspect-video overflow-hidden rounded-lg bg-gray-100 flex items-center justify-center">
                        <img
                            src={img.src}
                            alt={img.altText || `Galeri görseli ${index + 1}`}
                            className="h-full w-full object-contain"
                            draggable={false}
                            loading="lazy"
                        />
                        {isSelected && canEditImages && (
                            <div className="pointer-events-none absolute inset-0 flex items-start justify-end gap-2 p-2">
                                <button
                                    type="button"
                                    className="pointer-events-auto rounded-full bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 shadow hover:bg-white"
                                    onClick={(event) => {
                                        event.preventDefault()
                                        event.stopPropagation()
                                        handleReplaceImage(index)
                                    }}
                                >
                                    Değiştir
                                </button>
                                <button
                                    type="button"
                                    className="pointer-events-auto rounded-full bg-white/90 px-2 py-1 text-xs font-medium text-red-600 shadow hover:bg-white"
                                    onClick={(event) => {
                                        event.preventDefault()
                                        event.stopPropagation()
                                        handleRemoveImage(index)
                                    }}
                                >
                                    Sil
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}
