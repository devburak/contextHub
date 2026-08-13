import { describe, expect, it } from 'vitest'
import { renderDocumentationMarkdown } from './markdown.js'

describe('documentation Markdown renderer', () => {
  it('creates stable headings, internal routes, and copyable prompt blocks', () => {
    const result = renderDocumentationMarkdown(`
# Prompt library

## Build it

[Caching](./caching.md#cache-key-design)

\`\`\`prompt
Build a safe integration.
\`\`\`
`)

    expect(result.headings).toEqual([
      { id: 'prompt-library', title: 'Prompt library', depth: 1 },
      { id: 'build-it', title: 'Build it', depth: 2 },
    ])
    expect(result.html).toContain('href="/docs/caching#cache-key-design"')
    expect(result.html).toContain('data-docs-copy="0"')
    expect(result.html).toContain('COPY PROMPT')
  })

  it('removes executable HTML and unsafe links', () => {
    const result = renderDocumentationMarkdown(`
# Safe page

<script>alert('no')</script>

<img src=x onerror=alert(1)>

[Unsafe](javascript:alert(1))
[Safe](https://developers.cloudflare.com/workers/)
`)

    expect(result.html).not.toMatch(/script|onerror|javascript:/i)
    expect(result.html).not.toContain('<img')
    expect(result.html).toContain('target="_blank"')
    expect(result.html).toContain('rel="noreferrer noopener"')
  })
})
