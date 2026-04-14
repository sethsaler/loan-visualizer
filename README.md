# loan-visualizer

Local **React + Vite** app to paste or load **loan / amortization CSV** and chart **principal, interest, and balance** over time (Recharts). Supports a simple amortization table and **servicer-style** activity exports.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

Production output goes to **`docs/`** for **GitHub Pages** (project site: [sethsaler.github.io/loan-visualizer](https://sethsaler.github.io/loan-visualizer/)). In the repo’s **Settings → Pages**, use **Deploy from a branch**, **main**, **`/docs`**.

After changing app code, run `npm run build` again and commit the updated `docs/` folder.
