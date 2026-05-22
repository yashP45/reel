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
2. In **SQL Editor**, run all of [`supabase/setup.sql`](supabase/setup.sql) (creates table + RLS policies).
3. In **Storage**, create a **public** bucket named `recordings` (if it doesn't exist yet).
4. If upload still fails with RLS errors, re-run [`supabase/migrations/003_fix_rls_policies.sql`](supabase/migrations/003_fix_rls_policies.sql).
5. Copy `extension/.env.example` → `extension/.env`:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SHARE_PAGE_URL=http://localhost:3000
```

6. Rebuild the extension: `npm run build` in `extension/`.

Without Supabase, recording and **download** still work; share links show a setup hint.

### 3. Web app (watch page + dashboard + email sign-in)

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Routes:

- `/watch/[id]` — public video player
- `/login` — email + password (no email sent on each sign-in)
- `/dashboard` — your recordings (copy link, delete)

**Supabase auth setup:**

1. Dashboard → **Authentication** → **Providers** → **Email** → enable **Email** (with password).
2. For dev, turn **off** “Confirm email” so sign-up works without a confirmation mail.
3. **Extension auth:** Copy your extension ID from `chrome://extensions` into `NEXT_PUBLIC_EXTENSION_ID` in `web/.env.local`. Sign in via extension → `/login?ext=1` → email + password → extension connects.

See [`web/AUTH.md`](web/AUTH.md) for details.

Run [`supabase/migrations/004_auth_users.sql`](supabase/migrations/004_auth_users.sql) after `setup.sql` for dashboard + owner RLS.

Set `VITE_SHARE_PAGE_URL=http://localhost:3000` in `extension/.env` and rebuild.

Legacy Vite share page remains in `share-page/` but Next.js `web/` is the primary app.

## Project structure

```
loom/
├── extension/          # WXT + React + Tailwind (MV3)
├── web/                # Next.js watch + dashboard + auth
├── share-page/         # Legacy Vite watch page
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
