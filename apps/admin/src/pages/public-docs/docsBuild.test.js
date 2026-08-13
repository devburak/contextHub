import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  defaultOutputDirectory,
  defaultSourceDirectory,
  extractHeadings,
  validateInternalLinks,
  validateManifest,
} from '../../../../../scripts/build-public-docs.mjs'

describe('public documentation build', () => {
  it('keeps the generated catalog aligned with the Markdown manifest', async () => {
    const manifest = JSON.parse(await readFile(`${defaultSourceDirectory}/manifest.json`, 'utf8'))
    const catalog = JSON.parse(await readFile(`${defaultOutputDirectory}/catalog.json`, 'utf8'))

    expect(() => validateManifest(manifest)).not.toThrow()
    expect(catalog.version).toBe(manifest.version)
    expect(catalog.documents).toHaveLength(manifest.documents.length)
    expect(catalog.documents.every((document) => /^[a-f0-9]{64}$/.test(document.checksum))).toBe(true)

    const fullCorpus = await readFile(`${defaultOutputDirectory}/llms-full.txt`, 'utf8')
    expect(fullCorpus).toContain('# ContextHub Developer Docs')
    expect(fullCorpus).toContain('# Caching and freshness')
    expect(fullCorpus).toContain('# AI assistants and MCP')
  })

  it('does not treat headings inside fenced code as navigation headings', () => {
    expect(extractHeadings('# Page\n\n```md\n## Not a heading\n```\n\n## Real heading')).toEqual([
      { depth: 1, title: 'Page', id: 'page' },
      { depth: 2, title: 'Real heading', id: 'real-heading' },
    ])
  })

  it('rejects broken Markdown links before publishing the corpus', () => {
    expect(() => validateInternalLinks([
      {
        slug: 'overview',
        headings: [{ id: 'overview' }],
        markdown: '[Missing](./not-here.md)',
      },
    ])).toThrow(/links to missing page not-here/i)
  })
})
