import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Cloud,
  Copy,
  ExternalLink,
  FileText,
  Menu,
  RefreshCw,
  Search,
  WifiOff,
  X,
} from 'lucide-react'
import {
  DOCS_BASE_PATH,
  getAdjacentDocuments,
  groupDocuments,
  loadCatalog,
  loadDocument,
  searchDocuments,
} from './docsData.js'
import { renderDocumentationMarkdown } from './markdown.js'
import './PublicDocumentation.css'

function LoadingDocument() {
  return (
    <div className="docs-skeleton" aria-label="Loading documentation">
      <div className="docs-skeleton-line docs-skeleton-title" />
      <div className="docs-skeleton-line docs-skeleton-lead" />
      <div className="docs-skeleton-line" />
      <div className="docs-skeleton-line" />
      <div className="docs-skeleton-line docs-skeleton-short" />
      <div className="docs-skeleton-block" />
    </div>
  )
}

function ErrorPanel({ message, onRetry }) {
  return (
    <div className="docs-state-panel" role="alert">
      <WifiOff aria-hidden="true" />
      <p className="docs-state-kicker">DOCUMENT UNAVAILABLE</p>
      <h2>We could not load this page.</h2>
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        <RefreshCw size={16} aria-hidden="true" /> Retry
      </button>
    </div>
  )
}

export default function PublicDocumentation() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState(null)
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const [markdown, setMarkdown] = useState('')
  const [documentError, setDocumentError] = useState(null)
  const [documentLoading, setDocumentLoading] = useState(false)
  const [documentAttempt, setDocumentAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [copyNotice, setCopyNotice] = useState('')

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    let active = true
    setCatalogError(null)
    loadCatalog()
      .then((nextCatalog) => {
        if (active) setCatalog(nextCatalog)
      })
      .catch((error) => {
        if (active) setCatalogError(error.message)
      })
    return () => {
      active = false
    }
  }, [catalogAttempt])

  const activeSlug = slug || catalog?.defaultSlug
  const selectedDocument = catalog?.documents.find((document) => document.slug === activeSlug)

  useEffect(() => {
    if (!catalog) return
    if (!slug) {
      navigate(`/docs/${catalog.defaultSlug}`, { replace: true })
      return
    }
    if (!selectedDocument) {
      navigate(`/docs/${catalog.defaultSlug}`, { replace: true })
    }
  }, [catalog, navigate, selectedDocument, slug])

  useEffect(() => {
    if (!selectedDocument) return undefined
    const controller = new AbortController()
    setDocumentLoading(true)
    setDocumentError(null)
    setMarkdown('')

    loadDocument(selectedDocument.slug, fetch, controller.signal)
      .then(setMarkdown)
      .catch((error) => {
        if (error.name !== 'AbortError') setDocumentError(error.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setDocumentLoading(false)
      })

    window.scrollTo({ top: 0, behavior: 'instant' })
    return () => controller.abort()
  }, [documentAttempt, selectedDocument])

  const renderedDocument = useMemo(
    () => (markdown ? renderDocumentationMarkdown(markdown) : { html: '', headings: [] }),
    [markdown],
  )
  const filteredDocuments = useMemo(
    () => searchDocuments(catalog?.documents || [], query),
    [catalog?.documents, query],
  )
  const documentGroups = useMemo(() => groupDocuments(filteredDocuments), [filteredDocuments])
  const adjacent = useMemo(
    () => getAdjacentDocuments(catalog?.documents || [], activeSlug),
    [activeSlug, catalog?.documents],
  )

  const selectDocument = useCallback(() => {
    setMobileNavigationOpen(false)
    setQuery('')
  }, [])

  const handleArticleClick = useCallback(async (event) => {
    const copyButton = event.target.closest('[data-docs-copy]')
    if (!copyButton) return
    const pre = copyButton.closest('pre')
    const code = pre?.querySelector('code')
    if (!code) return

    try {
      await navigator.clipboard.writeText(code.textContent)
      const isPrompt = copyButton.getAttribute('aria-label') === 'Copy prompt'
      setCopyNotice(isPrompt ? 'Prompt copied' : 'Code copied')
      window.setTimeout(() => setCopyNotice(''), 1800)
    } catch {
      setCopyNotice('Copy failed — select the text manually')
    }
  }, [])

  if (catalogError) {
    return (
      <div className="docs-standalone-state">
        <ErrorPanel message={catalogError} onRetry={() => setCatalogAttempt((value) => value + 1)} />
      </div>
    )
  }

  return (
    <div className="docs-app">
      <header className="docs-header">
        <a className="docs-brand" href="/docs" aria-label="ContextHub developer documentation">
          <span className="docs-brand-mark">CH</span>
          <span>
            <strong>ContextHub</strong>
            <small>DEVELOPER FIELD MANUAL</small>
          </span>
        </a>
        <div className="docs-header-actions">
          {!online && <span className="docs-offline"><WifiOff size={14} /> Offline</span>}
          {catalog && <span className="docs-version">DOCS {catalog.version}</span>}
          <a href={`${DOCS_BASE_PATH}/llms.txt`} target="_blank" rel="noreferrer">
            AI index <ExternalLink size={14} />
          </a>
          <a className="docs-admin-link" href="/login">Admin</a>
          <button
            className="docs-mobile-menu"
            type="button"
            onClick={() => setMobileNavigationOpen((value) => !value)}
            aria-label="Toggle documentation navigation"
            aria-expanded={mobileNavigationOpen}
          >
            {mobileNavigationOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <div className="docs-shell">
        <aside className={`docs-navigation ${mobileNavigationOpen ? 'is-open' : ''}`}>
          <div className="docs-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the field manual"
              aria-label="Search documentation"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={15} />
              </button>
            )}
          </div>

          <nav aria-label="Documentation pages">
            {documentGroups.map((group) => (
              <div className="docs-nav-group" key={group.category}>
                <p>{group.category}</p>
                {group.items.map((document) => (
                  <Link
                    key={document.slug}
                    to={`/docs/${document.slug}`}
                    className={document.slug === activeSlug ? 'is-active' : ''}
                    onClick={selectDocument}
                  >
                    <span>{document.title}</span>
                    {document.slug === activeSlug && <ChevronRight size={15} aria-hidden="true" />}
                  </Link>
                ))}
              </div>
            ))}
            {catalog && documentGroups.length === 0 && (
              <div className="docs-empty-search">
                <Search size={18} />
                <p>No pages match “{query}”.</p>
                <button type="button" onClick={() => setQuery('')}>Clear search</button>
              </div>
            )}
          </nav>

          <div className="docs-machine-card">
            <Cloud size={18} aria-hidden="true" />
            <div>
              <strong>Built for humans + agents</strong>
              <p>Versioned Markdown, checksums, LLM indexes, and MCP guidance.</p>
            </div>
          </div>
        </aside>

        <main className="docs-main">
          {selectedDocument && (
            <div className="docs-document-meta">
              <span><BookOpen size={14} /> {selectedDocument.category}</span>
              <span>{selectedDocument.audience.join(' · ')}</span>
              <a href={selectedDocument.sourceUrl} target="_blank" rel="noreferrer">
                <FileText size={14} /> Markdown
              </a>
            </div>
          )}

          {documentLoading && <LoadingDocument />}
          {documentError && (
            <ErrorPanel
              message={documentError}
              onRetry={() => setDocumentAttempt((value) => value + 1)}
            />
          )}
          {!documentLoading && !documentError && renderedDocument.html && (
            <article
              className="docs-article"
              onClick={handleArticleClick}
              dangerouslySetInnerHTML={{ __html: renderedDocument.html }}
            />
          )}

          {!documentLoading && !documentError && selectedDocument && (
            <nav className="docs-pagination" aria-label="Previous and next documentation pages">
              {adjacent.previous ? (
                <Link to={`/docs/${adjacent.previous.slug}`}>
                  <ArrowLeft size={17} />
                  <span><small>PREVIOUS</small>{adjacent.previous.title}</span>
                </Link>
              ) : <span />}
              {adjacent.next && (
                <Link to={`/docs/${adjacent.next.slug}`} className="docs-pagination-next">
                  <span><small>NEXT</small>{adjacent.next.title}</span>
                  <ArrowRight size={17} />
                </Link>
              )}
            </nav>
          )}
        </main>

        <aside className="docs-toc">
          <p>ON THIS PAGE</p>
          <nav aria-label="On this page">
            {renderedDocument.headings
              .filter((heading) => heading.depth > 1)
              .map((heading) => (
                <a
                  key={heading.id}
                  href={`#${heading.id}`}
                  className={heading.depth === 3 ? 'is-nested' : ''}
                >
                  {heading.title}
                </a>
              ))}
          </nav>
          <div className="docs-toc-source">
            <p>SOURCE CONTRACT</p>
            <span><Check size={14} /> Markdown canonical</span>
            <span><Check size={14} /> SHA-256 tracked</span>
            <span><Check size={14} /> Public + read-only</span>
          </div>
        </aside>
      </div>

      {copyNotice && (
        <div className="docs-copy-toast" role="status">
          <Copy size={15} /> {copyNotice}
        </div>
      )}
    </div>
  )
}
