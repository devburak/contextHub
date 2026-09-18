import { describe, expect, it } from 'vitest'
import { countDocumentText, findMatchesInBlocks } from './documentInsights.js'

describe('countDocumentText', () => {
  it('counts Turkish words, punctuation and Unicode characters', () => {
    expect(countDocumentText('Bugün ContextHub\u2019da 3 içerik yayımlandı.')).toEqual({
      words: 5,
      characters: 40,
      charactersWithoutSpaces: 36,
    })
  })
})

describe('findMatchesInBlocks', () => {
  it('finds case-insensitive matches across adjacent formatted text nodes', () => {
    const matches = findMatchesInBlocks([
      {
        segments: [
          { key: 'a', text: 'Uzun dokü' },
          { key: 'b', text: 'manlar için uzun' },
        ],
      },
    ], 'DOKÜMAN')

    expect(matches).toEqual([
      {
        segments: [
          { key: 'a', start: 5, end: 9 },
          { key: 'b', start: 0, end: 3 },
        ],
      },
    ])
  })

  it('does not join matches across separate blocks', () => {
    expect(findMatchesInBlocks([
      { segments: [{ key: 'a', text: 'uzun' }] },
      { segments: [{ key: 'b', text: 'doküman' }] },
    ], 'uzundoküman')).toEqual([])
  })
})
