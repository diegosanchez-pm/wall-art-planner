/**
 * Image Editor — Crop & Rotate
 * Fullscreen modal with touch-friendly crop area and rotate controls.
 * Returns a cropped/rotated data URL via callback.
 */

const ImageEditor = {
  _modal: null,
  _canvas: null,
  _ctx: null,
  _img: null,
  _rotation: 0,       // degrees: 0, 90, 180, 270
  _crop: { x: 0, y: 0, w: 0, h: 0 },
  _dragging: null,     // null | 'move' | 'nw' | 'ne' | 'sw' | 'se'
  _dragStart: { x: 0, y: 0 },
  _cropStart: { x: 0, y: 0, w: 0, h: 0 },
  _onDone: null,
  _scale: 1,
  _imgX: 0,
  _imgY: 0,
  _imgDrawW: 0,
  _imgDrawH: 0,

  open(dataUrl, callback) {
    this._onDone = callback
    this._rotation = 0
    this._createModal()

    this._img = new Image()
    this._img.onload = () => {
      this._initCrop()
      this._draw()
    }
    this._img.src = dataUrl
  },

  _createModal() {
    if (this._modal) this._modal.remove()

    this._modal = document.createElement('div')
    this._modal.id = 'image-editor-modal'
    this._modal.innerHTML = `
      <div class="ie-header">
        <button class="ie-btn ie-cancel">Cancel</button>
        <span class="ie-title">Edit Photo</span>
        <button class="ie-btn ie-done">Done</button>
      </div>
      <div class="ie-canvas-wrap">
        <canvas id="ie-canvas"></canvas>
      </div>
      <div class="ie-toolbar">
        <button class="ie-tool-btn" id="ie-rotate-left">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2.5 2v6h6"/><path d="M2.5 8C5 4 8.5 2 12.5 2a10 10 0 1 1-9.5 13"/>
          </svg>
          <span>Rotate Left</span>
        </button>
        <button class="ie-tool-btn" id="ie-rotate-right">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.5 2v6h-6"/><path d="M21.5 8C19 4 15.5 2 11.5 2a10 10 0 1 0 9.5 13"/>
          </svg>
          <span>Rotate Right</span>
        </button>
        <button class="ie-tool-btn" id="ie-reset-crop">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
          </svg>
          <span>Reset Crop</span>
        </button>
      </div>
    `
    document.body.appendChild(this._modal)

    this._canvas = document.getElementById('ie-canvas')
    this._ctx = this._canvas.getContext('2d')

    // Events
    this._modal.querySelector('.ie-cancel').addEventListener('click', () => this._close())
    this._modal.querySelector('.ie-done').addEventListener('click', () => this._export())
    document.getElementById('ie-rotate-left').addEventListener('click', () => this._rotate(-90))
    document.getElementById('ie-rotate-right').addEventListener('click', () => this._rotate(90))
    document.getElementById('ie-reset-crop').addEventListener('click', () => { this._initCrop(); this._draw() })

    // Touch/mouse crop interaction
    this._canvas.addEventListener('mousedown', (e) => this._onPointerDown(e.offsetX, e.offsetY))
    this._canvas.addEventListener('mousemove', (e) => this._onPointerMove(e.offsetX, e.offsetY))
    this._canvas.addEventListener('mouseup', () => this._onPointerUp())

    this._canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      const t = e.touches[0]
      const rect = this._canvas.getBoundingClientRect()
      const sx = this._canvas.width / rect.width
      const sy = this._canvas.height / rect.height
      this._onPointerDown((t.clientX - rect.left) * sx, (t.clientY - rect.top) * sy)
    }, { passive: false })

    this._canvas.addEventListener('touchmove', (e) => {
      e.preventDefault()
      const t = e.touches[0]
      const rect = this._canvas.getBoundingClientRect()
      const sx = this._canvas.width / rect.width
      const sy = this._canvas.height / rect.height
      this._onPointerMove((t.clientX - rect.left) * sx, (t.clientY - rect.top) * sy)
    }, { passive: false })

    this._canvas.addEventListener('touchend', () => this._onPointerUp())

    // Size canvas
    this._resizeCanvas()
    this._resizeHandler = () => { this._resizeCanvas(); this._initCrop(); this._draw() }
    window.addEventListener('resize', this._resizeHandler)
  },

  _resizeCanvas() {
    const wrap = this._modal.querySelector('.ie-canvas-wrap')
    const dpr = window.devicePixelRatio || 1
    this._canvas.width = wrap.clientWidth * dpr
    this._canvas.height = wrap.clientHeight * dpr
    this._canvas.style.width = wrap.clientWidth + 'px'
    this._canvas.style.height = wrap.clientHeight + 'px'
  },

  _getRotatedDimensions() {
    const r = ((this._rotation % 360) + 360) % 360
    if (r === 90 || r === 270) {
      return { w: this._img.height, h: this._img.width }
    }
    return { w: this._img.width, h: this._img.height }
  },

  _initCrop() {
    const dim = this._getRotatedDimensions()
    const cw = this._canvas.width
    const ch = this._canvas.height
    const padding = 40

    const scaleX = (cw - padding * 2) / dim.w
    const scaleY = (ch - padding * 2) / dim.h
    this._scale = Math.min(scaleX, scaleY)

    this._imgDrawW = dim.w * this._scale
    this._imgDrawH = dim.h * this._scale
    this._imgX = (cw - this._imgDrawW) / 2
    this._imgY = (ch - this._imgDrawH) / 2

    // Default crop = full image
    this._crop = {
      x: this._imgX,
      y: this._imgY,
      w: this._imgDrawW,
      h: this._imgDrawH
    }
  },

  _draw() {
    const ctx = this._ctx
    const cw = this._canvas.width
    const ch = this._canvas.height

    ctx.clearRect(0, 0, cw, ch)
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, cw, ch)

    // Draw rotated image
    ctx.save()
    ctx.translate(cw / 2, ch / 2)
    ctx.rotate((this._rotation * Math.PI) / 180)

    const dim = this._getRotatedDimensions()
    // When rotated, we draw the original image but the translate/rotate handles orientation
    ctx.drawImage(
      this._img,
      -this._imgDrawW / 2, -this._imgDrawH / 2,
      this._imgDrawW, this._imgDrawH
    )
    ctx.restore()

    // Dim area outside crop
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    // Top
    ctx.fillRect(0, 0, cw, this._crop.y)
    // Bottom
    ctx.fillRect(0, this._crop.y + this._crop.h, cw, ch - this._crop.y - this._crop.h)
    // Left
    ctx.fillRect(0, this._crop.y, this._crop.x, this._crop.h)
    // Right
    ctx.fillRect(this._crop.x + this._crop.w, this._crop.y, cw - this._crop.x - this._crop.w, this._crop.h)

    // Crop border
    ctx.strokeStyle = '#4ade80'
    ctx.lineWidth = 3
    ctx.strokeRect(this._crop.x, this._crop.y, this._crop.w, this._crop.h)

    // Grid lines (rule of thirds)
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 1
    for (let i = 1; i < 3; i++) {
      const gx = this._crop.x + (this._crop.w / 3) * i
      const gy = this._crop.y + (this._crop.h / 3) * i
      ctx.beginPath(); ctx.moveTo(gx, this._crop.y); ctx.lineTo(gx, this._crop.y + this._crop.h); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(this._crop.x, gy); ctx.lineTo(this._crop.x + this._crop.w, gy); ctx.stroke()
    }

    // Corner handles
    const hs = 20
    ctx.fillStyle = '#4ade80'
    const corners = [
      [this._crop.x, this._crop.y],
      [this._crop.x + this._crop.w, this._crop.y],
      [this._crop.x, this._crop.y + this._crop.h],
      [this._crop.x + this._crop.w, this._crop.y + this._crop.h],
    ]
    corners.forEach(([cx, cy]) => {
      ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs)
    })
  },

  _hitTest(x, y) {
    const c = this._crop
    const hs = 30 // hit area size

    // Corners
    if (Math.abs(x - c.x) < hs && Math.abs(y - c.y) < hs) return 'nw'
    if (Math.abs(x - (c.x + c.w)) < hs && Math.abs(y - c.y) < hs) return 'ne'
    if (Math.abs(x - c.x) < hs && Math.abs(y - (c.y + c.h)) < hs) return 'sw'
    if (Math.abs(x - (c.x + c.w)) < hs && Math.abs(y - (c.y + c.h)) < hs) return 'se'

    // Inside crop area = move
    if (x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h) return 'move'

    return null
  },

  _onPointerDown(x, y) {
    this._dragging = this._hitTest(x, y)
    if (!this._dragging) return
    this._dragStart = { x, y }
    this._cropStart = { ...this._crop }
  },

  _onPointerMove(x, y) {
    if (!this._dragging) {
      // Update cursor
      const hit = this._hitTest(x, y)
      this._canvas.style.cursor = hit === 'move' ? 'move'
        : hit ? 'nwse-resize' : 'default'
      return
    }

    const dx = x - this._dragStart.x
    const dy = y - this._dragStart.y
    const cs = this._cropStart
    const minSize = 40

    if (this._dragging === 'move') {
      this._crop.x = Math.max(this._imgX, Math.min(cs.x + dx, this._imgX + this._imgDrawW - cs.w))
      this._crop.y = Math.max(this._imgY, Math.min(cs.y + dy, this._imgY + this._imgDrawH - cs.h))
    } else {
      let nx = cs.x, ny = cs.y, nw = cs.w, nh = cs.h

      if (this._dragging.includes('w')) { nx = cs.x + dx; nw = cs.w - dx }
      if (this._dragging.includes('e')) { nw = cs.w + dx }
      if (this._dragging.includes('n')) { ny = cs.y + dy; nh = cs.h - dy }
      if (this._dragging.includes('s')) { nh = cs.h + dy }

      // Enforce minimum size
      if (nw < minSize) { nw = minSize; if (this._dragging.includes('w')) nx = cs.x + cs.w - minSize }
      if (nh < minSize) { nh = minSize; if (this._dragging.includes('n')) ny = cs.y + cs.h - minSize }

      // Clamp to image bounds
      nx = Math.max(this._imgX, nx)
      ny = Math.max(this._imgY, ny)
      if (nx + nw > this._imgX + this._imgDrawW) nw = this._imgX + this._imgDrawW - nx
      if (ny + nh > this._imgY + this._imgDrawH) nh = this._imgY + this._imgDrawH - ny

      this._crop = { x: nx, y: ny, w: nw, h: nh }
    }

    this._draw()
  },

  _onPointerUp() {
    this._dragging = null
  },

  _rotate(deg) {
    this._rotation = (this._rotation + deg + 360) % 360
    this._initCrop()
    this._draw()
  },

  _export() {
    // Map crop rect back to original image coordinates
    const cropInImg = {
      x: (this._crop.x - this._imgX) / this._scale,
      y: (this._crop.y - this._imgY) / this._scale,
      w: this._crop.w / this._scale,
      h: this._crop.h / this._scale,
    }

    // Create output canvas
    const out = document.createElement('canvas')
    out.width = Math.round(cropInImg.w)
    out.height = Math.round(cropInImg.h)
    const octx = out.getContext('2d')

    // Draw rotated + cropped image
    const r = ((this._rotation % 360) + 360) % 360
    const dim = this._getRotatedDimensions()

    // Translate so the crop region maps to (0,0)
    octx.save()
    octx.translate(-cropInImg.x, -cropInImg.y)
    octx.translate(dim.w / 2, dim.h / 2)
    octx.rotate((r * Math.PI) / 180)
    octx.drawImage(this._img, -this._img.width / 2, -this._img.height / 2)
    octx.restore()

    const dataUrl = out.toDataURL('image/jpeg', 0.85)
    this._close()
    if (this._onDone) this._onDone(dataUrl)
  },

  _close() {
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler)
      this._resizeHandler = null
    }
    if (this._modal) {
      this._modal.remove()
      this._modal = null
    }
    this._canvas = null
    this._ctx = null
    this._img = null
  }
}

window.ImageEditor = ImageEditor
