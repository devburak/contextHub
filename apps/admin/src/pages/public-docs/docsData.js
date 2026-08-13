export const DOCS_BASE_PATH = '/developer-docs'

function assertSuccessful(response, resourceName) {
  if (!response?.ok) {
    throw new Error(`Unable to load ${resourceName} (${response?.status || 'network error'})`)
  }
}

export function validateCatalog(catalog) {
  if (
    !catalog ||
    catalog.schemaVersion !== 1 ||
    !Array.isArray(catalog.documents) ||
    catalog.documents.length === 0
  ) {
    throw new Error('The documentation catalog is invalid or empty')
  }
  return catalog
}

export async function loadCatalog(fetchImplementation = fetch) {
  const response = await fetchImplementation(`${DOCS_BASE_PATH}/catalog.json`, {
    cache: 'force-cache',
  })
  assertSuccessful(response, 'the documentation catalog')
  return validateCatalog(await response.json())
}

export async function loadDocument(slug, fetchImplementation = fetch, signal) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || '')) {
    throw new Error('The requested documentation slug is invalid')
  }

  const response = await fetchImplementation(`${DOCS_BASE_PATH}/${slug}.md`, {
    cache: 'force-cache',
    signal,
  })
  assertSuccessful(response, `documentation page “${slug}”`)
  return response.text()
}

export function searchDocuments(documents, query) {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase('en')
  if (!normalizedQuery) return documents

  const terms = normalizedQuery.split(/\s+/).filter(Boolean)
  return documents.filter((document) => {
    const haystack = [
      document.title,
      document.description,
      document.category,
      ...(document.tags || []),
      document.searchText,
    ]
      .join(' ')
      .toLocaleLowerCase('en')

    return terms.every((term) => haystack.includes(term))
  })
}

export function groupDocuments(documents) {
  const groups = new Map()
  for (const document of documents) {
    if (!groups.has(document.category)) groups.set(document.category, [])
    groups.get(document.category).push(document)
  }
  return Array.from(groups, ([category, items]) => ({ category, items }))
}

export function getAdjacentDocuments(documents, slug) {
  const index = documents.findIndex((document) => document.slug === slug)
  if (index === -1) return { previous: null, next: null }
  return {
    previous: documents[index - 1] || null,
    next: documents[index + 1] || null,
  }
}
