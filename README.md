# Reel — Record & Share

A **Loom-style Chrome extension** for fast screen recording and shareable links. Open the side panel, pick what to share, stop from a floating control bar, preview instantly, and copy a link.

| Resource | Location |
|----------|----------|
| Chrome extension source | [`extension/`](extension/) |
| Web app (watch, login, dashboard) | [`web/`](web/) |
| Supabase SQL | [`supabase/`](supabase/) |
| Design & tradeoffs | [`REASONING.md`](REASONING.md) |

---

## Features

- **Side panel UI** — record, preview, upload, and recent library in one place
- **Chrome share picker** — Tab, Window, or Entire screen in one flow
- **Auto-focus** — picking a tab or window switches you to that surface
- **Floating controls** — pause/stop bar follows your active tab (great for full-screen recordings)
- **Microphone** + optional **webcam bubble** (in-page overlay / PiP when supported)
- **Instant local preview** after stop; upload runs in the background
- **Share links** via Supabase Storage + Next.js watch page
- **Guest recording** — no account required to record and share
- **Optional sign-in** — save recordings to your web dashboard
- **Keyboard shortcut:** `Alt+Shift+R` — open panel and start the same picker

---

## Prerequisites

- **Node.js** 18+ and npm
- **Google Chrome** (Manifest V3)
- **Supabase project** (optional — required for share links and dashboard; local download works without it)

---

## Installation

### 1. Clone and install dependencies

```bash
git clone <your-repo-url> loom
cd loom

cd extension && npm install && cd ..
cd web && npm install && cd ..
```

### 2. Supabase setup (share links + dashboard)

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → run [`supabase/setup.sql`](supabase/setup.sql).
3. **SQL Editor** → run [`supabase/migrations/004_auth_users.sql`](supabase/migrations/004_auth_users.sql) (auth + owner RLS).
4. If uploads fail with RLS errors, also run [`supabase/migrations/003_fix_rls_policies.sql`](supabase/migrations/003_fix_rls_policies.sql).
5. **Storage** → create a **public** bucket named `recordings`.
6. **Authentication** → **Providers** → **Email** → enable email + password.
7. For local dev, turn **off** “Confirm email” so sign-up works immediately.

### 3. Configure environment variables

**Extension** — copy and edit:

```bash
cd extension
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SHARE_PAGE_URL=http://localhost:3000
```

**Web app** — copy and edit:

```bash
cd web
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_EXTENSION_ID=your-extension-id
```

Get `NEXT_PUBLIC_EXTENSION_ID` after loading the extension from `chrome://extensions` (Developer mode → Reel → ID).

### 4. Build and load the extension

```bash
cd extension
npm run build
```

In Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `extension/.output/chrome-mv3`
5. Pin **Reel** and allow **Side panel** when prompted

After every code change: `npm run build` in `extension/` → **Reload** on `chrome://extensions`.

**Development with hot reload:**

```bash
cd extension
npm run dev
# Load unpacked from extension/.output/chrome-mv3
```

**Production zip:**

```bash
cd extension
npm run build
npm run zip
# → extension/.output/reel-extension-1.0.0-chrome.zip
```

Or from repo root: `scripts/package-extension.ps1`

### 5. Start the web app

```bash
cd web
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

| Route | Purpose |
|-------|---------|
| `/watch/[id]` | Public video player (share links) |
| `/login` | Sign in / sign up (`?ext=1` for extension auth) |
| `/dashboard` | Your recordings (signed-in users) |

Rebuild the extension whenever you change `extension/.env`.

---

## Usage guide

### Record a video

1. Open a normal website (`https://…`) — not `chrome://` pages.
2. Click the **Reel** icon → side panel opens.
3. Toggle **Microphone** / **Webcam bubble** if needed.
4. Click **Record**.
5. In Chrome’s dialog, choose:
   - **Entire screen** — record everything; switch apps freely; controls follow your active Chrome tab
   - **Window** — one app window; Reel focuses that window after you pick it
   - **Tab** — one browser tab; Reel switches to that tab after you pick it
6. A floating **pause / stop** bar appears on the page. You can close the side panel — stop still works from the bar.

### Stop recording

Use any of these:

- **Stop** on the floating bar
- **Stop** in the side panel (re-open it if closed)
- Chrome’s **Stop sharing** in the browser bar

All paths should dismiss the sharing indicator and show preview in the side panel.

### Share or download

1. After stop, the side panel shows a **local preview** immediately.
2. If Supabase is configured, upload runs in the background.
3. Click **Copy share link** when upload completes.
4. Open the link in any browser (e.g. `http://localhost:3000/watch/<id>`).
5. **Download .webm** works even without Supabase.

### Sign in (optional)

- Side panel → **Sign in** → opens `/login?ext=1`
- Create an account or sign in with email + password
- Extension receives the session; uploads attach to your user
- View and manage recordings at `/dashboard`

No account is required to record, preview locally, or get a share link (guest session).

### Keyboard shortcut

`Alt+Shift+R` — opens the side panel and starts the same record flow (Chrome share picker).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Share link / upload fails | Check Supabase env in `extension/.env`, rebuild extension, verify `recordings` bucket is public |
| “No video data captured” | Reload extension; pick **Entire screen** or **Window**; stop via Reel’s Stop button |
| Side panel stuck on “Please wait…” | Reload extension; click Chrome **Stop sharing**; try again |
| Camera bubble missing | Allow camera for Reel in `chrome://extensions` → Reel → Details |
| Watch page 500 / module error | Stop dev server, delete `web/.next`, run `npm run dev` again |
| `chrome://` pages won’t record | Expected Chrome restriction — use a normal https page |
| Invalid credentials on login | Confirm email in Supabase or disable “Confirm email” for dev |

---

## Project structure

```
loom/
├── extension/          # WXT + React + Tailwind (Chrome MV3)
│   ├── entrypoints/    # background, sidepanel, offscreen, content, webcam-bubble
│   └── lib/              # capture, storage, supabase upload, messaging
├── web/                # Next.js — watch page, login, dashboard
├── supabase/           # SQL setup + migrations
├── scripts/            # Extension zip packaging
├── REASONING.md        # Architecture decisions & tradeoffs
└── README.md           # This file
```

---

## Manual test checklist

- [ ] Record **Entire screen** → preview plays, share link works
- [ ] Record **Tab** → switches to that tab, preview plays
- [ ] Record **Window** → focuses window, preview plays
- [ ] Pause / resume during recording
- [ ] Stop from floating bar (side panel closed)
- [ ] Stop from Chrome “Stop sharing” bar
- [ ] Mic on / off
- [ ] Webcam bubble (optional)
- [ ] Guest share link opens in incognito
- [ ] Sign in → dashboard shows recordings
- [ ] Download `.webm` without Supabase

---

## Demo video script (~2–3 min)

1. **Install** — Load unpacked extension; pin Reel; open side panel.
2. **Record** — Click Record → pick Entire screen → show floating controls.
3. **Browse** — Switch tabs; controls follow.
4. **Stop** — Stop → instant preview in panel.
5. **Share** — Copy link → open in incognito watch page.
6. **Optional** — Sign in, show dashboard; mention download works offline.

---

## Tech stack

- [WXT](https://wxt.dev) + React 19 + TypeScript + Tailwind CSS v4
- Chrome MV3: side panel, offscreen document, `getDisplayMedia`, content scripts
- [Next.js](https://nextjs.org) 15 + Supabase (Auth, Storage, Postgres)

---

## License

MIT
