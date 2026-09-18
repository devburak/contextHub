import { $createTextNode, createEditor } from 'lexical'
import { describe, expect, it } from 'vitest'
import { editorHtmlImport, sanitizeEditorHtml } from './htmlImport.js'

describe('sanitizeEditorHtml', () => {
  it('keeps meaningful inline formatting while removing unsafe markup', () => {
    const html = sanitizeEditorHtml(`
      <p onclick="alert(1)">
        <span style="white-space: pre-wrap; font-weight: 700; color: #123456">Vurgulu</span>
        <script>alert(1)</script>
        <a href="javascript:alert(1)">bağlantı</a>
      </p>
    `)

    expect(html).toContain('font-weight: 700')
    expect(html).toContain('color: #123456')
    expect(html).not.toContain('white-space')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('javascript:')
  })
})

describe('editorHtmlImport', () => {
  it('preserves common pasted span formats and safe visual styles', () => {
    const editor = createEditor({
      html: { import: editorHtmlImport },
      onError(error) {
        throw error
      },
    })
    const document = new DOMParser().parseFromString(
      '<span style="font-weight: 700; font-style: italic; color: rgb(10, 20, 30); font-size: 18px">Biçimli</span>',
      'text/html'
    )
    const span = document.querySelector('span')
    let result

    editor.update(() => {
      const text = $createTextNode('Biçimli')
      const conversion = editorHtmlImport.span(span).conversion(span)
      conversion.forChild(text)
      result = {
        bold: text.hasFormat('bold'),
        italic: text.hasFormat('italic'),
        style: text.getStyle(),
      }
    }, { discrete: true })

    expect(result.bold).toBe(true)
    expect(result.italic).toBe(true)
    expect(result.style).toContain('color: rgb(10, 20, 30)')
    expect(result.style).toContain('font-size: 18px')
  })
})
