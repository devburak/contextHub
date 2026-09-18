import { useTranslation } from 'react-i18next'
import LexicalTableOfContentsPlugin from '@lexical/react/LexicalTableOfContents'
import { $getNodeByKey } from 'lexical'

function getScrollBehavior() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

export default function DocumentOutlinePlugin({ onClose }) {
  const { t } = useTranslation()

  return (
    <aside className="editor-document-outline" aria-label={t('content.toc_title')}>
      <div className="editor-document-outline__header">
        <strong>{t('content.toc_title')}</strong>
        <button type="button" onClick={onClose} aria-label={t('common.close')}>×</button>
      </div>
      <LexicalTableOfContentsPlugin>
        {(entries, editor) => (
          entries.length ? (
            <nav aria-label={t('content.toc_title')}>
              {entries.map(([key, text, tag]) => (
                <button
                  key={key}
                  type="button"
                  className={`editor-document-outline__item editor-document-outline__item--${tag}`}
                  onClick={() => {
                    editor.update(() => {
                      $getNodeByKey(key)?.selectStart()
                    }, {
                      onUpdate: () => {
                        editor.getElementByKey(key)?.scrollIntoView({ block: 'start', behavior: getScrollBehavior() })
                        editor.focus()
                      },
                    })
                  }}
                >
                  {text || t('content.toc_untitled')}
                </button>
              ))}
            </nav>
          ) : (
            <p className="editor-document-outline__empty">{t('content.toc_empty')}</p>
          )
        )}
      </LexicalTableOfContentsPlugin>
    </aside>
  )
}
