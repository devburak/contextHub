const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu

export function countDocumentText(text = '') {
  const normalized = String(text)
  const words = normalized.match(WORD_PATTERN) || []

  return {
    words: words.length,
    characters: Array.from(normalized).length,
    charactersWithoutSpaces: Array.from(normalized.replace(/\s/gu, '')).length,
  }
}

export function findMatchesInBlocks(blocks, query) {
  const needle = String(query || '')
  if (!needle) return []

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const expression = new RegExp(escaped, 'giu')
  const matches = []

  blocks.forEach((block) => {
    const segments = Array.isArray(block?.segments) ? block.segments : []
    const text = segments.map((segment) => segment.text || '').join('')
    let result

    while ((result = expression.exec(text)) !== null) {
      const start = result.index
      const end = start + result[0].length
      let cursor = 0
      const matchedSegments = []

      segments.forEach((segment) => {
        const segmentText = segment.text || ''
        const segmentStart = cursor
        const segmentEnd = cursor + segmentText.length
        const overlapStart = Math.max(start, segmentStart)
        const overlapEnd = Math.min(end, segmentEnd)

        if (overlapStart < overlapEnd) {
          matchedSegments.push({
            key: segment.key,
            start: overlapStart - segmentStart,
            end: overlapEnd - segmentStart,
          })
        }
        cursor = segmentEnd
      })

      if (matchedSegments.length) {
        matches.push({ segments: matchedSegments })
      }

      if (result[0].length === 0) expression.lastIndex += 1
    }
  })

  return matches
}
