# Wall Art Planner — Project Notes

## Project Identity

**One-liner:** Tool that lets you preview art arrangements on your actual wall before hammering nails.

**Strategic reframe:** This isn't just a tool. It's a free, privacy-first experience that removes every barrier between "I like that" and "it's on my wall." No app download, no data harvesting. See it, place it, hang it.

**Why it matters:** "Quality of life improvement. Art makes you better. Being around it makes you better."

---

## Design Principles

- **No generic AI aesthetic.** If it looks like a template, it's wrong.
- **Assertive, not precious.** Confident, like a friend who's good at this.
- **Empty canvas.** Minimal, utilitarian. The app is a workspace, not a gallery. It gets out of the way of the art.
- **Copy is personality-first.** Short, direct, opinionated.
- **Show taste through constraints.** The 5 layout algorithms are curated opinions, not infinite sliders.
- **Anti-AI-art.** Human stories are the point.

---

## Architecture

```
index.html — Input (wall size + tape length + art dimensions)
  → ar.html — Distance → Camera → Freeze Frame
    → Pill Nav — Scale → Layout → Position → Finish
      → Nail Instructions — Exact measurements from tape reference
```

**Stack:** Vanilla JS, Canvas API, Camera API (getUserMedia). No build step. Static deploy. ~80KB total.

**Previous approach:** 8th Wall (SLAM) + A-Frame (3D/AR). Replaced with a simpler, faster freeze-frame camera approach. The old AR code has been fully removed from the repo.

---

## Key Technical Decisions

### Freeze-Frame over AR
Real-time AR (8th Wall/A-Frame) was 17MB of dependencies and fragile on mobile Safari. Freeze-frame is simpler, faster, and more reliable. Users freeze a photo of their wall, overlay art at calculated scale, and get exact measurements. The trade-off (no real-time movement) doesn't matter because art placement is a static decision.

### Pixels-Per-Inch Calculation
Distance to wall + camera FOV (69 degrees horizontal in portrait) + user-adjustable scale factor. The tape guide line gives a physical reference to calibrate against.

### Gallery Hang Standard
All art centered at 60 inches from the floor. This is the museum/gallery standard. The nail placement calculations work backward from this height.

### Position Memory (pieceOrder)
When a user drags pieces to new positions, the order is captured (sorted by screen position: top-to-bottom, left-to-right). When switching layouts, this order is preserved. Piece 1 stays piece 1 even if the layout algorithm changes.

### Scale Mode UX
Yellow border-only outlines (no fill, no shadow) so the green tape guide is fully visible. Thicker dashed line for calibration clarity. Drag to reposition the entire overlay to align guide with physical tape. This is the critical calibration step.

---

## The Five Layouts

1. **Grid** — Rows and columns. Spacing measured between nearest edges, not uniform cells.
2. **Stacked** — Single vertical column, horizontally centered.
3. **Salon** — Gallery-style organic arrangement. Largest piece centered, others placed around it.
4. **Centered Row** — Single horizontal line, vertically centered. Default layout.
5. **Custom** — Pieces fanned out horizontally for free drag arrangement.

---

## User Journey

1. Read prep instructions (tape measure + painter's tape at 60")
2. Enter wall dimensions (required) and tape length (recommended)
3. Toggle demo mode or add own art photos with dimensions
4. Tap "Preview on Wall"
5. Select distance from wall
6. Aim phone, use level indicator, freeze frame
7. Scale: adjust slider + drag to align tape guide
8. Layout: pick arrangement, adjust spacing
9. Position: drag individual pieces
10. Finish: get nail placement measurements

---

## Evolution Log

### Sessions 4-7 — Full Rebuild
- Eliminated layouts.html (direct index.html to ar.html flow)
- Built unified pill navigation (Scale, Layout, Position, Retake + Back, Finish)
- Added per-piece drag-and-drop for all layouts
- Added position swap persistence across layout changes
- Added phone level indicator (DeviceOrientation API)
- Added demo/custom art toggle with placeholder images
- Added pre-photo prep instructions (moved to index.html)
- Added tape length input (moved to wall dimensions card)
- Added nail placement instructions with tape-relative measurements
- Grid spacing reworked to use actual column/row dimensions
- Scale mode: border-only art, draggable tape guide, tooltip
- Pill hierarchy: top row (workflow) + bottom row (exits)
- Performance pass: removed 17MB dead code, cached placeholders, fixed level indicator memory leak, removed dead CSS

### Session 3 — Code Audit
- Fixed compressDataUrl sync bug (async Image loading)
- Fixed localStorage quota handling with progressive fallback
- Fixed image editor memory leak (resize listener)
- Fixed pinch-to-zoom scroll conflict
- Added camera cleanup, resize handler, input validation

### Session 2 — Visual Identity
- Landed on empty canvas / utilitarian workspace aesthetic
- The app doesn't have a vibe. It holds space for your vibe.

### Session 1 — Strategy
- Personal tool first, platform story second
- Ship the personal one, tell the platform story
- Projects prove capability. Frameworks stay internal.

---

## Future Vision

- Voice-controlled placement ("move left, bigger, swap")
- Vibe-based art recommendation (room context + mood)
- Artist library with direct-purchase links (no commissions)
- Cart pre-population on artist e-commerce sites
- Free hub model: artists upload, users visualize, buy direct

---

## Portfolio Positioning

This project demonstrates: product thinking (user journey design), technical execution (vanilla JS, no dependencies), UX iteration (8 sessions of refinement), and shipping taste (curated layouts, design constraints, gallery standards). The code is the artifact. The decisions are the story.
