// Everything the player presses, in one object: the keys, the mouse, and the one-frame
// actions the screens read. The world never touches a listener.

/** The action bits a step can raise. */
export const ACTION_CONFIRM = 1; // Space or Enter: start, restart, continue
export const ACTION_BACK = 2; // Escape: pause, and leave a screen
export const ACTION_MUTE = 4; // M: sound on or off

/** Keys held down that steer the comet, by code. */
const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
const UP_KEYS = new Set(['ArrowUp', 'KeyW']);
const DOWN_KEYS = new Set(['ArrowDown', 'KeyS']);

/**
 * Wire the input to a canvas. `requestPointerLock` and `document.exitPointerLock` let the
 * mouse steer without a cursor: the mouse is taken while a run is on, and let go at its end.
 */
export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouse = { x: 0, y: 0, inside: false, down: false };
  let locked = false;
  /** Every listener is collected so `dispose` can take them all off again. */
  const off = [];

  function on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    off.push(() => target.removeEventListener(type, handler, options));
  }

  /** The centre of the canvas in page pixels, for turning a client point into game space. */
  function centre() {
    const box = canvas.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }

  on(window, 'keydown', (event) => {
    // Space and arrows scroll the page by default: this page never scrolls.
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'Space' || event.code === 'Enter') actions |= ACTION_CONFIRM;
    else if (event.code === 'Escape') actions |= ACTION_BACK;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    else if (event.code === 'KeyP') actions |= ACTION_BACK;
  });

  on(window, 'keyup', (event) => {
    held.delete(event.code);
  });

  // A window that loses focus never sees its keyup: drop everything held.
  on(window, 'blur', () => {
    held.clear();
    mouse.down = false;
  });

  on(canvas, 'mousemove', (event) => {
    const middle = centre();
    mouse.x = event.clientX - middle.x;
    mouse.y = event.clientY - middle.y;
    mouse.inside = true;
  });

  on(canvas, 'mouseleave', () => {
    if (!locked) mouse.inside = false;
  });

  on(canvas, 'mousedown', (event) => {
    event.preventDefault();
    mouse.down = true;
    actions |= ACTION_CONFIRM;
    if (!locked && canvas.requestPointerLock) {
      // Taken while a run is on; a browser that refuses simply keeps the cursor.
      const taken = canvas.requestPointerLock();
      if (taken && taken.catch) taken.catch(() => {});
    }
  });

  on(canvas, 'mouseup', () => {
    mouse.down = false;
  });

  on(document, 'pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    if (!locked) mouse.inside = false;
  });

  // With the pointer locked the movement arrives as deltas from the middle of the canvas.
  on(document, 'mousemove', (event) => {
    if (!locked) return;
    mouse.x += event.movementX;
    mouse.y += event.movementY;
    const limit = 400;
    mouse.x = Math.max(-limit, Math.min(limit, mouse.x));
    mouse.y = Math.max(-limit, Math.min(limit, mouse.y));
    mouse.inside = true;
  });

  // Touch: a finger held on the left or right half steers that way, a tap confirms.
  const touches = new Map();
  on(canvas, 'touchstart', (event) => {
    event.preventDefault();
    const middle = centre();
    for (const touch of event.changedTouches) {
      touches.set(touch.identifier, touch.clientX - middle.x);
      actions |= ACTION_CONFIRM;
    }
  }, { passive: false });
  on(canvas, 'touchmove', (event) => {
    event.preventDefault();
    const middle = centre();
    for (const touch of event.changedTouches) {
      if (touches.has(touch.identifier)) touches.set(touch.identifier, touch.clientX - middle.x);
    }
  }, { passive: false });
  const endTouch = (event) => {
    for (const touch of event.changedTouches) touches.delete(touch.identifier);
  };
  on(canvas, 'touchend', endTouch);
  on(canvas, 'touchcancel', endTouch);

  /** -1, 0 or 1 from the steering keys (both sides held cancels out). */
  function keyDirection() {
    let left = false;
    let right = false;
    let up = false;
    let down = false;
    for (const code of held) {
      if (LEFT_KEYS.has(code)) left = true;
      else if (RIGHT_KEYS.has(code)) right = true;
      else if (UP_KEYS.has(code)) up = true;
      else if (DOWN_KEYS.has(code)) down = true;
    }
    let direction = 0;
    if (left !== right) direction = left ? -1 : 1;
    if (up !== down) direction += up ? -2 : 2;
    return direction;
  }

  /** The wanted steering as { x, y } in -1..1: keys first, then the mouse, then a finger. */
  function steer() {
    const keys = keyDirection();
    const keyX = Math.abs(keys) === 2 ? 0 : keys;
    const keyY = Math.abs(keys) === 2 ? keys / 2 : 0;
    if (keyX !== 0 || keyY !== 0) {
      if (locked) {
        mouse.x = 0;
        mouse.y = 0;
      }
      return { x: keyX, y: keyY };
    }
    const limit = 400;
    if (mouse.inside) {
      const dead = 18;
      const full = 170;
      const shape = (value) => {
        const size = Math.abs(value);
        if (size <= dead) return 0;
        const amount = Math.min(1, (size - dead) / (full - dead));
        return Math.sign(value) * amount;
      };
      return { x: shape(mouse.x), y: shape(mouse.y) };
    }
    if (touches.size > 0) {
      let sum = 0;
      for (const x of touches.values()) sum += x < -30 ? -1 : x > 30 ? 1 : 0;
      return { x: Math.max(-1, Math.min(1, sum)), y: 0 };
    }
    void limit;
    return { x: 0, y: 0 };
  }

  /** Take the actions raised since the last call, clearing them. */
  function takeActions() {
    const taken = actions;
    actions = 0;
    return taken;
  }

  /** Let go of the mouse, at the end of a run. */
  function releasePointer() {
    if (locked && document.exitPointerLock) document.exitPointerLock();
    mouse.x = 0;
    mouse.y = 0;
    mouse.inside = false;
  }

  /** Forget everything held, when a screen changes what it listens for. */
  function clearHeld() {
    held.clear();
  }

  function dispose() {
    for (const remove of off) remove();
    off.length = 0;
  }

  return { steer, takeActions, releasePointer, clearHeld, dispose, isPointerLocked: () => locked };
}
