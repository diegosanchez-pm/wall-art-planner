/**
 * Freeze-Frame Wall Preview
 *
 * Flow:
 *   1. DISTANCE: Enter distance + optional tape length (default 7ft)
 *   2. AIM: Live camera (pinch to zoom) — frame your wall
 *   3. FREEZE: Tap capture → camera freezes
 *   4. PILL NAV: Scale | Layout | Position | Retake (top row), Back | Finish (bottom)
 *      - Scale: slider + drag to align tape guide, art shown as borders only
 *      - Layout: sub-pills (Grid, Stacked, Salon, Centered Row, Custom) + spacing
 *      - Position: per-piece drag for all layouts
 *      - Finish: nail placement instructions
 *   5. Position swaps persist across layout changes (pieceOrder tracking)
 */

const INCH_TO_METER = 0.0254
const FOOT_TO_METER = 0.3048
const TAPE_HEIGHT = 60

// ─── Load state ───
const state = JSON.parse(localStorage.getItem('wall-art-planner') || '{}')
let pieces = state.pieces || []
const wall = state.wall || { width: 0, height: 0 }

// ─── Generate placeholder image for demo (cached) ───
let _placeholderCache = null
function generatePlaceholder() {
  if (_placeholderCache) return _placeholderCache
  const c = document.createElement('canvas')
  const size = 120
  c.width = size; c.height = size
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = '#cccccc'
  ctx.lineWidth = 2
  ctx.strokeRect(3, 3, size - 6, size - 6)
  ctx.strokeStyle = '#bbbbbb'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(15, 15); ctx.lineTo(size - 15, size - 15)
  ctx.moveTo(size - 15, 15); ctx.lineTo(15, size - 15)
  ctx.stroke()
  _placeholderCache = c.toDataURL('image/jpeg', 0.7)
  return _placeholderCache
}

// ─── Default demo pieces if none provided ───
if (!pieces.length) {
  pieces = [
    { width: 12, height: 16, photoDataUrl: '' },
    { width: 8, height: 10, photoDataUrl: '' },
    { width: 12, height: 24, photoDataUrl: '' },
    { width: 10, height: 14, photoDataUrl: '' },
  ]
}
// Fill in placeholders for any piece missing a photo
pieces.forEach(p => {
  if (!p.photoDataUrl) {
    p.photoDataUrl = generatePlaceholder()
  }
})

// ─── Piece ordering — persists across layout switches ───
// pieceOrder[i] = index into `pieces` array for layout position i
let pieceOrder = pieces.map((_, i) => i)

// ─── Layout config ───
let spacingInches = 3
const LAYOUT_NAMES = ['Grid', 'Stacked', 'Salon', 'Centered Row', 'Custom']
let currentLayoutName = 'Centered Row'

function generateCurrentLayouts() {
  return LayoutEngine.generateLayouts(wall, pieces, spacingInches)
}

function getLayoutByName(name) {
  const layouts = generateCurrentLayouts()
  return layouts.find(l => l.name === name) || layouts[0]
}

// ─── Working positions ───
let activePositions = []

function resetPositions() {
  const layout = getLayoutByName(currentLayoutName)
  if (!layout) { activePositions = []; return }
  // Clone positions, remap piece indices via pieceOrder
  activePositions = layout.positions.map((pos, i) => ({
    index: pieceOrder[i] !== undefined ? pieceOrder[i] : pos.index,
    x: pos.x, y: pos.y, w: pos.w, h: pos.h,
    _pixelOffsetX: 0,
    _pixelOffsetY: 0,
  }))
}
resetPositions()

// ─── DOM ───
const video = document.getElementById('camera-video')
const frozenCanvas = document.getElementById('frozen-frame')
const artCanvas = document.getElementById('art-canvas')
const captureBtn = document.getElementById('capture-btn')
const preFreezeControls = document.getElementById('pre-freeze-controls')
const instructions = document.getElementById('instructions')
const distOverlay = document.getElementById('distance-overlay')
const distPresets = document.querySelectorAll('.dist-preset')
const customDistInput = document.getElementById('custom-dist')
const customGoBtn = document.getElementById('custom-go')
const pillNav = document.getElementById('pill-nav')
const pillMain = document.getElementById('pill-main')
const pillSub = document.getElementById('pill-sub')
const scaleRow = document.getElementById('scale-row')
const scaleTip = document.getElementById('scale-tip')
const scaleSlider = document.getElementById('scale-slider')
const spacingRow = document.getElementById('spacing-row')
const spacingSlider = document.getElementById('spacing-slider')
const spacingVal = document.getElementById('spacing-val')
const confirmOverlay = document.getElementById('confirm-overlay')
const confirmCancel = document.getElementById('confirm-cancel')
const confirmYes = document.getElementById('confirm-yes')
const levelIndicator = document.getElementById('level-indicator')
const levelBubble = document.getElementById('level-bubble')
const levelLabel = document.getElementById('level-label')
const nailOverlay = document.getElementById('nail-overlay')
const nailList = document.getElementById('nail-list')
const nailCloseBtn = document.getElementById('nail-close-btn')
const nailFinishBtn = document.getElementById('nail-finish-btn')

// ─── State ───
let distanceFeet = 7
let tapeLengthInches = 0
let isFrozen = false
let scaleFactor = 1.0
let artOffsetX = 0
let artOffsetY = 0
let isDragging = false
let dragStartX = 0
let dragStartY = 0
let dragStartOffsetX = 0
let dragStartOffsetY = 0
let zoomLevel = 1.0
let activePill = null
let dragPieceIndex = -1

// ─── Camera ───
let cameraTrack = null

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    })
    video.srcObject = stream
    cameraTrack = stream.getVideoTracks()[0]
    await video.play()
  } catch (e) {
    captureBtn.style.display = 'none'
    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
      instructions.textContent = 'Camera permission denied — check browser settings'
    } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
      instructions.textContent = 'No camera found on this device'
    } else {
      instructions.textContent = 'Camera access required'
    }
    console.error('Camera error:', e)
  }
}

// ─── Pinch-to-zoom ───
let pinchStartDist = 0
let pinchStartZoom = 1

function getPinchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.sqrt(dx * dx + dy * dy)
}

function applyZoom(level) {
  zoomLevel = Math.max(1, Math.min(level, 5))
  if (cameraTrack) {
    try {
      const caps = cameraTrack.getCapabilities()
      if (caps.zoom) {
        cameraTrack.applyConstraints({ advanced: [{ zoom: Math.min(zoomLevel, caps.zoom.max) }] })
        return
      }
    } catch (e) {}
  }
  video.style.transform = `scale(${zoomLevel})`
}

document.addEventListener('touchstart', (e) => {
  if (isFrozen || e.touches.length !== 2) return
  pinchStartDist = getPinchDist(e.touches)
  pinchStartZoom = zoomLevel
}, { passive: true })

document.addEventListener('touchmove', (e) => {
  if (isFrozen || e.touches.length !== 2) return
  e.preventDefault()
  applyZoom(pinchStartZoom * getPinchDist(e.touches) / pinchStartDist)
}, { passive: false })

// ─── Pixels-per-inch ───
function getPixelsPerInch() {
  const distMeters = distanceFeet * FOOT_TO_METER
  const screenVFovRad = 69 * Math.PI / 180
  const visibleHeightInches = (2 * distMeters * Math.tan(screenVFovRad / 2)) / INCH_TO_METER
  return (artCanvas.height / visibleHeightInches) * scaleFactor
}

// ─── Draw art overlay ───
const artCtx = artCanvas.getContext('2d')

function drawArt() {
  const ctx = artCtx
  const cw = artCanvas.width
  const ch = artCanvas.height
  ctx.clearRect(0, 0, cw, ch)

  if (!isFrozen || !activePositions.length) return

  const ppi = getPixelsPerInch()
  const centerX = cw / 2 + artOffsetX
  const centerY = ch / 2 + artOffsetY
  const colors = ['#4ade80', '#60a5fa', '#f472b6', '#facc15', '#a78bfa', '#fb923c']

  // Tape guide line
  const isScaleMode = activePill === 'Scale'
  if (tapeLengthInches > 0) {
    const tapeW = tapeLengthInches * ppi
    const lineThick = isScaleMode ? 8 : 4
    const capThick = isScaleMode ? 5 : 3
    ctx.save()
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.6)'
    ctx.lineWidth = lineThick
    ctx.setLineDash([10, 6])
    ctx.beginPath()
    ctx.moveTo(centerX - tapeW / 2, centerY)
    ctx.lineTo(centerX + tapeW / 2, centerY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.lineWidth = capThick
    const capH = isScaleMode ? 22 : 16
    ;[centerX - tapeW / 2, centerX + tapeW / 2].forEach(cx => {
      ctx.beginPath()
      ctx.moveTo(cx, centerY - capH)
      ctx.lineTo(cx, centerY + capH)
      ctx.stroke()
    })
    ctx.fillStyle = 'rgba(74, 222, 128, 0.8)'
    ctx.font = `bold ${14 * devicePixelRatio}px -apple-system, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(`${tapeLengthInches}"`, centerX, centerY - capH - 6)
    ctx.restore()
  }

  // Wall outline
  if (wall.width && wall.height) {
    const wallWPx = wall.width * ppi
    const wallHPx = wall.height * ppi
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 4])
    ctx.strokeRect(centerX - wallWPx / 2, centerY - wallHPx / 2, wallWPx, wallHPx)
    ctx.setLineDash([])
  }

  // Art pieces
  activePositions.forEach((pos, posIdx) => {
    const piece = pieces[pos.index]
    if (!piece) return

    const w = pos.w * ppi
    const h = pos.h * ppi
    const px = pos._pixelOffsetX || 0
    const py = pos._pixelOffsetY || 0
    const x = centerX + pos.x * ppi - w / 2 + px
    const y = centerY - pos.y * ppi - h / 2 + py
    const color = colors[pos.index % colors.length]

    if (isScaleMode) {
      // Scale mode: yellow border only, fully transparent interior
      ctx.strokeStyle = '#facc15'
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, w, h)
    } else {
      // Frame shadow
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.5)'
      ctx.shadowBlur = 20
      ctx.shadowOffsetY = 8
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x - 4, y - 4, w + 8, h + 8)
      ctx.restore()

      // Art image — cover-fit
      if (piece._img && piece._img.complete) {
        const imgW = piece._img.naturalWidth
        const imgH = piece._img.naturalHeight
        const imgAspect = imgW / imgH
        const frameAspect = w / h
        let sx, sy, sw, sh
        if (imgAspect > frameAspect) {
          sh = imgH; sw = imgH * frameAspect
          sx = (imgW - sw) / 2; sy = 0
        } else {
          sw = imgW; sh = imgW / frameAspect
          sx = 0; sy = (imgH - sh) / 2
        }
        ctx.drawImage(piece._img, sx, sy, sw, sh, x, y, w, h)
      } else {
        ctx.fillStyle = color + 'cc'
        ctx.fillRect(x, y, w, h)
      }

      // Position badge
      if (activePositions.length > 1) {
        const badgeSize = 20 * devicePixelRatio
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillRect(x, y, badgeSize, badgeSize)
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${11 * devicePixelRatio}px -apple-system, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(`${posIdx + 1}`, x + badgeSize / 2, y + badgeSize * 0.75)
      }

      // Highlight dragged piece
      if (activePill === 'Position' && dragPieceIndex === posIdx) {
        ctx.strokeStyle = '#4ade80'
        ctx.lineWidth = 3
        ctx.strokeRect(x - 2, y - 2, w + 4, h + 4)
      }
    }
  })
}

// ─── Preload art images ───
function preloadArtImages() {
  pieces.forEach(piece => {
    if (piece.photoDataUrl) {
      const img = new Image()
      img.onload = () => { piece._img = img; if (isFrozen) drawArt() }
      img.src = piece.photoDataUrl
    }
  })
}

// ─── Compute piece order from spatial positions ───
// After drag, sort pieces by screen position (left→right, top→bottom)
// and update pieceOrder so layout switches respect the new arrangement
function updatePieceOrderFromPositions() {
  const ppi = getPixelsPerInch()

  // Calculate final screen position for each piece
  const withScreen = activePositions.map((pos, i) => {
    const finalX = pos.x * ppi + (pos._pixelOffsetX || 0)
    const finalY = -(pos.y * ppi) + (pos._pixelOffsetY || 0) // screen Y is inverted
    return { posIdx: i, pieceIdx: pos.index, screenX: finalX, screenY: finalY }
  })

  // Sort: top-to-bottom first (by row bands), then left-to-right
  // Use a row tolerance so pieces on roughly the same row sort by X
  const rowTolerance = 30 * devicePixelRatio
  withScreen.sort((a, b) => {
    const rowDiff = a.screenY - b.screenY
    if (Math.abs(rowDiff) > rowTolerance) return rowDiff
    return a.screenX - b.screenX
  })

  // Update pieceOrder: position i in the new layout → piece index
  pieceOrder = withScreen.map(s => s.pieceIdx)
}

// ─── Pill Navigation ───
const PILLS_TOP = ['Scale', 'Layout', 'Position', 'Retake']
const PILLS_BOTTOM = ['Back', 'Finish']
const pillSecondary = document.getElementById('pill-secondary')

function buildPills() {
  pillMain.innerHTML = ''
  PILLS_TOP.forEach(name => {
    const btn = document.createElement('button')
    btn.className = 'pill'
    btn.textContent = name
    btn.dataset.pill = name
    if (name === activePill) btn.classList.add('active')
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      onPillTap(name)
    })
    pillMain.appendChild(btn)
  })

  pillSecondary.innerHTML = ''
  PILLS_BOTTOM.forEach(name => {
    const btn = document.createElement('button')
    btn.className = 'pill'
    btn.textContent = name
    btn.dataset.pill = name
    btn.style.opacity = '0.7'
    btn.style.fontSize = '12px'
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      onPillTap(name)
    })
    pillSecondary.appendChild(btn)
  })
}

function updatePillHighlight() {
  pillMain.querySelectorAll('.pill').forEach(p => {
    p.classList.toggle('active', p.dataset.pill === activePill)
  })
}

function buildLayoutSub() {
  pillSub.innerHTML = ''
  LAYOUT_NAMES.forEach(name => {
    const btn = document.createElement('button')
    btn.className = 'pill sub-pill'
    if (name === currentLayoutName) btn.classList.add('active')
    btn.textContent = name
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      switchLayout(name)
    })
    pillSub.appendChild(btn)
  })
}

function onPillTap(name) {
  // When leaving Position mode, capture the spatial ordering
  if (activePill === 'Position' && name !== 'Position') {
    updatePieceOrderFromPositions()
  }

  // Close sub-panels
  pillSub.style.display = 'none'
  scaleRow.style.display = 'none'
  scaleTip.style.display = 'none'
  spacingRow.style.display = 'none'
  artCanvas.style.pointerEvents = 'none'

  switch (name) {
    case 'Back':
      confirmOverlay.style.display = 'flex'
      return

    case 'Retake':
      unfreeze()
      return

    case 'Layout':
      activePill = 'Layout'
      updatePillHighlight()
      buildLayoutSub()
      pillSub.style.display = 'flex'
      spacingRow.style.display = 'flex'
      drawArt()
      return

    case 'Scale':
      activePill = 'Scale'
      updatePillHighlight()
      scaleSlider.value = scaleFactor
      scaleRow.style.display = 'flex'
      scaleTip.style.display = 'block'
      artCanvas.style.pointerEvents = 'auto'
      drawArt()
      return

    case 'Position':
      activePill = 'Position'
      updatePillHighlight()
      artCanvas.style.pointerEvents = 'auto'
      drawArt()
      return

    case 'Finish':
      activePill = 'Finish'
      updatePillHighlight()
      showNailInstructions()
      return
  }
}

function switchLayout(name) {
  currentLayoutName = name
  resetPositions()
  artOffsetX = 0
  artOffsetY = 0
  drawArt()
  pillSub.querySelectorAll('.sub-pill').forEach(p => {
    p.classList.toggle('active', p.textContent === name)
  })
}

// ─── Scale slider ───
scaleSlider.addEventListener('input', (e) => {
  scaleFactor = parseFloat(e.target.value)
  drawArt()
})

// ─── Spacing slider ───
spacingSlider.addEventListener('input', (e) => {
  spacingInches = parseFloat(e.target.value)
  spacingVal.textContent = spacingInches + '"'
  resetPositions()
  artOffsetX = 0
  artOffsetY = 0
  drawArt()
})

// ─── Back confirmation ───
confirmCancel.addEventListener('click', (e) => {
  e.stopPropagation()
  confirmOverlay.style.display = 'none'
})

confirmYes.addEventListener('click', (e) => {
  e.stopPropagation()
  confirmOverlay.style.display = 'none'
  unfreeze()
  distOverlay.style.display = 'flex'
})

// ─── Freeze / Unfreeze ───
function freeze() {
  frozenCanvas.width = video.videoWidth || innerWidth
  frozenCanvas.height = video.videoHeight || innerHeight
  frozenCanvas.getContext('2d').drawImage(video, 0, 0, frozenCanvas.width, frozenCanvas.height)

  artCanvas.width = innerWidth * devicePixelRatio
  artCanvas.height = innerHeight * devicePixelRatio
  artCanvas.style.width = innerWidth + 'px'
  artCanvas.style.height = innerHeight + 'px'

  frozenCanvas.style.display = 'block'
  video.style.display = 'none'
  isFrozen = true
  stopLevel()
  artOffsetX = 0
  artOffsetY = 0

  // Reset piece order on fresh freeze
  pieceOrder = pieces.map((_, i) => i)
  resetPositions()

  preFreezeControls.style.display = 'none'
  pillNav.style.display = 'flex'
  buildPills()

  // Default to Scale (with drag enabled for positioning tape guide)
  activePill = 'Scale'
  updatePillHighlight()
  scaleSlider.value = scaleFactor
  scaleRow.style.display = 'flex'
  scaleTip.style.display = 'block'
  artCanvas.style.pointerEvents = 'auto'

  drawArt()
}

function unfreeze() {
  frozenCanvas.style.display = 'none'
  video.style.display = 'block'
  isFrozen = false
  scaleFactor = 1.0
  artCanvas.style.pointerEvents = 'none'
  artCanvas.getContext('2d').clearRect(0, 0, artCanvas.width, artCanvas.height)

  pillNav.style.display = 'none'
  pillSub.style.display = 'none'
  scaleRow.style.display = 'none'
  scaleTip.style.display = 'none'
  spacingRow.style.display = 'none'
  preFreezeControls.style.display = 'flex'
  activePill = null

  instructions.textContent = 'Point at your wall and tap the button'
  startLevel()
}

// ─── Distance selection ───
function setDistance(feet) {
  distanceFeet = feet
  tapeLengthInches = state.tapeLength || 0
  distOverlay.style.display = 'none'
  instructions.textContent = 'Point at your wall and tap the button'
  startLevel()
}

distPresets.forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    setDistance(parseFloat(btn.dataset.dist))
  })
})

customGoBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  const val = parseFloat(customDistInput.value)
  if (val > 0) setDistance(val)
})

// ─── Capture ───
captureBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  freeze()
})

// ─── Drag (per-piece for all layouts) ───
function hitTestPiece(touchX, touchY) {
  const ppi = getPixelsPerInch()
  const cw = artCanvas.width
  const ch = artCanvas.height
  const centerX = cw / 2 + artOffsetX
  const centerY = ch / 2 + artOffsetY
  const dpr = devicePixelRatio

  for (let i = activePositions.length - 1; i >= 0; i--) {
    const pos = activePositions[i]
    const px = pos._pixelOffsetX || 0
    const py = pos._pixelOffsetY || 0
    const x = centerX + pos.x * ppi - (pos.w * ppi) / 2 + px
    const y = centerY - pos.y * ppi - (pos.h * ppi) / 2 + py
    const w = pos.w * ppi
    const h = pos.h * ppi

    if (touchX * dpr >= x && touchX * dpr <= x + w &&
        touchY * dpr >= y && touchY * dpr <= y + h) {
      return i
    }
  }
  return -1
}

artCanvas.addEventListener('touchstart', (e) => {
  if (!isFrozen) return
  if (e.touches.length !== 1) return
  const touch = e.touches[0]

  if (activePill === 'Scale') {
    // Drag whole overlay to align tape guide with physical tape
    isDragging = true
    dragPieceIndex = -1
    dragStartX = touch.clientX
    dragStartY = touch.clientY
    dragStartOffsetX = artOffsetX
    dragStartOffsetY = artOffsetY
    return
  }

  if (activePill !== 'Position') return
  dragPieceIndex = hitTestPiece(touch.clientX, touch.clientY)
  if (dragPieceIndex >= 0) {
    isDragging = true
    dragStartX = touch.clientX
    dragStartY = touch.clientY
    const pos = activePositions[dragPieceIndex]
    dragStartOffsetX = pos._pixelOffsetX || 0
    dragStartOffsetY = pos._pixelOffsetY || 0
    drawArt()
  }
}, { passive: true })

artCanvas.addEventListener('touchmove', (e) => {
  if (!isDragging) return
  if (e.touches.length !== 1) { isDragging = false; return }
  const touch = e.touches[0]
  const dpr = devicePixelRatio

  if (activePill === 'Scale') {
    artOffsetX = dragStartOffsetX + (touch.clientX - dragStartX) * dpr
    artOffsetY = dragStartOffsetY + (touch.clientY - dragStartY) * dpr
    drawArt()
    return
  }

  const pos = activePositions[dragPieceIndex]
  pos._pixelOffsetX = dragStartOffsetX + (touch.clientX - dragStartX) * dpr
  pos._pixelOffsetY = dragStartOffsetY + (touch.clientY - dragStartY) * dpr
  drawArt()
}, { passive: true })

artCanvas.addEventListener('touchend', () => {
  isDragging = false
  dragPieceIndex = -1
  drawArt()
})

// Mouse fallback
artCanvas.addEventListener('mousedown', (e) => {
  if (!isFrozen) return

  if (activePill === 'Scale') {
    isDragging = true
    dragPieceIndex = -1
    dragStartX = e.clientX
    dragStartY = e.clientY
    dragStartOffsetX = artOffsetX
    dragStartOffsetY = artOffsetY
    return
  }

  if (activePill !== 'Position') return
  dragPieceIndex = hitTestPiece(e.clientX, e.clientY)
  if (dragPieceIndex >= 0) {
    isDragging = true
    dragStartX = e.clientX
    dragStartY = e.clientY
    const pos = activePositions[dragPieceIndex]
    dragStartOffsetX = pos._pixelOffsetX || 0
    dragStartOffsetY = pos._pixelOffsetY || 0
    drawArt()
  }
})
window.addEventListener('mousemove', (e) => {
  if (!isDragging) return
  const dpr = devicePixelRatio

  if (activePill === 'Scale') {
    artOffsetX = dragStartOffsetX + (e.clientX - dragStartX) * dpr
    artOffsetY = dragStartOffsetY + (e.clientY - dragStartY) * dpr
    drawArt()
    return
  }

  const pos = activePositions[dragPieceIndex]
  pos._pixelOffsetX = dragStartOffsetX + (e.clientX - dragStartX) * dpr
  pos._pixelOffsetY = dragStartOffsetY + (e.clientY - dragStartY) * dpr
  drawArt()
})
window.addEventListener('mouseup', () => {
  isDragging = false
  dragPieceIndex = -1
  drawArt()
})

// ─── Nail placement ───
function showNailInstructions() {
  const ppi = getPixelsPerInch()
  const colors = ['#4ade80', '#60a5fa', '#f472b6', '#facc15', '#a78bfa', '#fb923c']

  nailList.innerHTML = ''

  activePositions.forEach((pos, posIdx) => {
    const piece = pieces[pos.index]
    if (!piece) return

    const extraX = (pos._pixelOffsetX || 0) / ppi
    const extraY = -(pos._pixelOffsetY || 0) / ppi

    const pieceCenterX = pos.x + extraX
    const pieceCenterY = pos.y + extraY

    const nailHeight = TAPE_HEIGHT + pieceCenterY + pos.h / 2
    const nailHorizFromCenter = pieceCenterX

    let fromRightEdge = null
    let fromLeftEdge = null
    if (tapeLengthInches > 0) {
      fromRightEdge = (tapeLengthInches / 2) - nailHorizFromCenter
      fromLeftEdge = (tapeLengthInches / 2) + nailHorizFromCenter
    }

    const color = colors[pos.index % colors.length]
    const card = document.createElement('div')
    card.className = 'nail-card'

    let metricsHtml = `
      <div class="nail-metric">
        <span class="nail-metric-label">Nail height from floor</span>
        <span class="nail-metric-value">${nailHeight.toFixed(1)}"</span>
      </div>
    `

    if (tapeLengthInches > 0) {
      metricsHtml += `
        <div class="nail-metric">
          <span class="nail-metric-label">From tape left edge</span>
          <span class="nail-metric-value">${fromLeftEdge.toFixed(1)}"</span>
        </div>
        <div class="nail-metric">
          <span class="nail-metric-label">From tape right edge</span>
          <span class="nail-metric-value">${fromRightEdge.toFixed(1)}"</span>
        </div>
      `
    } else {
      metricsHtml += `
        <div class="nail-metric">
          <span class="nail-metric-label">Horizontal from tape center</span>
          <span class="nail-metric-value">${Math.abs(nailHorizFromCenter).toFixed(1)}" ${nailHorizFromCenter >= 0 ? 'right' : 'left'}</span>
        </div>
      `
    }

    metricsHtml += `
      <div class="nail-metric">
        <span class="nail-metric-label">Piece size</span>
        <span class="nail-metric-value">${pos.w}" × ${pos.h}"</span>
      </div>
    `

    card.innerHTML = `
      <div class="nail-card-title" style="color:${color};">
        ${piece.photoDataUrl ? `<img src="${piece.photoDataUrl}" style="width:24px;height:24px;border-radius:4px;object-fit:cover;vertical-align:middle;margin-right:8px;">` : ''}
        Piece ${posIdx + 1}
      </div>
      ${metricsHtml}
    `
    nailList.appendChild(card)
  })

  if (tapeLengthInches === 0) {
    const tip = document.createElement('div')
    tip.style.cssText = 'text-align:center;padding:12px;color:#666;font-size:12px;'
    tip.textContent = 'Tip: Add tape length on the first screen for edge-relative measurements'
    nailList.appendChild(tip)
  }

  nailOverlay.style.display = 'flex'
}

// Nail overlay: Back returns to position mode
nailCloseBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  nailOverlay.style.display = 'none'
  activePill = 'Position'
  updatePillHighlight()
  artCanvas.style.pointerEvents = 'auto'
})

// Nail overlay: Finish ends the session
nailFinishBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  nailOverlay.style.display = 'none'
  stopCamera()
  window.location.href = 'index.html'
})

// ─── Level indicator (DeviceOrientation) ───
let levelActive = false
let _levelPermissionGranted = false

function handleOrientation(e) {
  if (isFrozen || !levelActive) return
  const betaOff = (e.beta || 0) - 90
  const gammaOff = e.gamma || 0
  const maxPx = 55
  const bx = Math.max(-maxPx, Math.min(maxPx, gammaOff * 3))
  const by = Math.max(-maxPx, Math.min(maxPx, betaOff * 3))
  levelBubble.style.transform = `translate(calc(-50% + ${bx}px), calc(-50% + ${by}px))`
  const isLevel = Math.abs(betaOff) < 5 && Math.abs(gammaOff) < 5
  levelBubble.classList.toggle('level-ok', isLevel)
  levelLabel.textContent = isLevel ? 'Level' : 'Tilt to level'
  levelLabel.style.color = isLevel ? 'rgba(74,222,128,0.8)' : 'rgba(255,255,255,0.4)'
}

function startLevel() {
  if (levelActive) return
  levelActive = true
  levelIndicator.style.display = 'block'

  if (_levelPermissionGranted) {
    window.addEventListener('deviceorientation', handleOrientation)
    return
  }

  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then(response => {
        if (response === 'granted') {
          _levelPermissionGranted = true
          window.addEventListener('deviceorientation', handleOrientation)
        } else {
          levelIndicator.style.display = 'none'
        }
      })
      .catch(() => { levelIndicator.style.display = 'none' })
  } else if ('DeviceOrientationEvent' in window) {
    _levelPermissionGranted = true
    window.addEventListener('deviceorientation', handleOrientation)
  } else {
    levelIndicator.style.display = 'none'
  }
}

function stopLevel() {
  levelActive = false
  levelIndicator.style.display = 'none'
  window.removeEventListener('deviceorientation', handleOrientation)
}

// ─── Cleanup ───
function stopCamera() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop())
    video.srcObject = null
    cameraTrack = null
  }
}

window.addEventListener('beforeunload', stopCamera)

window.addEventListener('resize', () => {
  if (isFrozen) {
    artCanvas.width = innerWidth * devicePixelRatio
    artCanvas.height = innerHeight * devicePixelRatio
    artCanvas.style.width = innerWidth + 'px'
    artCanvas.style.height = innerHeight + 'px'
    drawArt()
  }
})

// ─── Init ───
preloadArtImages()
startCamera()
