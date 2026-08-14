import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $createParagraphNode,
  FORMAT_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  ParagraphNode,
  TextNode
} from 'lexical';
import { $generateHtmlFromNodes } from '@lexical/html';
import { $setBlocksType, $patchStyleText } from '@lexical/selection';
import {
  HeadingNode,
  QuoteNode,
  $createHeadingNode,
  $createQuoteNode
} from '@lexical/rich-text';
import {
  ListNode,
  ListItemNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND
} from '@lexical/list';
import { LinkNode, AutoLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { CodeNode } from '@lexical/code';
// ContentEditor ile aynı görsel temayı (editor-* sınıfları) yeniden kullan.
import '../../contents/ContentEditor.css';
// ContentEditor.css içindeki ikon kuralları `[title='<Türkçe metin>']` seçicisine bağlı.
// Başlıklar çevrildiği anda bu eşleşme kopacağı için ikonlar artık başlıktan değil,
// doğrudan varlık dosyasından geliyor. (Ana editörün toolbar'ı çeviri kapsamı dışında,
// bu yüzden ortak CSS'teki kurallar olduğu gibi kalıyor.)
import undoIcon from '../../contents/assets/icons/undo.svg';
import redoIcon from '../../contents/assets/icons/redo.svg';
import paragraphIcon from '../../contents/assets/icons/text-paragraph.svg';
import heading1Icon from '../../contents/assets/icons/type-h1.svg';
import heading2Icon from '../../contents/assets/icons/type-h2.svg';
import heading3Icon from '../../contents/assets/icons/type-h3.svg';
import quoteIcon from '../../contents/assets/icons/quote.svg';
import boldIcon from '../../contents/assets/icons/type-bold.svg';
import italicIcon from '../../contents/assets/icons/type-italic.svg';
import underlineIcon from '../../contents/assets/icons/type-underline.svg';
import strikethroughIcon from '../../contents/assets/icons/type-strikethrough.svg';
import bulletListIcon from '../../contents/assets/icons/list-ul.svg';
import numberedListIcon from '../../contents/assets/icons/list-ol.svg';
import fontColorIcon from '../../contents/assets/icons/font-color.svg';
import eraserIcon from '../../contents/assets/icons/eraser.svg';
import linkIcon from '../../contents/assets/icons/link.svg';

// `.editor-toolbar__button::before` 18x18'lik boş bir kutu bırakır; ikonu butonun
// kendi arka planına aynı ölçüyle basıyoruz, böylece hizalama CSS ile birebir aynı.
const iconStyle = (icon) => ({
  backgroundImage: `url(${icon})`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'center',
  backgroundSize: '18px 18px'
});

// İçerik editörüyle aynı tema haritası; CSS sınıfları ContentEditor.css içinde tanımlı.
const theme = {
  paragraph: 'editor-paragraph',
  heading: {
    h1: 'editor-heading-h1',
    h2: 'editor-heading-h2',
    h3: 'editor-heading-h3',
    h4: 'editor-heading-h4',
    h5: 'editor-heading-h5',
    h6: 'editor-heading-h6'
  },
  quote: 'editor-quote',
  code: 'editor-code',
  list: {
    ul: 'editor-ul',
    ol: 'editor-ol',
    listitem: 'editor-listitem',
    nested: { listitem: 'editor-nested-listitem' }
  },
  link: 'editor-link',
  text: {
    bold: 'editor-text-bold',
    italic: 'editor-text-italic',
    underline: 'editor-text-underline',
    strikethrough: 'editor-text-strikethrough',
    underlineStrikethrough: 'editor-text-underlineStrikethrough',
    code: 'editor-text-code'
  }
};

const EDITOR_NODES = [
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  CodeNode,
  LinkNode,
  AutoLinkNode,
  ParagraphNode,
  TextNode
];

const EMPTY_EDITOR_STATE = JSON.stringify({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    children: [
      { type: 'paragraph', format: '', indent: 0, textFormat: 0, version: 1, children: [] }
    ]
  }
});

// value prop'unu { json, html } biçimine normalize eder.
function normaliseValue(value) {
  if (!value) return { json: null, html: '' };
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return { json: parsed?.root ? parsed : null, html: '' };
    } catch (err) {
      return { json: null, html: '' };
    }
  }
  if (typeof value === 'object') {
    const json = value.json ?? value.state ?? (value.root ? value : null);
    return { json: json && json.root ? json : null, html: typeof value.html === 'string' ? value.html : '' };
  }
  return { json: null, html: '' };
}

// Ana içerik editörüyle (ContentEditor) aynı görsel dili kullanır; buton metin/çocuk
// içermez, ikon `icon` prop'uyla gelen varlık dosyasından basılır.
function ToolbarButton({ onClick, title, icon, active = false }) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      style={iconStyle(icon)}
      className={`editor-toolbar__button${active ? ' is-active' : ''}`}
    />
  );
}

// Metin rengi: ana editörle aynı ikon (font-color.svg) ve aynı stil uygulaması ($patchStyleText).
// Buton, gizli bir native renk seçiciyi kaplar; seçim Lexical tarafından korunduğu için
// renk değişimi mevcut seçili metne uygulanır.
function ColorButton({ editor }) {
  const { t } = useTranslation();
  const [color, setColor] = useState('#111827');

  const applyColor = useCallback(
    (hex) => {
      setColor(hex);
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $patchStyleText(selection, { color: hex });
        }
      });
    },
    [editor]
  );

  return (
    <label
      className="editor-toolbar__button"
      title={t('collection.editor_text_color')}
      aria-label={t('collection.editor_text_color')}
      style={{ ...iconStyle(fontColorIcon), cursor: 'pointer' }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <input
        type="color"
        value={color}
        onChange={(event) => applyColor(event.target.value)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
      />
    </label>
  );
}

function Toolbar() {
  const { t } = useTranslation();
  const [editor] = useLexicalComposerContext();
  const [formats, setFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false
  });

  // Seçimdeki aktif inline formatları izleyip butonlarda is-active vurgusu göster.
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            setFormats({
              bold: selection.hasFormat('bold'),
              italic: selection.hasFormat('italic'),
              underline: selection.hasFormat('underline'),
              strikethrough: selection.hasFormat('strikethrough')
            });
          }
        });
      }),
    [editor]
  );

  const formatBlock = useCallback(
    (creator) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, creator);
        }
      });
    },
    [editor]
  );

  // Stili temizle: seçili metnin inline biçimini (kalın/italik vb.) ve satır içi
  // stillerini (renk, arka plan, font) sıfırlar.
  const clearFormatting = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $patchStyleText(selection, { color: null, 'background-color': null, 'font-size': null });
      selection.extract().forEach((node) => {
        if ($isTextNode(node)) {
          node.setFormat(0);
          node.setStyle('');
        }
      });
    });
  }, [editor]);

  return (
    <div className="editor-toolbar">
      <ToolbarButton title={t('collection.editor_undo')} icon={undoIcon} onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)} />
      <ToolbarButton title={t('collection.editor_redo')} icon={redoIcon} onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)} />
      <span className="editor-toolbar__divider" aria-hidden="true" />
      <ToolbarButton title={t('collection.editor_paragraph')} icon={paragraphIcon} onClick={() => formatBlock(() => $createParagraphNode())} />
      <ToolbarButton title={t('collection.editor_heading1')} icon={heading1Icon} onClick={() => formatBlock(() => $createHeadingNode('h1'))} />
      <ToolbarButton title={t('collection.editor_heading2')} icon={heading2Icon} onClick={() => formatBlock(() => $createHeadingNode('h2'))} />
      <ToolbarButton title={t('collection.editor_heading3')} icon={heading3Icon} onClick={() => formatBlock(() => $createHeadingNode('h3'))} />
      <ToolbarButton title={t('collection.editor_quote')} icon={quoteIcon} onClick={() => formatBlock(() => $createQuoteNode())} />
      <span className="editor-toolbar__divider" aria-hidden="true" />
      <ToolbarButton title={t('collection.editor_bold')} icon={boldIcon} active={formats.bold} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')} />
      <ToolbarButton title={t('collection.editor_italic')} icon={italicIcon} active={formats.italic} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')} />
      <ToolbarButton title={t('collection.editor_underline')} icon={underlineIcon} active={formats.underline} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')} />
      <ToolbarButton title={t('collection.editor_strikethrough')} icon={strikethroughIcon} active={formats.strikethrough} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')} />
      <span className="editor-toolbar__divider" aria-hidden="true" />
      <ToolbarButton title={t('collection.editor_bullet_list')} icon={bulletListIcon} onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)} />
      <ToolbarButton title={t('collection.editor_numbered_list')} icon={numberedListIcon} onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)} />
      <span className="editor-toolbar__divider" aria-hidden="true" />
      <ColorButton editor={editor} />
      <ToolbarButton title={t('collection.editor_clear_format')} icon={eraserIcon} onClick={clearFormatting} />
      <span className="editor-toolbar__divider" aria-hidden="true" />
      <ToolbarButton
        title={t('collection.editor_link')}
        icon={linkIcon}
        onClick={() => {
          const url = window.prompt(t('collection.editor_link_prompt'), 'https://');
          if (url === null) return;
          editor.dispatchCommand(TOGGLE_LINK_COMMAND, url ? url : null);
        }}
      />
    </div>
  );
}

/**
 * Koleksiyon richText alanları için bağımsız, yeniden kullanılabilir Lexical editörü.
 * value: { json, html } | undefined
 * onChange: ({ json, html }) => void   — her değişiklikte Lexical state JSON'u ve HTML üretir.
 * placeholder: opsiyonel; verilmezse çeviriden gelir.
 */
export default function RichTextField({ value, onChange, placeholder }) {
  const { t } = useTranslation();
  const initial = useMemo(() => normaliseValue(value), []); // yalnızca mount anında oku
  const [isEmpty, setIsEmpty] = useState(!initial.json);

  const initialConfig = useMemo(
    () => ({
      namespace: 'collection-richtext',
      theme,
      nodes: EDITOR_NODES,
      editorState: initial.json ? JSON.stringify(initial.json) : EMPTY_EDITOR_STATE,
      onError(error) {
        console.error('[RichTextField]', error);
      }
    }),
    [initial.json]
  );

  const handleChange = useCallback(
    (editorState, editor) => {
      editorState.read(() => {
        const html = $generateHtmlFromNodes(editor, null);
        const json = editorState.toJSON();
        const textContent = $getRoot().getTextContent().trim();
        const childrenCount = json?.root?.children?.length || 0;
        const empty = !textContent && childrenCount <= 1;
        setIsEmpty(empty);
        onChange?.(empty ? undefined : { json, html });
      });
    },
    [onChange]
  );

  return (
    <div className="overflow-hidden rounded-md border border-gray-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200">
      <LexicalComposer initialConfig={initialConfig}>
        <Toolbar />
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable className="editor-input min-h-[160px] px-3 py-2 text-sm focus:outline-none" />
            }
            placeholder={
              isEmpty ? (
                <div className="pointer-events-none absolute left-3 top-2 text-sm text-gray-400">
                  {placeholder || t('collection.richtext_placeholder')}
                </div>
              ) : null
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin />
          <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
        </div>
      </LexicalComposer>
    </div>
  );
}
