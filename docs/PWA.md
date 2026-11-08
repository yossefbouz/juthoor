# Juthoor Progressive Web App (PWA)

## What shipped
- Web App Manifest at `/manifest.webmanifest` (`src/app/manifest.ts`)
- Install icons under `public/icons/` (192 / 512 / maskable / Apple touch)
- Service worker `public/sw.js` (offline fallback to `/offline.html`)
- Client registration via `PwaRegister` in the root layout providers
- Theme colour `#3E7030`, standalone display, start URL `/dashboard`

## How to try it
1. Run the web app (`pnpm --filter web dev` or production build).
2. Open on **localhost** or **HTTPS**.
3. Chrome / Edge: install icon in the address bar, or Application → Manifest.
4. Android Chrome: browser menu → **Add to Home screen** / **Install app**.
5. iOS Safari: Share → **Add to Home Screen** (Apple does not use the install prompt the same way).

## Offline behaviour
Navigations try the network first. If offline, the cached page or `/offline.html` is shown. API/auth calls still need a connection.

## Next (not this release)
- Push notifications
- Richer precache of critical routes after login
