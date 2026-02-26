# Difference Engine 3 — static Three.js port

This folder is a **static** (no backend) re-implementation of the original *Difference Engine #3* web frontend.

What’s preserved:
- Original navigation layout + imagery (menu-left)
- Museum / Purgatory / Archive / History / Credits pages

What’s changed:
- The original WebGL scenes were authored in **Blend4Web** (exported `.json/.bin`). Those formats are not directly loadable by Three.js.
- This port replaces them with **simplified Three.js stand-ins** that keep the feel (avatars, space, motion) but not the exact geometry.

## Run locally

Because the Three.js pages use ES modules, you need a local web server.

### Option A (Python)
```bash
cd diffengine_three
python3 -m http.server 8000
```
Then open:
- http://localhost:8000/index.html

### Option B (Node)
```bash
npx serve .
```

## Notes for a full-fidelity port

To faithfully reproduce the museum/purgatory geometry, export the original Blender scenes to **glTF** (or another Three.js-friendly format) and load them via `GLTFLoader`. The source bundle includes Blend4Web exports under:
- `public/assets/b4w/data/**` in the original repository.

