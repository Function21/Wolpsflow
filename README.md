# Wolpsflow

A minimal lo-fi music space for focused work. Open the page, hit play, and study to drifting beats over slowly cross-fading scenes — with a fresh quote in the corner each time the view changes.

## Features

- Curated lo-fi tracks that cycle automatically, with smooth volume cross-fades between songs
- Full-screen scenic backgrounds with cinematic Ken Burns drift and crossfade transitions
- Inspirational quotes pulled from [QuoteSlate](https://github.com/Musheer360/QuoteSlate), de-duplicated across visits via `localStorage`
- One-tap "Next" to refresh scene, music, and quote together
- Ambient auto-rotation: the scene and quote drift on their own without interrupting the current track
- Local fallback quote pool so the page degrades gracefully when offline

## Tech Stack

| Layer | Choice |
|---|---|
| UI | Svelte 5 |
| Build | Vite + TypeScript |
| Audio | Native `HTMLAudioElement` (no synth libraries) |
| Visuals | CSS transitions and transforms |
| Quote API | Cloudflare Pages Function proxying QuoteSlate |
| Hosting | Cloudflare Pages |

The audio path is intentionally bare — pre-recorded MP3s instead of generative synthesis — so playback stays predictable and the bundle stays tiny.

## Requirements

- Node.js 20 or newer
- A modern browser

## Local Development

```bash
git clone https://github.com/Function21/Wolpsflow.git
cd Wolpsflow
npm install
npm run dev
```

Then open `http://127.0.0.1:5173/`.

> Vite's dev server doesn't run Cloudflare Functions, so `/api/quote` will 404 locally and the app falls back to its bundled quote pool. Once deployed, QuoteSlate kicks in and the catalog grows substantially.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server with HMR |
| `npm run build` | Build for production into `dist/` |
| `npm run preview` | Preview the production build |
| `npm run check` | Type-check Svelte and TypeScript sources |

## Project Layout

```
Wolpsflow/
├── public/
│   ├── images/           # Scene backgrounds (.webp)
│   └── audio/            # Lo-fi tracks (.mp3)
├── src/
│   ├── App.svelte        # Single-page UI: backgrounds, controls, quote
│   ├── main.ts           # App entry
│   └── lib/
│       ├── audio.ts      # AudioEngine: HTMLAudio + volume crossfade
│       ├── api.ts        # Quote fetch with retry + local fallback
│       ├── tracks.ts     # Local quote pool + de-duplication
│       ├── math.ts       # hashString helper
│       └── types.ts      # Quote interface
├── functions/
│   └── api/quote.js      # Cloudflare Function proxying QuoteSlate
├── styles.css
├── vite.config.ts
├── tsconfig.json
├── wrangler.toml
└── package.json
```

## How Quotes Are De-duplicated

Each quote receives a stable ID derived from `hashString(text + author)`, so the same quote returned by different sources resolves to one canonical entry. Recently seen IDs live in `localStorage` under `wolpsflow.seenQuoteIds`; once the visible pool is exhausted, history resets and the rotation begins again.

## Deploying to Cloudflare Pages

1. **Push to GitHub.**
2. **Create a Pages project** in the Cloudflare dashboard and connect it to your repository.
3. **Build settings:**
   - Framework preset: `None`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variable: `NODE_VERSION = 20`
4. **Functions deploy automatically.** Cloudflare picks up the [functions/](functions/) folder, exposing [functions/api/quote.js](functions/api/quote.js) at `/api/quote` without further configuration.

After deploy, hit `/api/quote` directly to confirm the QuoteSlate proxy returns fresh content on every request. If responses look frozen, check that `cf.cacheTtl` in [functions/api/quote.js](functions/api/quote.js) stays at `0`.

## Customization

- **Add scenes or tracks** by dropping files into `public/images/` or `public/audio/` and appending the path to the corresponding array in [src/App.svelte](src/App.svelte).
- **Auto-rotation cadence** is the interval value passed to `setInterval` in [src/App.svelte](src/App.svelte).
- **Playback volume** is `targetVolume` in [src/lib/audio.ts](src/lib/audio.ts).
- **Crossfade timing** lives in `.scene-layer` transitions in [styles.css](styles.css).

## Notes

- Browsers block autoplay until the user interacts with the page; the app waits for the first pointer event to start playback.
- Single-file uploads to Cloudflare Pages are capped at 25 MB; keep individual track sizes well below that.

## Credits

- Quote data via [QuoteSlate](https://github.com/Musheer360/QuoteSlate)
- Music sourced from [Pixabay](https://pixabay.com/music/) under the Pixabay Content License
- Background art from open lo-fi illustration sets

## License

MIT
