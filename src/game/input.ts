export type Actions = {
  throttle: number;
  brake: number;
  steer: number; // +1 = left (heading increases)
  handbrake: boolean;
};

const GAME_CODES = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Space", "ShiftLeft", "ShiftRight", "KeyP", "Escape", "Enter",
]);

function radialDeadzone(x: number, y: number, dz = 0.18) {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const k = (m - dz) / (1 - dz) / m;
  return { x: x * k, y: y * k };
}

export class Input {
  keys = new Set<string>();
  virtual = { left: false, right: false, throttle: false, brake: false, handbrake: false };
  pausePressed = false;
  private prevPause = false;
  private attached = false;

  private onDown = (e: KeyboardEvent) => {
    if (GAME_CODES.has(e.code)) e.preventDefault();
    this.keys.add(e.code);
  };
  private onUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private clearAll = () => {
    this.keys.clear();
    this.virtual = { left: false, right: false, throttle: false, brake: false, handbrake: false };
  };

  attach() {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.clearAll);
    document.addEventListener("visibilitychange", this.clearAll);
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.clearAll);
    document.removeEventListener("visibilitychange", this.clearAll);
  }

  sample(): Actions {
    const k = this.keys;
    const v = this.virtual;
    let steer = 0;
    let throttle = 0;
    let brake = 0;
    let handbrake = false;
    let pause = false;

    if (k.has("KeyA") || k.has("ArrowLeft") || v.left) steer += 1;
    if (k.has("KeyD") || k.has("ArrowRight") || v.right) steer -= 1;
    if (k.has("KeyW") || k.has("ArrowUp") || v.throttle) throttle = 1;
    if (k.has("KeyS") || k.has("ArrowDown") || v.brake) brake = 1;
    if (k.has("Space") || k.has("ShiftLeft") || k.has("ShiftRight") || v.handbrake) handbrake = true;
    if (k.has("KeyP") || k.has("Escape")) pause = true;

    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad) continue;
      const stick = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
      steer += -stick.x;
      if (pad.buttons[7]?.value) throttle = Math.max(throttle, pad.buttons[7].value);
      if (pad.buttons[6]?.value) brake = Math.max(brake, pad.buttons[6].value);
      if (pad.buttons[0]?.pressed || pad.buttons[2]?.pressed) handbrake = true;
      if (pad.buttons[9]?.pressed) pause = true;
      if (pad.buttons[12]?.pressed) throttle = 1;
      if (pad.buttons[13]?.pressed) brake = 1;
      if (pad.buttons[14]?.pressed) steer += 1;
      if (pad.buttons[15]?.pressed) steer -= 1;
    }

    steer = Math.max(-1, Math.min(1, steer));
    this.pausePressed = pause && !this.prevPause;
    this.prevPause = pause;
    return { throttle, brake, steer, handbrake };
  }
}
