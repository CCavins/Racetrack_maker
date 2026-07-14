# Circuit Sketch

Draw a racetrack, dress it with stickers, pick a vehicle, and watch it race in a live 3D loop.

## Quick start

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).

## Flow

1. **Draw** a closed loop on the canvas (connect the ends).
2. **Place stickers** (jumps, cones, oil, boost, etc.) and pick a vehicle.
3. Hit **Generate 3D** to enter the live race view.
4. Use **Edit track** to go back; the design is preserved.

## Stack

- Vite + React + TypeScript
- React Three Fiber / drei / three
- Assets in `public/assets/` (Higgsfield-generated stickers + GLBs, with procedural fallbacks)
