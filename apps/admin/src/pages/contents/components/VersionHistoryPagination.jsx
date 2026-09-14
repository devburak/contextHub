import { useTranslation } from 'react-i18next'

export default function VersionHistoryPagination({ pagination, page, onPageChange, disabled }) {
  const { t } = useTranslation()
  const pages = pagination?.pages || 1
  if (pages <= 1 && page <= 1) return null

  const buttonClass = 'rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40'
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
      <button type="button" className={buttonClass} disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>
        {t('common.previous')}
      </button>
      <span>{page} / {pages}</span>
      <button type="button" className={buttonClass} disabled={disabled || page >= pages} onClick={() => onPageChange(page + 1)}>
        {t('common.next')}
      </button>
    </div>
  )
}
