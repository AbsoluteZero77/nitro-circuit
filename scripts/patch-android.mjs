// Run after `npx cap add android`. Applies the native tweaks the game needs.
// Every step is best-effort: a failure here warns but never blocks the APK build.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const appId = "com.nitrocircuit.game";
const root = "android/app";
const warn = (m) => console.warn(`[patch-android] ${m}`);
const log = (m) => console.log(`[patch-android] ${m}`);

// 1) Landscape only (a racing game with side-mounted controls).
try {
  const p = join(root, "src/main/AndroidManifest.xml");
  let x = readFileSync(p, "utf8");
  if (!x.includes("screenOrientation")) {
    x = x.replace("<activity", '<activity\n            android:screenOrientation="sensorLandscape"');
    writeFileSync(p, x);
    log("manifest: sensorLandscape");
  }
} catch (e) {
  warn(`manifest not patched: ${e.message}`);
}

// 2) Immersive full-screen (hide status/navigation bars; swipe to reveal).
try {
  const dir = join(root, "src/main/java", ...appId.split("."));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "MainActivity.java"),
    `package ${appId};

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    hideSystemBars();
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideSystemBars();
  }

  private void hideSystemBars() {
    WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    c.hide(WindowInsetsCompat.Type.systemBars());
  }
}
`,
  );
  log("MainActivity: immersive mode");
} catch (e) {
  warn(`MainActivity not patched: ${e.message}`);
}

// 3) Version from CI (run number) so each build installs over the last one.
try {
  const p = join(root, "build.gradle");
  if (existsSync(p) && process.env.GITHUB_RUN_NUMBER) {
    let g = readFileSync(p, "utf8");
    g = g.replace(/versionCode\s+\d+/, `versionCode ${process.env.GITHUB_RUN_NUMBER}`);
    g = g.replace(/versionName\s+"[^"]*"/, `versionName "1.0.${process.env.GITHUB_RUN_NUMBER}"`);
    writeFileSync(p, g);
    log(`version 1.0.${process.env.GITHUB_RUN_NUMBER}`);
  }
} catch (e) {
  warn(`version not patched: ${e.message}`);
}
