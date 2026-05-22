# Reel Extension

Chrome MV3 screen recorder — see the [root README](../README.md) for full install, Supabase setup, and usage.

## Commands

```bash
npm install
npm run dev      # dev build → .output/chrome-mv3
npm run build    # production build
npm run zip      # → .output/reel-extension-1.0.0-chrome.zip
```

## Load in Chrome

1. `npm run build`
2. `chrome://extensions` → Developer mode → **Load unpacked**
3. Select `.output/chrome-mv3`
4. Reload after every rebuild

## Environment

Copy `.env.example` → `.env` (Supabase URL, anon key, share page URL). Rebuild after changes.
