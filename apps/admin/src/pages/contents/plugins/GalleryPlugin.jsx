import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $wrapNodeInElement, mergeRegister } from '@lexical/utils'
import {
    $createParagraphNode,
    $insertNodes,
    $isRootOrShadowRoot,
    COMMAND_PRIORITY_EDITOR,
    createCommand,
} from 'lexical'
import { useEffect } from 'react'
import { $createGalleryNode, GalleryNode } from '../nodes/GalleryNode'

export const INSERT_GALLERY_COMMAND = createCommand('INSERT_GALLERY_COMMAND')

export default function GalleryPlugin() {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        if (!editor.hasNodes([GalleryNode])) {
            throw new Error('GalleryPlugin: GalleryNode not registered on editor')
        }

        return mergeRegister(
            editor.registerCommand(
                INSERT_GALLERY_COMMAND,
                (payload) => {
                    const galleryNode = $createGalleryNode(payload)
                    $insertNodes([galleryNode])
                    if ($isRootOrShadowRoot(galleryNode.getParentOrThrow())) {
                        $wrapNodeInElement(galleryNode, $createParagraphNode).selectEnd()
                    }
                    return true
                },
                COMMAND_PRIORITY_EDITOR
            )
        )
    }, [editor])

    return null
}
