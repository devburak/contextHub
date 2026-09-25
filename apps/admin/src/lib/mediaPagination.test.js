import { describe, expect, it } from 'vitest'
import { getNextMediaPageParam } from './mediaPagination.js'

describe('media infinite pagination', () => {
  it('continues only when the new API reports another page', () => {
    expect(getNextMediaPageParam({ pagination: { hasMore: true } }, [{}])).toBe(2)
    expect(getNextMediaPageParam({ pagination: { hasMore: false } }, [{}])).toBeUndefined()
  })

  it('keeps scrolling with the old API during a staged deploy', () => {
    expect(getNextMediaPageParam({ pagination: { pages: 3 } }, [{}, {}])).toBe(3)
    expect(getNextMediaPageParam({ pagination: { pages: 3 } }, [{}, {}, {}])).toBeUndefined()
  })
})
