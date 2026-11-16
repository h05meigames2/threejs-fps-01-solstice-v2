// Keyboard and mouse, and the pointer lock that turns the mouse into look.
// Plain browser APIs only. Movement keys, weapon slots, grenades, buy skip,
// defuse hold and the fire button are all read from here; the simulation
// never touches a DOM event directly.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = {
    keys,
    locked: false,
    firing: false,
    aiming: false,      // right mouse held: aim down sights
    lookDX: 0,
    lookDY: 0,
    pressed: new Set(),   // codes pressed since last consume (edge-triggered)
  };

  function setKey(event, down) {
    if (down) {
      if (!keys.has(event.code)) state.pressed.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space' || event.code === 'Tab') event.preventDefault();
  }

  function onMouseDown(event) {
    if (event.button === 2) { state.aiming = true; return; }
    if (event.button !== 0) return;
    if (!state.locked) {
      canvas.requestPointerLock();
      return;
    }
    state.firing = true;
  }
  function onMouseUp(event) {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  }
  function onMouseMove(event) {
    if (!state.locked) return;
    state.lookDX += event.movementX || 0;
    state.lookDY += event.movementY || 0;
  }
  function onLock() {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) state.firing = false;
    if (onLockChange) onLockChange(state.locked);
  }
  function onContext(event) { event.preventDefault(); }

  document.addEventListener('keydown', (e) => setKey(e, true));
  document.addEventListener('keyup', (e) => setKey(e, false));
  canvas.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onLock);
  canvas.addEventListener('contextmenu', onContext);

  // Edge-triggered keys: main.js consumes them once per fixed step.
  state.consumePressed = (code) => {
    if (!state.pressed.has(code)) return false;
    state.pressed.delete(code);
    return true;
  };
  state.consumeLook = () => {
    const dx = state.lookDX, dy = state.lookDY;
    state.lookDX = 0; state.lookDY = 0;
    return { dx, dy };
  };
  state.axis = () => {
    let x = 0, z = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
    return { x, z };
  };
  state.crouching = () => keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
  state.sprinting = () => keys.has('ShiftLeft') || keys.has('ShiftRight');
  state.ads = () => state.aiming;
  return state;
}
