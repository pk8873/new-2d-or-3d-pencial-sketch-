# Deploy to Render (One Click)

## Steps

1. Push this project to GitHub (new repo).
2. Go to https://render.com → **New +** → **Blueprint**.
3. Connect your GitHub repo. Render will detect `render.yaml` automatically.
4. Click **Apply** → done. Live URL appears in 2–4 minutes.

## What's included

- 100% browser-based video stylizer (FFmpeg.wasm)
- 6 cartoon / animation presets
- No backend, no API keys, no GPU — fully free
- SPA rewrites and COOP/COEP headers preconfigured for FFmpeg.wasm

## Local run

```bash
bun install
bun run dev
```

## Local build preview

```bash
bun run build
npx serve dist/client
```
