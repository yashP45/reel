# Reel — Loom-style Chrome Extension (Take-Home)

Record your screen in seconds, preview instantly, and share a link. Built as a **Loom alternative** with a faster, side-panel-first UX.

## Deliverables

| Deliverable | Location |
|-------------|----------|
| Chrome extension `.zip` | [`extension/.output/reel-extension-1.0.0-chrome.zip`](extension/.output/reel-extension-1.0.0-chrome.zip) |
| Reasoning document | [`REASONING.md`](REASONING.md) |
| Demo video script | [Demo script](#demo-video-script) below |
| Source code | This repo — push to GitHub for submission link |

## Features

- **Side panel UI** — roomy controls vs a cramped popup
- **Record this tab** in one click (3s countdown + floating control bar)
- **Window / full screen** via Chrome’s desktop capture picker
- **Microphone** + **webcam bubble** (tab mode; bubble appears in recording)
- **Instant local preview** while upload runs in the background
- **Shareable link** via Supabase Storage + watch page
- **Keyboard shortcut:** `Alt+Shift+R` (record current tab)

## Quick start

### 1. Extension (local / unpacked)

```bash
cd extension
cp .env.example .env   # optional — for cloud share links
npm install
npm run dev            # loads .output/chrome-mv3 with hot reload
```

**Load in Chrome:** `chrome://extensions` → Developer mode → **Load unpacked** → select `extension/.output/chrome-mv3` (after `npm run dev` or `npm run build`).

**Production zip:**

```bash
cd extension
npm run build
npm run zip
# → extension/.output/reel-extension-1.0.0-chrome.zip
```

Or run `scripts/package-extension.ps1` from the repo root.

### 2. Supabase (share links)

1. Create a [Supabase](https://supabase.com) project.
2. Run SQL in [`supabase/migrations/`](supabase/migrations/) (table + storage policies).
3. Create a **public** Storage bucket named `recordings`.
4. Copy `extension/.env.example` → `extension/.env`:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SHARE_PAGE_URL=http://localhost:5173
```

5. Rebuild the extension: `npm run build` in `extension/`.

Without Supabase, recording and **download** still work; share links show a setup hint.

### 3. Share / watch page

```bash
cd share-page
cp .env.example .env
npm install
npm run dev
```

Deploy to Vercel/Netlify (see `share-page/vercel.json` for `/watch/:id` routing). Set `VITE_SHARE_PAGE_URL` to your deployed URL.

## Project structure

```
loom/
├── extension/          # WXT + React + Tailwind (MV3)
├── share-page/         # Public video watch page
├── supabase/           # SQL migrations
├── REASONING.md        # Design & tradeoffs (30% rubric)
└── scripts/            # Zip packaging
```

## Demo video script

**Target length:** 2–3 minutes.

1. **Install** — Load unpacked extension; pin Reel; open side panel.
2. **Record tab** — Click “Record this tab”; show 3s countdown on page; show floating pill (timer, pause, stop).
3. **Optional** — Enable webcam bubble; show it on the page.
4. **Stop** — Click Stop; side panel shows **instant preview**.
5. **Upload** — Progress bar; **Copy share link** when done.
6. **Share** — Open link in **incognito** (watch page plays video).
7. **Shortcut** — `Alt+Shift+R` starts tab recording.
8. **Close** — Mention download `.webm` works without cloud.

## Manual test checklist

- [ ] Record tab → preview plays
- [ ] Pause / resume during recording
- [ ] Window mode → picker → recording works
- [ ] Mic on / off
- [ ] Webcam bubble (tab mode)
- [ ] Upload + copy link (with Supabase configured)
- [ ] Watch page loads in incognito
- [ ] Download .webm
- [ ] `chrome://` pages cannot be recorded (expected)

## GitHub

```bash
git init
git add .
git commit -m "feat: Reel Loom-style screen recorder extension"
git remote add origin https://github.com/YOUR_USER/loom.git
git push -u origin main
```

## Tech stack

- [WXT](https://wxt.dev) + React 19 + TypeScript
- Tailwind CSS v4
- Chrome MV3: side panel, offscreen document, tab/desktop capture
- Supabase Storage + Postgres

## License

MIT — take-home submission.
