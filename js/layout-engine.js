/**
 * Layout Engine
 * Generates 5 arrangement options for art pieces on a wall.
 *
 * All units are in inches. Positions are relative to wall center (0,0).
 * x = horizontal (positive = right), y = vertical (positive = up).
 */

let SPACING = 3 // inches between pieces (adjustable)

/**
 * @param {{ width: number, height: number }} wall
 * @param {{ width: number, height: number }[]} pieces
 * @param {number} [spacing] - inches between pieces
 * @returns {{ name: string, positions: { index: number, x: number, y: number, w: number, h: number }[] }[]}
 */
function generateLayouts(wall, pieces, spacing) {
  if (!pieces || !pieces.length) return []
  if (typeof spacing === 'number') SPACING = spacing

  const validPieces = pieces.filter(p => p.width > 0 && p.height > 0)
  if (!validPieces.length) return []

  return [
    { name: 'Grid', positions: gridLayout(wall, validPieces) },
    { name: 'Stacked', positions: stackedLayout(wall, validPieces) },
    { name: 'Salon', positions: salonLayout(wall, validPieces) },
    { name: 'Centered Row', positions: centeredRowLayout(wall, validPieces) },
    { name: 'Custom', positions: customLayout(wall, validPieces) },
  ]
}

/**
 * Custom: pieces fanned out horizontally so user can see and drag each one.
 */
function customLayout(wall, pieces) {
  const offsetStep = Math.max(4, SPACING + 1)
  const n = pieces.length
  return pieces.map((p, i) => {
    const spread = (i - (n - 1) / 2) * offsetStep
    return { index: i, x: spread, y: 0, w: p.width, h: p.height }
  })
}

/**
 * Grid: pieces positioned so the gap between nearest edges of adjacent
 * pieces = SPACING. Spacing is measured corner-to-corner — no cell padding.
 * The entire grid is centered on (0,0).
 */
function gridLayout(wall, pieces) {
  const n = pieces.length
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)

  // Build a matrix of pieces per row/col for actual-size positioning
  const grid = []
  for (let r = 0; r < rows; r++) {
    const row = []
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      row.push(idx < n ? pieces[idx] : null)
    }
    grid.push(row)
  }

  // Column widths = max piece width in that column
  const colWidths = []
  for (let c = 0; c < cols; c++) {
    let maxW = 0
    for (let r = 0; r < rows; r++) {
      if (grid[r][c]) maxW = Math.max(maxW, grid[r][c].width)
    }
    colWidths.push(maxW)
  }

  // Row heights = max piece height in that row
  const rowHeights = []
  for (let r = 0; r < rows; r++) {
    let maxH = 0
    for (let c = 0; c < cols; c++) {
      if (grid[r][c]) maxH = Math.max(maxH, grid[r][c].height)
    }
    rowHeights.push(maxH)
  }

  // Total span
  const totalW = colWidths.reduce((s, w) => s + w, 0) + SPACING * (cols - 1)
  const totalH = rowHeights.reduce((s, h) => s + h, 0) + SPACING * (rows - 1)

  // Position each piece centered within its col/row slot
  const positions = []
  let cursorY = totalH / 2
  for (let r = 0; r < rows; r++) {
    let cursorX = -totalW / 2
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      if (idx >= n) break
      const p = pieces[idx]
      // Center piece within its column width
      const x = cursorX + colWidths[c] / 2
      const y = cursorY - rowHeights[r] / 2
      positions.push({ index: idx, x, y, w: p.width, h: p.height })
      cursorX += colWidths[c] + SPACING
    }
    cursorY -= rowHeights[r] + SPACING
  }
  return positions
}

/**
 * Salon: gallery-style organic arrangement.
 * Largest piece centered, others arranged around it.
 */
function salonLayout(wall, pieces) {
  if (pieces.length === 1) {
    return [{ index: 0, x: 0, y: 0, w: pieces[0].width, h: pieces[0].height }]
  }

  const sorted = pieces
    .map((p, i) => ({ ...p, index: i, area: p.width * p.height }))
    .sort((a, b) => b.area - a.area)

  const positions = []
  const placed = []

  for (let i = 0; i < sorted.length; i++) {
    const piece = sorted[i]

    if (i === 0) {
      positions.push({ index: piece.index, x: 0, y: 0, w: piece.width, h: piece.height })
      placed.push({ x: 0, y: 0, w: piece.width, h: piece.height })
      continue
    }

    let bestPos = null
    let bestDist = Infinity

    const candidates = []
    for (const p of placed) {
      candidates.push({ x: p.x + p.w / 2 + SPACING + piece.width / 2, y: p.y })
      candidates.push({ x: p.x - p.w / 2 - SPACING - piece.width / 2, y: p.y })
      candidates.push({ x: p.x, y: p.y + p.h / 2 + SPACING + piece.height / 2 })
      candidates.push({ x: p.x, y: p.y - p.h / 2 - SPACING - piece.height / 2 })
      candidates.push({
        x: p.x + p.w / 2 + SPACING + piece.width / 2,
        y: p.y + p.h / 2 + SPACING + piece.height / 2
      })
      candidates.push({
        x: p.x - p.w / 2 - SPACING - piece.width / 2,
        y: p.y - p.h / 2 - SPACING - piece.height / 2
      })
    }

    for (const c of candidates) {
      const overlaps = placed.some(p => {
        return Math.abs(c.x - p.x) < (piece.width + p.w) / 2 + SPACING * 0.5 &&
               Math.abs(c.y - p.y) < (piece.height + p.h) / 2 + SPACING * 0.5
      })

      if (!overlaps) {
        if (Math.abs(c.x) + piece.width / 2 <= wall.width / 2 &&
            Math.abs(c.y) + piece.height / 2 <= wall.height / 2) {
          const dist = Math.sqrt(c.x * c.x + c.y * c.y)
          if (dist < bestDist) {
            bestDist = dist
            bestPos = c
          }
        }
      }
    }

    if (!bestPos) {
      const last = placed[placed.length - 1]
      bestPos = { x: last.x, y: last.y - last.h / 2 - SPACING - piece.height / 2 }
    }

    positions.push({ index: piece.index, x: bestPos.x, y: bestPos.y, w: piece.width, h: piece.height })
    placed.push({ x: bestPos.x, y: bestPos.y, w: piece.width, h: piece.height })
  }

  return positions
}

/**
 * Centered Row: single horizontal row, vertically centered on wall.
 */
function centeredRowLayout(wall, pieces) {
  const totalW = pieces.reduce((sum, p) => sum + p.width, 0) + SPACING * (pieces.length - 1)
  let cursor = -totalW / 2

  return pieces.map((p, i) => {
    const x = cursor + p.width / 2
    cursor += p.width + SPACING
    return { index: i, x, y: 0, w: p.width, h: p.height }
  })
}

/**
 * Stacked: single vertical column, horizontally centered.
 */
function stackedLayout(wall, pieces) {
  const totalH = pieces.reduce((sum, p) => sum + p.height, 0) + SPACING * (pieces.length - 1)
  let cursor = totalH / 2

  return pieces.map((p, i) => {
    const y = cursor - p.height / 2
    cursor -= p.height + SPACING
    return { index: i, x: 0, y, w: p.width, h: p.height }
  })
}

// Export
window.LayoutEngine = { generateLayouts, gridLayout, salonLayout, centeredRowLayout, stackedLayout, customLayout }
