import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  defaultOutputDirectory,
  defaultSourceDirectory,
  extractHeadings,
  validateInternalLinks,
  validateManifest,
} from '../../../../../scripts/build-public-docs.mjs'
import { prerenderPublicDocs } from '../../../../../scripts/prerender-public-docs.mjs'

describe('public documentation build', () => {
  it('keeps the generated catalog aligned with the Markdown manifest', async () => {
    const manifest = JSON.parse(await readFile(`${defaultSourceDirectory}/manifest.json`, 'utf8'))
    const catalog = JSON.parse(await readFile(`${defaultOutputDirectory}/catalog.json`, 'utf8'))

    expect(() => validateManifest(manifest)).not.toThrow()
    expect(catalog.version).toBe(manifest.version)
    expect(catalog.documents).toHaveLength(manifest.documents.length)
    expect(catalog.aiLocale).toBe('en')
    expect(catalog.locales.map((locale) => locale.code)).toEqual(['en', 'tr'])
    expect(catalog.documents.every((document) => (
      /^[a-f0-9]{64}$/.test(document.locales.en.checksum)
      && /^[a-f0-9]{64}$/.test(document.locales.tr.checksum)
    ))).toBe(true)

    const fullCorpus = await readFile(`${defaultOutputDirectory}/llms-full.txt`, 'utf8')
    expect(fullCorpus).toContain('# ContextHub Cloud Developer Docs')
    expect(fullCorpus).toContain('# Caching and freshness')
    expect(fullCorpus).toContain('# AI assistants and MCP')
    expect(fullCorpus).toContain('# Placements and personalization')
    expect(fullCorpus).toContain('# Placement decision engine and targeting')
    expect(fullCorpus).toContain('# Roles and permissions')
    expect(fullCorpus).toContain('# Extensions and Plugin API')
    expect(fullCorpus).toContain('# Legal, service, and merchant identity')
    expect(fullCorpus).toContain('# About us')
    expect(fullCorpus).toContain('# Distance selling agreement and pre-contract information')
    expect(fullCorpus).toContain('# Delivery, cancellation, and refund terms')
    expect(fullCorpus).toContain('# Privacy policy and personal-data notice')
    expect(fullCorpus).toContain('İKONX Bilişim ve Tarım Sanayi ve Ticaret Ltd. Şti.')
    expect(fullCorpus).toContain('0470111421600001')
    expect(fullCorpus).toContain('210240')
    expect(fullCorpus).toContain('support@ctxhub.net')
    expect(fullCorpus).toContain('ikon-x.com.tr')
    expect(fullCorpus).toContain('ctxhub.net')
    expect(fullCorpus).toContain('POST https://api.ctxhub.net/api/public/placements/decide')
    expect(fullCorpus).toContain('API version/revision: `1/4`')
    expect(fullCorpus).not.toContain('# Cache ve güncellik')
    expect(fullCorpus).not.toContain('/developer-docs/tr/')
    expect(fullCorpus).not.toContain('# Commerce lite')
    expect(fullCorpus).not.toContain('# Content versioning')
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

  it('prerenders crawlable docs routes, robots, and a sitemap', async () => {
    const distDirectory = await mkdtemp(join(tmpdir(), 'ctxhub-docs-prerender-'))
    await mkdir(distDirectory, { recursive: true })
    await writeFile(
      join(distDirectory, 'index.html'),
      '<!doctype html><html lang="tr"><head><title>Admin</title></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>',
      'utf8',
    )

    try {
      const result = await prerenderPublicDocs({
        sourceDirectory: defaultSourceDirectory,
        distDirectory,
        siteUrl: 'https://ctxhub.test',
        hosted: true,
      })
      const contentPage = await readFile(join(distDirectory, 'docs', 'content', 'index.html'), 'utf8')
      const robots = await readFile(join(distDirectory, 'robots.txt'), 'utf8')
      const sitemap = await readFile(join(distDirectory, 'sitemap.xml'), 'utf8')

      expect(result.pages).toBeGreaterThan(14)
      expect(contentPage).toContain('<h1 id="content">Content</h1>')
      expect(contentPage).toContain('rel="canonical" href="https://ctxhub.test/docs/content"')
      expect(contentPage).toContain('data-docs-prerendered="true"')
      expect(contentPage).toContain('/assets/app.js')
      expect(robots).toContain('Allow: /docs')
      expect(robots).toContain('Allow: /pay')
      expect(robots).toContain('Sitemap: https://ctxhub.test/sitemap.xml')
      expect(sitemap).toContain('<loc>https://ctxhub.test/docs/content</loc>')
      expect(sitemap).toContain('<loc>https://ctxhub.test/docs</loc>')
      expect(sitemap).toContain('<loc>https://ctxhub.test/docs/about</loc>')
      expect(sitemap).toContain('<loc>https://ctxhub.test/docs/distance-sales-agreement</loc>')

      const paymentPage = await readFile(join(distDirectory, 'pay', 'index.html'), 'utf8')
      expect(paymentPage).toContain('<title>Secure payment | ContextHub</title>')
      expect(paymentPage).toContain('rel="canonical" href="https://ctxhub.test/pay"')
      expect(paymentPage).toContain('name="robots" content="noindex, nofollow"')
    } finally {
      await rm(distDirectory, { recursive: true, force: true })
    }
  })

  it('removes hosted merchant artifacts from Community builds', async () => {
    const distDirectory = await mkdtemp(join(tmpdir(), 'ctxhub-community-prerender-'))
    await mkdir(join(distDirectory, 'docs'), { recursive: true })
    await mkdir(join(distDirectory, 'pay'), { recursive: true })
    await mkdir(join(distDirectory, 'developer-docs'), { recursive: true })
    await writeFile(join(distDirectory, 'docs', 'index.html'), 'hosted', 'utf8')
    await writeFile(join(distDirectory, 'pay', 'index.html'), 'hosted', 'utf8')
    await writeFile(join(distDirectory, 'developer-docs', 'catalog.json'), '{}', 'utf8')

    try {
      const result = await prerenderPublicDocs({ distDirectory, hosted: false })
      expect(result).toMatchObject({ pages: 0, hosted: false })
      await expect(readFile(join(distDirectory, 'docs', 'index.html'), 'utf8')).rejects.toThrow()
      await expect(readFile(join(distDirectory, 'pay', 'index.html'), 'utf8')).rejects.toThrow()
      await expect(readFile(join(distDirectory, 'developer-docs', 'catalog.json'), 'utf8')).rejects.toThrow()
    } finally {
      await rm(distDirectory, { recursive: true, force: true })
    }
  })

  it('ships the official compact iyzico and card-brand logo band', async () => {
    const asset = await readFile(join(process.cwd(), 'src', 'assets', 'payment-marks', 'iyzico-card-brands.png'))
    expect(asset.byteLength).toBeGreaterThan(1000)
    expect(asset.byteLength).toBeLessThan(20000)
  })
})
