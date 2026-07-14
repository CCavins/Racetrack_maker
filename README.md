# Circuit Sketch

Draw a racetrack, dress it with stickers, pick a vehicle, and watch it race in a live 3D loop.

## Quick start

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually `http://localhost:5173`).

```bash
npm run build    # production build
npm run preview  # preview the build
npm run lint     # Oxlint
```

## Flow

1. **Reshape** the closed course (drag handles, click the edge to add points).
2. **Place stickers** (jumps, cones, oil, boost, etc.) and pick a vehicle.
3. Hit **Generate 3D** to enter the live race view.
4. Use **Edit track** to go back; the design is preserved (also saved in `localStorage`).

## Stack

### App / UI
| Library | Role |
| --- | --- |
| [React](https://react.dev/) 19 | UI and editor shell |
| [React DOM](https://react.dev/reference/react-dom) 19 | Browser rendering |
| [TypeScript](https://www.typescriptlang.org/) | Typed app source |

### Build tooling
| Library | Role |
| --- | --- |
| [Vite](https://vite.dev/) 8 | Dev server and bundler |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | React Fast Refresh / JSX |
| [Oxlint](https://oxc.rs/docs/guide/usage/linter) | Lint (`npm run lint`) |

### 3D race view
| Library | Role |
| --- | --- |
| [Three.js](https://threejs.org/) | WebGL scene, meshes, curves, materials |
| [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) | React renderer for Three.js |
| [Drei](https://github.com/pmndrs/drei) | Helpers (`Sky`, `OrbitControls`, `ContactShadows`, `useGLTF`, …) |

### Assets
- Stickers (PNG) and vehicles / props (GLB) live under `public/assets/`
- Many assets were generated with [Higgsfield](https://higgsfield.ai/); the race view falls back to procedural meshes if a GLB fails to load

### Repo
- [github.com/CCavins/Racetrack_maker](https://github.com/CCavins/Racetrack_maker)
