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
  Github,
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
  localizeDocuments,
  searchDocuments,
} from './docsData.js'
import { renderDocumentationMarkdown } from './markdown.js'
import './PublicDocumentation.css'

const COPY = {
  en: {
    fieldManual: 'CLOUD DEVELOPER MANUAL',
    offline: 'Offline',
    aiIndex: 'AI index',
    searchPlaceholder: 'Search ContextHub Cloud docs',
    searchLabel: 'Search documentation',
    clearSearch: 'Clear search',
    pagesLabel: 'Documentation pages',
    noResults: (query) => `No pages match “${query}”.`,
    machineTitle: 'Built for customers + agents',
    machineBody: 'Bilingual SaaS docs. The AI corpus stays English-only.',
    markdown: 'Markdown',
    previous: 'PREVIOUS',
    next: 'NEXT',
    pagination: 'Previous and next documentation pages',
    onThisPage: 'ON THIS PAGE',
    onThisPageLabel: 'On this page',
    sourceContract: 'SOURCE CONTRACT',
    canonical: 'Markdown canonical',
    checksummed: 'SHA-256 tracked',
    saas: 'ctxhub.net SaaS',
    unavailable: 'DOCUMENT UNAVAILABLE',
    loadFailed: 'We could not load this page.',
    retry: 'Retry',
    loading: 'Loading documentation',
    copiedPrompt: 'Prompt copied',
    copiedCode: 'Code copied',
    copyFailed: 'Copy failed — select the text manually',
    toggleNavigation: 'Toggle documentation navigation',
    language: 'Documentation language',
    communityRepository: 'Community repository',
  },
  tr: {
    fieldManual: 'CLOUD GELİŞTİRİCİ KILAVUZU',
    offline: 'Çevrimdışı',
    aiIndex: 'AI indeksi',
    searchPlaceholder: 'ContextHub Cloud dokümanlarında ara',
    searchLabel: 'Dokümanlarda ara',
    clearSearch: 'Aramayı temizle',
    pagesLabel: 'Doküman sayfaları',
    noResults: (query) => `“${query}” ile eşleşen sayfa yok.`,
    machineTitle: 'Müşteriler + agent’lar için',
    machineBody: 'İki dilli SaaS dokümanı. AI corpus yalnızca İngilizcedir.',
    markdown: 'Markdown',
    previous: 'ÖNCEKİ',
    next: 'SONRAKİ',
    pagination: 'Önceki ve sonraki doküman sayfaları',
    onThisPage: 'BU SAYFADA',
    onThisPageLabel: 'Bu sayfada',
    sourceContract: 'KAYNAK SÖZLEŞMESİ',
    canonical: 'Markdown canonical',
    checksummed: 'SHA-256 takipli',
    saas: 'ctxhub.net SaaS',
    unavailable: 'DOKÜMAN AÇILAMADI',
    loadFailed: 'Bu sayfayı yükleyemedik.',
    retry: 'Tekrar dene',
    loading: 'Doküman yükleniyor',
    copiedPrompt: 'Prompt kopyalandı',
    copiedCode: 'Kod kopyalandı',
    copyFailed: 'Kopyalanamadı — metni elle seçin',
    toggleNavigation: 'Doküman navigasyonunu aç veya kapat',
    language: 'Doküman dili',
    communityRepository: 'Topluluk reposu',
  },
}

function initialLocale() {
  const stored = localStorage.getItem('docs.locale') || localStorage.getItem('language')
  if (stored === 'tr' || stored === 'en') return stored
  return navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en'
}

function LoadingDocument({ labels }) {
  return (
    <div className="docs-skeleton" aria-label={labels.loading}>
      <div className="docs-skeleton-line docs-skeleton-title" />
      <div className="docs-skeleton-line docs-skeleton-lead" />
      <div className="docs-skeleton-line" />
      <div className="docs-skeleton-line" />
      <div className="docs-skeleton-line docs-skeleton-short" />
      <div className="docs-skeleton-block" />
    </div>
  )
}

function ErrorPanel({ labels, message, onRetry }) {
  return (
    <div className="docs-state-panel" role="alert">
      <WifiOff aria-hidden="true" />
      <p className="docs-state-kicker">{labels.unavailable}</p>
      <h2>{labels.loadFailed}</h2>
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        <RefreshCw size={16} aria-hidden="true" /> {labels.retry}
      </button>
    </div>
  )
}

export default function PublicDocumentation() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [locale, setLocale] = useState(initialLocale)
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
  const labels = COPY[locale]

  useEffect(() => {
    localStorage.setItem('docs.locale', locale)
    document.documentElement.lang = locale
  }, [locale])

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

  const localizedDocuments = useMemo(
    () => localizeDocuments(catalog, locale),
    [catalog, locale],
  )
  const activeSlug = slug || catalog?.defaultSlug
  const selectedDocument = localizedDocuments.find((document) => document.slug === activeSlug)

  useEffect(() => {
    if (!catalog) return
    if (!slug) {
      navigate(`/docs/${catalog.defaultSlug}`, { replace: true })
      return
    }
    if (!selectedDocument) navigate(`/docs/${catalog.defaultSlug}`, { replace: true })
  }, [catalog, navigate, selectedDocument, slug])

  useEffect(() => {
    if (!selectedDocument) return undefined
    const controller = new AbortController()
    setDocumentLoading(true)
    setDocumentError(null)
    setMarkdown('')

    loadDocument(
      selectedDocument.slug,
      locale,
      selectedDocument.checksum,
      fetch,
      controller.signal,
    )
      .then(setMarkdown)
      .catch((error) => {
        if (error.name !== 'AbortError') setDocumentError(error.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setDocumentLoading(false)
      })

    window.scrollTo({ top: 0, behavior: 'instant' })
    return () => controller.abort()
  }, [documentAttempt, locale, selectedDocument])

  const renderedDocument = useMemo(
    () => (markdown
      ? renderDocumentationMarkdown(markdown, { locale })
      : { html: '', headings: [] }),
    [locale, markdown],
  )
  const filteredDocuments = useMemo(
    () => searchDocuments(localizedDocuments, query),
    [localizedDocuments, query],
  )
  const documentGroups = useMemo(() => groupDocuments(filteredDocuments), [filteredDocuments])
  const adjacent = useMemo(
    () => getAdjacentDocuments(localizedDocuments, activeSlug),
    [activeSlug, localizedDocuments],
  )

  const selectDocument = useCallback(() => {
    setMobileNavigationOpen(false)
    setQuery('')
  }, [])

  const changeLocale = useCallback((nextLocale) => {
    setLocale(nextLocale)
    setQuery('')
    setMobileNavigationOpen(false)
  }, [])

  const handleArticleClick = useCallback(async (event) => {
    const copyButton = event.target.closest('[data-docs-copy]')
    if (!copyButton) return
    const code = copyButton.closest('.docs-code-card')?.querySelector('pre code')
    if (!code) return

    try {
      await navigator.clipboard.writeText(code.textContent)
      setCopyNotice(
        copyButton.dataset.copyKind === 'prompt' ? labels.copiedPrompt : labels.copiedCode,
      )
      window.setTimeout(() => setCopyNotice(''), 1800)
    } catch {
      setCopyNotice(labels.copyFailed)
    }
  }, [labels])

  if (catalogError) {
    return (
      <div className="docs-standalone-state">
        <ErrorPanel
          labels={labels}
          message={catalogError}
          onRetry={() => setCatalogAttempt((value) => value + 1)}
        />
      </div>
    )
  }

  return (
    <div className="docs-app">
      <header className="docs-header">
        <a className="docs-brand" href="/docs" aria-label="ContextHub Cloud developer documentation">
          <span className="docs-brand-mark">C</span>
          <span>
            <strong>ContextHub</strong>
            <small>{labels.fieldManual}</small>
          </span>
        </a>
        <div className="docs-header-actions">
          {!online && <span className="docs-offline"><WifiOff size={14} /> {labels.offline}</span>}
          <div className="docs-language-switcher" aria-label={labels.language} role="group">
            {(catalog?.locales || [{ code: 'en', shortLabel: 'EN' }, { code: 'tr', shortLabel: 'TR' }])
              .map((item) => (
                <button
                  key={item.code}
                  type="button"
                  className={item.code === locale ? 'is-active' : ''}
                  aria-pressed={item.code === locale}
                  onClick={() => changeLocale(item.code)}
                >
                  {item.shortLabel}
                </button>
              ))}
          </div>
          {catalog && <span className="docs-version">DOCS {catalog.version}</span>}
          <a href={`${DOCS_BASE_PATH}/llms.txt`} target="_blank" rel="noreferrer">
            {labels.aiIndex} <ExternalLink size={14} />
          </a>
          <a
            className="docs-github-link"
            href="https://github.com/devburak/contextHub"
            target="_blank"
            rel="noreferrer noopener"
            aria-label={labels.communityRepository}
          >
            <Github size={16} aria-hidden="true" />
          </a>
          <a className="docs-admin-link" href="/login">Admin</a>
          <button
            className="docs-mobile-menu"
            type="button"
            onClick={() => setMobileNavigationOpen((value) => !value)}
            aria-label={labels.toggleNavigation}
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
              placeholder={labels.searchPlaceholder}
              aria-label={labels.searchLabel}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label={labels.clearSearch}>
                <X size={15} />
              </button>
            )}
          </div>

          <nav aria-label={labels.pagesLabel}>
            {documentGroups.map((group) => (
              <div className="docs-nav-group" key={group.category}>
                <p>{group.category}</p>
                {group.items.map((item) => (
                  <Link
                    key={item.slug}
                    to={`/docs/${item.slug}`}
                    className={item.slug === activeSlug ? 'is-active' : ''}
                    onClick={selectDocument}
                  >
                    <span>{item.title}</span>
                    {item.slug === activeSlug && <ChevronRight size={15} aria-hidden="true" />}
                  </Link>
                ))}
              </div>
            ))}
            {catalog && documentGroups.length === 0 && (
              <div className="docs-empty-search">
                <Search size={18} />
                <p>{labels.noResults(query)}</p>
                <button type="button" onClick={() => setQuery('')}>{labels.clearSearch}</button>
              </div>
            )}
          </nav>

          <div className="docs-machine-card">
            <Cloud size={18} aria-hidden="true" />
            <div>
              <strong>{labels.machineTitle}</strong>
              <p>{labels.machineBody}</p>
            </div>
          </div>
        </aside>

        <main className="docs-main">
          {selectedDocument && (
            <div className="docs-document-meta">
              <span><BookOpen size={14} /> {selectedDocument.category}</span>
              <span>{selectedDocument.audience.join(' · ')}</span>
              <a href={selectedDocument.sourceUrl} target="_blank" rel="noreferrer">
                <FileText size={14} /> {labels.markdown} · {locale.toUpperCase()}
              </a>
            </div>
          )}

          {documentLoading && <LoadingDocument labels={labels} />}
          {documentError && (
            <ErrorPanel
              labels={labels}
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
            <nav className="docs-pagination" aria-label={labels.pagination}>
              {adjacent.previous ? (
                <Link to={`/docs/${adjacent.previous.slug}`}>
                  <ArrowLeft size={17} />
                  <span><small>{labels.previous}</small>{adjacent.previous.title}</span>
                </Link>
              ) : <span />}
              {adjacent.next && (
                <Link to={`/docs/${adjacent.next.slug}`} className="docs-pagination-next">
                  <span><small>{labels.next}</small>{adjacent.next.title}</span>
                  <ArrowRight size={17} />
                </Link>
              )}
            </nav>
          )}
        </main>

        <aside className="docs-toc">
          <p>{labels.onThisPage}</p>
          <nav aria-label={labels.onThisPageLabel}>
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
            <p>{labels.sourceContract}</p>
            <span><Check size={14} /> {labels.canonical}</span>
            <span><Check size={14} /> {labels.checksummed}</span>
            <span><Check size={14} /> {labels.saas}</span>
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
