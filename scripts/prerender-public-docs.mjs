import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'
import { extractHeadings } from './build-public-docs.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')

export const defaultDocsSourceDirectory = join(repositoryRoot, 'docs', 'saas')
export const defaultAdminDistDirectory = join(repositoryRoot, 'apps', 'admin', 'dist')
export const defaultDocsSiteUrl = 'https://ctxhub.net'

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function rewriteDocumentationLinks(html) {
  return String(html).replace(
    /href="(?:\.\/)?([a-z0-9]+(?:-[a-z0-9]+)*)\.md(#[a-z0-9-]+)?"/gi,
    (_match, slug, hash = '') => `href="/docs/${slug}${hash}"`,
  )
}

function addHeadingIds(html, markdown) {
  const headings = extractHeadings(markdown)
  let headingIndex = 0
  return String(html).replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (_match, depth, content) => {
    const heading = headings[headingIndex]
    headingIndex += 1
    return heading
      ? `<h${depth} id="${escapeHtml(heading.id)}">${content}</h${depth}>`
      : `<h${depth}>${content}</h${depth}>`
  })
}

function buildStaticNavigation(manifest) {
  const locale = manifest.aiLocale
  return [...manifest.documents]
    .sort((a, b) => a.order - b.order)
    .map((document) => (
      `<li><a href="/docs/${escapeHtml(document.slug)}">${escapeHtml(document.title[locale])}</a></li>`
    ))
    .join('')
}

function buildStaticBody({ manifest, markdown }) {
  const article = rewriteDocumentationLinks(
    addHeadingIds(marked.parse(markdown, { gfm: true }), markdown),
  )
  const navigation = buildStaticNavigation(manifest)

  return [
    '<div id="root" data-docs-prerendered="true">',
    '<header class="docs-seo-header">',
    '<a href="/docs" class="docs-seo-brand"><span>C</span><strong>ContextHub</strong></a>',
    '<a href="https://api.ctxhub.net/api/docs">Interactive API reference</a>',
    '</header>',
    '<div class="docs-seo-shell">',
    `<nav aria-label="Documentation pages"><ul>${navigation}</ul></nav>`,
    `<main><article>${article}</article></main>`,
    '</div>',
    '<noscript><p class="docs-seo-note">This documentation is fully readable without JavaScript. Enable JavaScript for search, language switching, and copy controls.</p></noscript>',
    '</div>',
  ].join('')
}

const prerenderStyle = `
<style id="docs-prerender-style">
  :root{color:#111827;background:#f9fafb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  *{box-sizing:border-box}body{margin:0}.docs-seo-header{min-height:72px;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:12px 28px;background:#fff;border-bottom:1px solid #e5e7eb}.docs-seo-header a{color:#1d4ed8;text-decoration:none;font-weight:700}.docs-seo-brand{display:flex;align-items:center;gap:12px;color:#111827!important;font-size:20px}.docs-seo-brand span{width:40px;height:40px;display:grid;place-items:center;color:#fff;background:#2563eb;border-radius:8px;font-weight:900}.docs-seo-shell{max-width:1200px;margin:auto;display:grid;grid-template-columns:260px minmax(0,820px);background:#fff;min-height:calc(100vh - 72px)}.docs-seo-shell nav{padding:28px 20px;background:#f9fafb;border-right:1px solid #e5e7eb}.docs-seo-shell nav ul{list-style:none;margin:0;padding:0}.docs-seo-shell nav a{display:block;padding:7px 8px;color:#4b5563;text-decoration:none;font-size:14px}.docs-seo-shell main{min-width:0;padding:42px clamp(24px,5vw,72px) 72px}.docs-seo-shell article{font-size:16px;line-height:1.75}.docs-seo-shell h1{font-size:clamp(38px,6vw,60px);line-height:1;letter-spacing:-.045em}.docs-seo-shell h2{margin-top:48px;font-size:28px}.docs-seo-shell h3{margin-top:32px;font-size:21px}.docs-seo-shell a{color:#2563eb}.docs-seo-shell pre{padding:18px;overflow:auto;color:#e5e7eb;background:#111827;border-radius:12px}.docs-seo-shell code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.docs-seo-shell :not(pre)>code{padding:2px 5px;color:#1d4ed8;background:#eff6ff;border:1px solid #bfdbfe;border-radius:5px}.docs-seo-shell table{width:100%;border-collapse:collapse}.docs-seo-shell th,.docs-seo-shell td{padding:10px;border:1px solid #e5e7eb;text-align:left;vertical-align:top}.docs-seo-note{margin:0;padding:16px;text-align:center;background:#dbeafe}@media(max-width:800px){.docs-seo-header{padding:10px 16px}.docs-seo-shell{display:block}.docs-seo-shell nav{display:none}.docs-seo-shell main{padding:28px 20px 54px}.docs-seo-shell table{display:block;overflow-x:auto}.docs-seo-shell th,.docs-seo-shell td{min-width:140px}.docs-seo-shell th:last-child,.docs-seo-shell td:last-child{min-width:260px}}
</style>`

function injectMetadata(template, { canonicalUrl, description, title, body }) {
  const safeTitle = escapeHtml(`${title} | ContextHub`)
  const safeDescription = escapeHtml(description)
  const safeCanonical = escapeHtml(canonicalUrl)
  const metadata = [
    `<meta name="description" content="${safeDescription}" />`,
    `<link rel="canonical" href="${safeCanonical}" />`,
    '<meta property="og:type" content="article" />',
    `<meta property="og:title" content="${safeTitle}" />`,
    `<meta property="og:description" content="${safeDescription}" />`,
    `<meta property="og:url" content="${safeCanonical}" />`,
    '<meta name="twitter:card" content="summary" />',
    prerenderStyle,
  ].join('\n')

  return template
    .replace(/<html\s+lang="[^"]*"/, '<html lang="en"')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${safeTitle}</title>`)
    .replace('</head>', `${metadata}\n</head>`)
    .replace('<div id="root"></div>', body)
}

function buildSitemap(manifest, siteUrl) {
  const urls = [...manifest.documents]
    .sort((a, b) => a.order - b.order)
    .map((document) => {
      const path = document.slug === manifest.defaultSlug ? '/docs' : `/docs/${document.slug}`
      return `  <url><loc>${escapeHtml(`${siteUrl}${path}`)}</loc><lastmod>${escapeHtml(manifest.updatedAt)}</lastmod></url>`
    })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}

function buildRobots(siteUrl) {
  return [
    'User-agent: *',
    'Disallow: /',
    'Allow: /docs',
    'Allow: /developer-docs/',
    'Allow: /assets/',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n')
}

export async function prerenderPublicDocs({
  sourceDirectory = defaultDocsSourceDirectory,
  distDirectory = defaultAdminDistDirectory,
  siteUrl = process.env.DOCS_SITE_URL || defaultDocsSiteUrl,
} = {}) {
  const manifest = JSON.parse(await readFile(join(sourceDirectory, 'manifest.json'), 'utf8'))
  const template = await readFile(join(distDirectory, 'index.html'), 'utf8')
  const locale = manifest.aiLocale

  for (const metadata of manifest.documents) {
    const markdown = await readFile(join(sourceDirectory, metadata.files[locale]), 'utf8')
    const canonicalPath = metadata.slug === manifest.defaultSlug ? '/docs' : `/docs/${metadata.slug}`
    const body = buildStaticBody({ manifest, markdown })
    const html = injectMetadata(template, {
      canonicalUrl: `${siteUrl}${canonicalPath}`,
      description: metadata.description[locale],
      title: metadata.title[locale],
      body,
    })
    const pageDirectory = join(distDirectory, 'docs', metadata.slug)
    await mkdir(pageDirectory, { recursive: true })
    await writeFile(join(pageDirectory, 'index.html'), html, 'utf8')

    if (metadata.slug === manifest.defaultSlug) {
      const docsDirectory = join(distDirectory, 'docs')
      await mkdir(docsDirectory, { recursive: true })
      await writeFile(join(docsDirectory, 'index.html'), html, 'utf8')
    }
  }

  await writeFile(join(distDirectory, 'robots.txt'), buildRobots(siteUrl), 'utf8')
  await writeFile(join(distDirectory, 'sitemap.xml'), buildSitemap(manifest, siteUrl), 'utf8')

  return {
    pages: manifest.documents.length,
    locale,
    siteUrl,
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prerenderPublicDocs()
  console.log(`Prerendered ${result.pages} ${result.locale.toUpperCase()} docs pages for ${result.siteUrl}.`)
}
