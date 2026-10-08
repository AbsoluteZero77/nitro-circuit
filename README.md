# Nitro Circuit

Top-down Amiga-style racing: drift, 3-track championship, CRT scanlines. Runs in the browser and as an Android APK.

## Get the APK (GitHub)

1. Create a new GitHub repo and push this folder to it (`main` branch).
2. Open the repo's **Actions** tab → **Build Android APK** runs automatically (or press *Run workflow*).
3. When it goes green, open the run and download **nitro-circuit-apk** from *Artifacts*. Unzip it → `nitro-circuit.apk`.
4. Copy the APK to your phone and install it (allow *Install unknown apps* when asked).

Want a permanent download link? Push a tag: `git tag v1.0 && git push --tags` — the APK is attached to a GitHub Release.

The APK is debug-signed, which is fine for sideloading. Google Play needs a release-signed AAB (not set up here).

## Run locally

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # headless simulation tests (AI finishes races, laps count, grid holds)
```

Controls: **W/↑** gas · **S/↓** brake · **A D / ← →** steer · **Space** drift (hold, then release for a boost) · **P/Esc** pause. Gamepad and on-screen touch buttons supported.

## Build the APK locally (optional)

Needs JDK 21 and the Android SDK.

```bash
npm install && npm run build
npx cap add android && node scripts/patch-android.mjs
npx capacitor-assets generate --android
npx cap sync android
cd android && ./gradlew assembleDebug   # → app/build/outputs/apk/debug/app-debug.apk
```

## Layout

- `src/game/sim.ts` — physics, AI drivers, lap counting, race flow
- `src/game/tracks.ts` — car/track data, track geometry + painting
- `src/game/engine.ts`, `render.ts`, `input.ts`, `audio.ts`, `save.ts`
- `src/components/nitro-circuit.tsx` — menus, touch controls
- `art/pickups/` — unused pickup sprites (not shipped)
