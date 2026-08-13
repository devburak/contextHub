import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')

export const defaultSourceDirectory = join(repositoryRoot, 'docs', 'public')
export const defaultOutputDirectory = join(
  repositoryRoot,
  'apps',
  'admin',
  'public',
  'developer-docs',
)

export function slugifyHeading(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section'
}

export function extractHeadings(markdown) {
  const headings = []
  const occurrences = new Map()
  let inFence = false

  for (const line of String(markdown).split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const match = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!match) continue

    const title = match[2].replace(/\[([^\]]+)]\([^)]*\)/g, '$1').trim()
    const baseId = slugifyHeading(title)
    const count = occurrences.get(baseId) || 0
    occurrences.set(baseId, count + 1)

    headings.push({
      depth: match[1].length,
      title,
      id: count === 0 ? baseId : `${baseId}-${count + 1}`,
    })
  }

  return headings
}

export function toSearchText(markdown) {
  return String(markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?(?:\[([^\]]*)])\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[|>*_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function validateManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1) {
    throw new Error('Public docs manifest must use schemaVersion 1')
  }
  if (!Array.isArray(manifest.documents) || manifest.documents.length === 0) {
    throw new Error('Public docs manifest must contain documents')
  }

  const slugs = new Set()
  const files = new Set()
  for (const document of manifest.documents) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(document.slug || '')) {
      throw new Error(`Invalid documentation slug: ${document.slug || '<empty>'}`)
    }
    if (document.file !== `${document.slug}.md`) {
      throw new Error(`Document ${document.slug} must use ${document.slug}.md`)
    }
    if (!document.title || !document.description || !document.category) {
      throw new Error(`Document ${document.slug} is missing navigation metadata`)
    }
    if (slugs.has(document.slug) || files.has(document.file)) {
      throw new Error(`Duplicate documentation entry: ${document.slug}`)
    }
    slugs.add(document.slug)
    files.add(document.file)
  }

  if (!slugs.has(manifest.defaultSlug)) {
    throw new Error('Public docs defaultSlug must reference a document')
  }
}

export function validateInternalLinks(documents) {
  const documentsBySlug = new Map(documents.map((document) => [document.slug, document]))
  const linkPattern = /\]\((?:\.\/)?([a-z0-9]+(?:-[a-z0-9]+)*)\.md(?:#([a-z0-9-]+))?\)/gi

  for (const document of documents) {
    for (const match of document.markdown.matchAll(linkPattern)) {
      const [, targetSlug, targetHeading] = match
      const targetDocument = documentsBySlug.get(targetSlug)
      if (!targetDocument) {
        throw new Error(`Document ${document.slug} links to missing page ${targetSlug}`)
      }
      if (
        targetHeading &&
        !targetDocument.headings.some((heading) => heading.id === targetHeading)
      ) {
        throw new Error(
          `Document ${document.slug} links to missing heading ${targetSlug}#${targetHeading}`,
        )
      }
    }
  }
}

function checksum(content) {
  return createHash('sha256').update(content).digest('hex')
}

function buildLlmsIndex(manifest, documents) {
  const lines = [
    `# ${manifest.title}`,
    '',
    `> ${manifest.description}`,
    '',
    `Version: ${manifest.version}`,
    `Updated: ${manifest.updatedAt}`,
    '',
    '## Documents',
    '',
  ]

  for (const document of documents) {
    lines.push(
      `- [${document.title}](${manifest.basePath}/${document.slug}.md): ${document.description}`,
    )
  }

  return `${lines.join('\n')}\n`
}

function buildLlmsFull(manifest, documents) {
  const sections = [
    `# ${manifest.title}`,
    '',
    `> ${manifest.description}`,
    '',
    `Version: ${manifest.version}`,
    `Updated: ${manifest.updatedAt}`,
  ]

  for (const document of documents) {
    sections.push(
      '',
      '---',
      '',
      `Source: ${manifest.basePath}/${document.slug}.md`,
      `Checksum-SHA256: ${document.checksum}`,
      '',
      document.markdown.trim(),
    )
  }

  return `${sections.join('\n')}\n`
}

export async function buildPublicDocs({
  sourceDirectory = defaultSourceDirectory,
  outputDirectory = defaultOutputDirectory,
} = {}) {
  const manifestPath = join(sourceDirectory, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  validateManifest(manifest)

  const documents = []
  for (const metadata of [...manifest.documents].sort((a, b) => a.order - b.order)) {
    const markdown = await readFile(join(sourceDirectory, metadata.file), 'utf8')
    const headings = extractHeadings(markdown)
    if (!headings.some((heading) => heading.depth === 1)) {
      throw new Error(`Document ${metadata.slug} must contain an H1 heading`)
    }

    documents.push({
      ...metadata,
      checksum: checksum(markdown),
      headings,
      markdown,
      searchText: toSearchText(markdown),
      sourceUrl: `${manifest.basePath}/${metadata.slug}.md`,
    })
  }

  validateInternalLinks(documents)

  await rm(outputDirectory, { recursive: true, force: true })
  await mkdir(outputDirectory, { recursive: true })

  for (const document of documents) {
    await writeFile(join(outputDirectory, `${document.slug}.md`), document.markdown, 'utf8')
  }

  const publicDocuments = documents.map(({ markdown, ...document }) => document)
  const catalog = {
    schemaVersion: manifest.schemaVersion,
    title: manifest.title,
    description: manifest.description,
    version: manifest.version,
    updatedAt: manifest.updatedAt,
    defaultSlug: manifest.defaultSlug,
    basePath: manifest.basePath,
    documents: publicDocuments,
  }

  await writeFile(
    join(outputDirectory, 'catalog.json'),
    `${JSON.stringify(catalog, null, 2)}\n`,
    'utf8',
  )
  await writeFile(join(outputDirectory, 'llms.txt'), buildLlmsIndex(manifest, documents), 'utf8')
  await writeFile(join(outputDirectory, 'llms-full.txt'), buildLlmsFull(manifest, documents), 'utf8')

  return catalog
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalog = await buildPublicDocs()
  console.log(`Built ${catalog.documents.length} public documentation pages (${catalog.version}).`)
}
