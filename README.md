# Tesla Royale

Top-down racing with Tesla-style cars (Model S/3/Y/X, Cybertruck, Roadster in Tesla paint colours), 6-car grids, 7 circuits and a championship. GTA-1998-style top-down view with shadows and depth. Runs in the browser and as an Android APK. Unofficial fan project, not affiliated with Tesla, Inc.

## Get the APK (GitHub)

1. Create a new GitHub repo and push this folder to it (`main` branch).
2. Open the repo's **Actions** tab → **Build Android APK** runs automatically (or press *Run workflow*).
3. When it goes green, open the run and download **tesla-royale-apk** from *Artifacts*. Unzip it → `tesla-royale.apk`.
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
- `src/components/tesla-royale.tsx` — menus, touch controls
- `art/pickups/` — unused pickup sprites (not shipped)
