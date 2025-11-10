import { useState, useCallback } from 'react'

const MAX_ROWS = 10
const MAX_COLS = 10

function TableDimensionSelector({ onCreateTable, onClose, includeHeaders = false, onIncludeHeadersChange }) {
  const [hoveredCell, setHoveredCell] = useState({ row: 0, col: 0 })

  const handleCellHover = useCallback((row, col) => {
    setHoveredCell({ row, col })
  }, [])

  const handleCellClick = useCallback((row, col) => {
    onCreateTable(row + 1, col + 1)
    onClose()
  }, [onCreateTable, onClose])

  const renderGrid = () => {
    const cells = []

    for (let row = 0; row < MAX_ROWS; row++) {
      for (let col = 0; col < MAX_COLS; col++) {
        const isHighlighted = row <= hoveredCell.row && col <= hoveredCell.col

        cells.push(
          <div
            key={`${row}-${col}`}
            className={`table-dimension-cell ${isHighlighted ? 'highlighted' : ''}`}
            onMouseEnter={() => handleCellHover(row, col)}
            onClick={() => handleCellClick(row, col)}
          />
        )
      }
    }

    return cells
  }

  return (
    <div className="table-dimension-selector">
      <div className="table-dimension-header">
        <span className="table-dimension-label">
          {hoveredCell.row + 1} × {hoveredCell.col + 1} Tablo
        </span>
      </div>
      <div
        className="table-dimension-grid"
        onMouseLeave={() => setHoveredCell({ row: 0, col: 0 })}
      >
        {renderGrid()}
      </div>
      <div className="table-dimension-footer">
        <label className="flex items-center gap-2 px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={includeHeaders}
            onChange={(e) => onIncludeHeadersChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
          />
          <span>İlk satırı başlık yap</span>
        </label>
        <button
          className="table-custom-size-btn"
          onClick={() => {
            // For now, create a default 3x3 table for custom size
            onCreateTable(3, 3)
            onClose()
          }}
        >
          Özel boyut...
        </button>
      </div>
    </div>
  )
}

export default TableDimensionSelector