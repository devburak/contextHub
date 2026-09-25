export function getNextMediaPageParam(lastPage, pages) {
  const pagination = lastPage?.pagination
  const hasMore = typeof pagination?.hasMore === 'boolean'
    ? pagination.hasMore
    : pages.length < (pagination?.pages || 1)
  return hasMore ? pages.length + 1 : undefined
}
