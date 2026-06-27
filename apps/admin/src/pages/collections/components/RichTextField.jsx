import { useCallback, useEffect, useMemo, useState } from 'react';
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

// Ana içerik editörüyle (ContentEditor) aynı CSS ikon sistemini kullanır:
// ikon, ContentEditor.css içindeki `.editor-toolbar__button[title='...']::before`
// kuralından gelir. Bu yüzden buton metin/çocuk içermez, yalnızca eşleşen title taşır.
function ToolbarButton({ onClick, title, active = false }) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`editor-toolbar__button${active ? ' is-active' : ''}`}
    />
  );
}

// Metin rengi: ana editörle aynı ikon (font-color.svg) ve aynı stil uygulaması ($patchStyleText).
// Buton, gizli bir native renk seçiciyi kaplar; seçim Lexical tarafından korunduğu için
// renk değişimi mevcut seçili metne uygulanır.
function ColorButton({ editor }) {
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
      title="Metin rengi"
      aria-label="Metin rengi"
      style={{ cursor: 'pointer' }}
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
      <ToolbarButton title="Geri al" onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)} />
      <ToolbarButton title="İleri al" onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)} />
      <span className="editor-toolbar__divider" aria-hidden="true" />
      <ToolbarButton title="Paragraf" onClick={() => formatBlock(() => $createParagraphNode())} />
      <ToolbarButton title="Başlık 1" onClick={() => formatBlock(() => $createHeadingNode('h1'))} />
      <ToolbarButton title="Başlık 2" onClick={() => formatBlock(() => $createHeadingNode('h2'))} />
      <ToolbarButton title="Başlık 3" onClick={() => formatBlock(() => $createHeadingNode('h3'))} />
      <ToolbarButton title="Alıntı" onClick={() => formatBlock(() => $createQuoteNode())} />
      <span className="editor-toolbar__divider" aria-hidden="true" />
      <ToolbarButton title="Kalın" active={formats.bold} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')} />
      <ToolbarButton title="İtalik" active={formats.italic} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')} />
      <ToolbarButton title="Altı çizili" active={formats.underline} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')} />
      <ToolbarButton title="Üzeri çizili" active={formats.strikethrough} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')} />
      <span className="editor-toolbar__divider" aria-hidden="true" />
      <ToolbarButton title="Madde işaretli liste" onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)} />
      <ToolbarButton title="Numaralı liste" onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)} />
      <span className="editor-toolbar__divider" aria-hidden="true" />
      <ColorButton editor={editor} />
      <ToolbarButton title="Stili temizle" onClick={clearFormatting} />
      <span className="editor-toolbar__divider" aria-hidden="true" />
      <ToolbarButton
        title="Bağlantı"
        onClick={() => {
          const url = window.prompt('Bağlantı adresi (boş bırakırsanız kaldırılır):', 'https://');
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
 */
export default function RichTextField({ value, onChange, placeholder = 'İçerik yazın…' }) {
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
                  {placeholder}
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
