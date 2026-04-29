/**
 * App State Manager
 * Handles form data, photo storage, and navigation between screens.
 */

// Compress a data URL by re-encoding at lower quality (async — Image must load first)
function compressDataUrl(dataUrl, quality) {
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxDim = 800
        let w = img.naturalWidth || 800
        let h = img.naturalHeight || 800
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h)
          w = Math.round(w * ratio)
          h = Math.round(h * ratio)
        }
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality || 0.6))
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    } catch (e) {
      resolve(dataUrl)
    }
  })
}

const AppState = {
  wall: { width: 0, height: 0 },
  tapeLength: 0,
  pieces: [],       // { width, height, photoDataUrl }
  selectedLayout: null,

  async save() {
    const data = {
      wall: this.wall,
      tapeLength: this.tapeLength,
      pieces: this.pieces,
      selectedLayout: this.selectedLayout,
    }
    try {
      localStorage.setItem('wall-art-planner', JSON.stringify(data))
    } catch (e) {
      // localStorage full — compress photos and retry
      console.warn('Storage full, compressing photos...')
      data.pieces = await Promise.all(data.pieces.map(async p => ({
        ...p,
        photoDataUrl: p.photoDataUrl ? await compressDataUrl(p.photoDataUrl, 0.5) : ''
      })))
      try {
        localStorage.setItem('wall-art-planner', JSON.stringify(data))
      } catch (e2) {
        // Last resort: strip photos entirely to save dimensions
        console.error('Still too large, stripping photos:', e2)
        data.pieces = data.pieces.map(p => ({ ...p, photoDataUrl: '' }))
        try {
          localStorage.setItem('wall-art-planner', JSON.stringify(data))
        } catch (e3) {
          console.error('Cannot save to localStorage:', e3)
          alert('Storage full. Clear browser data and try again.')
        }
      }
    }
  },

  load() {
    try {
      const raw = localStorage.getItem('wall-art-planner')
      if (raw) {
        const data = JSON.parse(raw)
        this.wall = data.wall || { width: 0, height: 0 }
        this.tapeLength = data.tapeLength || 0
        this.pieces = data.pieces || []
        this.selectedLayout = data.selectedLayout || null
      }
    } catch (e) {
      console.warn('Failed to load state:', e)
    }
  },

  clear() {
    this.wall = { width: 0, height: 0 }
    this.tapeLength = 0
    this.pieces = []
    this.selectedLayout = null
    localStorage.removeItem('wall-art-planner')
  }
}

/**
 * Input Form Controller (index.html)
 */
function initInputForm() {
  const wallW = document.getElementById('wall-width')
  const wallH = document.getElementById('wall-height')
  const piecesContainer = document.getElementById('pieces-container')
  const addBtn = document.getElementById('add-piece-btn')
  const generateBtn = document.getElementById('generate-btn')
  const modeToggle = document.getElementById('art-mode-toggle')
  const modeLabel = document.getElementById('mode-label')
  const modeDesc = document.getElementById('mode-desc')
  const toggleKnob = document.getElementById('toggle-knob')

  const tapeInput = document.getElementById('tape-length')

  if (!piecesContainer) return // not on input page

  // Load existing state
  AppState.load()
  if (AppState.wall.width) wallW.value = AppState.wall.width
  if (AppState.wall.height) wallH.value = AppState.wall.height
  if (AppState.tapeLength) tapeInput.value = AppState.tapeLength

  let isCustomMode = false // false = demo, true = my art

  // ─── Demo/Custom toggle ───
  function setMode(custom) {
    isCustomMode = custom
    modeToggle.checked = custom
    toggleKnob.style.transform = custom ? 'translateX(20px)' : 'none'
    modeToggle.parentElement.querySelector('span:nth-child(2)').style.background =
      custom ? '#4ade80' : 'var(--border)'

    if (custom) {
      modeLabel.textContent = 'My Art'
      modeDesc.textContent = 'Add your own photos and dimensions'
      addBtn.style.display = 'block'
      // Clear demo pieces, add one blank card
      piecesContainer.innerHTML = ''
      pieceCount = 0
      // Restore saved pieces or add blank
      if (AppState.pieces.length && AppState.pieces[0].photoDataUrl &&
          !AppState.pieces[0].photoDataUrl.startsWith('data:image/png;base64,iVBOR')) {
        AppState.pieces.forEach(p => addPieceCard(p, true))
      } else {
        addPieceCard(null, true)
      }
    } else {
      modeLabel.textContent = 'Demo Mode'
      modeDesc.textContent = 'Using placeholder art'
      addBtn.style.display = 'none'
      // Load demo pieces — no photo upload, dimensions only
      piecesContainer.innerHTML = ''
      pieceCount = 0
      const defaults = [
        { width: 12, height: 16, photoDataUrl: '' },
        { width: 8, height: 10, photoDataUrl: '' },
        { width: 12, height: 24, photoDataUrl: '' },
        { width: 10, height: 14, photoDataUrl: '' },
      ]
      defaults.forEach(d => addPieceCard(d, false))
    }
  }

  modeToggle.addEventListener('change', () => setMode(modeToggle.checked))

  let pieceCount = 0

  function addPieceCard(existing, showPhoto) {
    pieceCount++
    const id = pieceCount
    const card = document.createElement('div')
    card.className = 'card art-card'
    card.dataset.pieceId = id

    const photoHtml = showPhoto ? `
      <div class="photo-upload" data-upload="${id}">
        <span class="photo-upload-label">Tap to add photo</span>
        <input type="file" accept="image/*" capture="environment" data-file="${id}">
      </div>` : ''

    card.innerHTML = `
      <div class="art-card-header">
        <span class="art-card-title">Art Piece ${id}</span>
        <button class="art-card-remove" data-remove="${id}">&times;</button>
      </div>
      ${photoHtml}
      <div class="input-row">
        <div class="input-group">
          <label>Width (inches)</label>
          <input type="number" inputmode="decimal" placeholder="24" data-pw="${id}"
            value="${existing ? existing.width : ''}">
        </div>
        <div class="input-group">
          <label>Height (inches)</label>
          <input type="number" inputmode="decimal" placeholder="36" data-ph="${id}"
            value="${existing ? existing.height : ''}">
        </div>
      </div>
    `
    piecesContainer.appendChild(card)

    // Photo upload handler (only when photo area exists)
    const fileInput = card.querySelector(`[data-file="${id}"]`)
    const uploadArea = card.querySelector(`[data-upload="${id}"]`)

    function applyPhoto(uploadEl, pieceId, dataUrl) {
      uploadEl.innerHTML = `<img src="${dataUrl}" alt="Art ${pieceId}">`
      uploadEl.dataset.photoData = dataUrl
      // Edit button overlay
      const editBtn = document.createElement('button')
      editBtn.className = 'photo-edit-btn'
      editBtn.textContent = 'Edit'
      editBtn.addEventListener('click', (ev) => {
        ev.stopPropagation()
        ev.preventDefault()
        ImageEditor.open(uploadEl.dataset.photoData, (edited) => {
          applyPhoto(uploadEl, pieceId, edited)
        })
      })
      uploadEl.appendChild(editBtn)
      // Re-add file input
      const newInput = document.createElement('input')
      newInput.type = 'file'
      newInput.accept = 'image/*'
      newInput.capture = 'environment'
      newInput.dataset.file = pieceId
      newInput.style.cssText = 'position:absolute;inset:0;opacity:0;cursor:pointer;'
      newInput.addEventListener('change', makeFileHandler(uploadEl, pieceId))
      uploadEl.appendChild(newInput)
    }

    function makeFileHandler(uploadEl, pieceId) {
      return (e) => {
        const file = e.target.files[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => {
          ImageEditor.open(ev.target.result, (edited) => {
            applyPhoto(uploadEl, pieceId, edited)
          })
        }
        reader.readAsDataURL(file)
      }
    }

    if (fileInput && uploadArea) {
      fileInput.addEventListener('change', makeFileHandler(uploadArea, id))

      // If loading existing data with photo
      if (existing && existing.photoDataUrl) {
        applyPhoto(uploadArea, id, existing.photoDataUrl)
      }
    }

    // Remove handler
    card.querySelector(`[data-remove="${id}"]`).addEventListener('click', () => {
      card.remove()
      updatePieceNumbers()
    })
  }

  function updatePieceNumbers() {
    const cards = piecesContainer.querySelectorAll('.art-card')
    cards.forEach((card, i) => {
      card.querySelector('.art-card-title').textContent = `Art Piece ${i + 1}`
    })
  }

  // Initialize mode — demo by default
  setMode(false)

  addBtn.addEventListener('click', () => addPieceCard(null, true))

  // Error display
  function showError(msg) {
    let errEl = document.getElementById('form-error')
    if (!errEl) {
      errEl = document.createElement('div')
      errEl.id = 'form-error'
      errEl.style.cssText = 'background:#C0392B;color:#fff;padding:12px 16px;border-radius:8px;margin-bottom:12px;font-size:14px;font-weight:500;text-align:center;'
      generateBtn.parentElement.insertBefore(errEl, generateBtn)
    }
    errEl.textContent = msg
    errEl.style.display = 'block'
    setTimeout(() => { errEl.style.display = 'none' }, 4000)
  }

  // Generate layouts
  generateBtn.addEventListener('click', async () => {
    try {
      const w = parseFloat(wallW.value) || 0
      const h = parseFloat(wallH.value) || 0

      if (!w || !h) { showError('Enter wall width and height'); return }

      AppState.wall = { width: w, height: h }
      AppState.tapeLength = parseFloat(tapeInput.value) || 0
      AppState.pieces = []

      const cards = piecesContainer.querySelectorAll('.art-card')
      if (cards.length === 0) { showError('Add at least one art piece'); return }

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i]
        const inputs = card.querySelectorAll('input[type="number"]')
        const upload = card.querySelector('.photo-upload')

        const pw = inputs[0] ? parseFloat(inputs[0].value) : 0
        const ph = inputs[1] ? parseFloat(inputs[1].value) : 0
        const photoDataUrl = (upload && upload.dataset.photoData) || ''

        if (!pw || !ph) { showError(`Enter width and height for Art Piece ${i + 1}`); return }

        AppState.pieces.push({ width: pw, height: ph, photoDataUrl })
      }

      generateBtn.disabled = true
      generateBtn.textContent = 'Saving...'
      await AppState.save()
      window.location.href = 'ar.html'
    } catch (e) {
      generateBtn.disabled = false
      generateBtn.textContent = 'Preview on Wall'
      showError('Error: ' + e.message)
    }
  })
}

// Auto-init based on page
document.addEventListener('DOMContentLoaded', initInputForm)
