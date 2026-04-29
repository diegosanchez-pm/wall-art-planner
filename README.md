# Wall Art Planner

Plan your gallery wall. Enter wall and art dimensions, preview layouts on your actual wall using your phone's camera, and get exact nail placement measurements. All art hung gallery style at 60 inches center height.

## How It Works

```
index.html                  Input: wall size, tape length, art dimensions
  |
  v
ar.html                     Distance selection → Camera → Freeze frame
  |
  v
Pill Nav                    Scale → Layout → Position → Finish
  |
  v
Nail Instructions           Exact measurements from tape reference
```

## Quick Start

```bash
# Any static file server works
python3 -m http.server 8080

# HTTPS required for camera access on mobile — use ngrok
ngrok http http://localhost:8080
```

Open the ngrok URL on your phone. That's it.

## User Flow

1. **Input** — Enter wall dimensions (required), tape length (recommended), and art piece dimensions. Demo mode available with placeholder pieces.
2. **Distance** — Select how far you're standing from the wall (3, 5, 7, or 10 ft).
3. **Aim** — Point phone at wall. Level indicator helps keep it straight. Pinch to zoom.
4. **Freeze** — Tap capture. Camera freezes. Art overlays at calculated scale.
5. **Scale** — Adjust scale slider until the green tape guide matches your physical tape. Drag to reposition the guide. Art shows as yellow outlines so the guide is clearly visible.
6. **Layout** — Choose from 5 arrangements (Grid, Stacked, Salon, Centered Row, Custom). Adjust spacing between pieces.
7. **Position** — Drag individual pieces to fine-tune placement. Position swaps persist across layout changes.
8. **Finish** — Get nail placement measurements relative to your tape (height from floor, distance from tape edges).

## Features

- Freeze-frame camera with pinch-to-zoom
- 5 layout algorithms with adjustable spacing
- Scale calibration with tape guide overlay
- Per-piece drag-and-drop positioning
- Position memory across layout switches
- Phone level indicator (DeviceOrientation API)
- Nail placement instructions with tape-relative measurements
- Image crop/rotate editor for art photos
- Demo mode with placeholder pieces
- localStorage persistence with compression fallback
- Gallery hang standard (60" center height)

## Tech Stack

- Vanilla JS — no build step, no framework, no dependencies
- Canvas API — freeze-frame capture + art overlay rendering
- Camera API — getUserMedia with native zoom support
- DeviceOrientation API — level indicator

## Project Structure

```
wall-art-planner/
├── index.html          Input form (wall + art + tape + prep instructions)
├── ar.html             Camera preview (all CSS inline)
├── css/
│   └── style.css       Shared dark theme
├── js/
│   ├── app.js          Form state + localStorage + demo/custom toggle
│   ├── layout-engine.js    5 layout algorithms
│   ├── image-editor.js     Crop/rotate modal
│   └── freeze-preview.js   Camera, freeze, scale, drag, nail instructions
├── .gitignore
└── README.md
```

Total codebase: ~80KB across 6 active files.

## Deployment

Host on any static platform (GitHub Pages, Vercel, Netlify). HTTPS is required for camera access on mobile. No API keys, no server-side code, no accounts needed.

## License

MIT
