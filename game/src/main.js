// Boot and the one loop. Input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between five screens: title, play, paused, over and win.
//
// ?seed=N fixes the descent's layout. ?shot=start|play|stratum|win|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot; src/shots.js says what each scene is.
import { GLOW, STEP, MAX_FRAME, VIEW } from './config.js';
import { createRandom } from './random.js';
import { EVENT_HIT, EVENT_MOTE, EVENT_OVER, EVENT_STAR, EVENT_STRATUM, EVENT_WALL, EVENT_WIN, createWorld, screenY } from './world.js';
import { ACTION_BACK, ACTION_CONFIRM, ACTION_MUTE, createInput } from './input.js';
import { SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN, createRenderer } from './render.js';
import { stageShot } from './shots.js';
import { createAudio } from './audio.js';

const BEST_KEY = 'lumenfall.best.v1';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const boot = document.getElementById('boot');
if (boot) boot.remove();
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

/**
 * A read-only hook for automated play-testing: the state a test needs to steer, and nothing that
 * changes the game. It never moves the comet; it only says where it is.
 */
window.__lumenfall = {
  state: world.state,
  screen: SCREEN_TITLE,
  seed,
  cometX: () => world.comet.x,
  cometY: () => world.comet.y,
  items: () => world.items.map((item) => ({ kind: item.kind, x: item.x, at: item.at, sy: VIEW.height - screenY(item.at, world.state.depth) })),
  corridor: () => world.corridor(),
};

function runShot(name) {
  const scene = stageShot(name, world);
  renderer.seedTrail(world);
  let painted = 0;
  function paint() {
    renderer.setAlive(scene.screen !== SCREEN_OVER);
    renderer.frame(world, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  window.__lumenfall.screen = scene.screen;
  window.__lumenfall.ok = scene.ok !== false;
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let overTimer = 0;

  /** Screen readers, and anyone watching the page's text, hear the screen changes. */
  function announce(message) {
    status.textContent = message;
  }

  function setScreen(next) {
    screen = next;
    window.__lumenfall.screen = next;
  }

  function startRun() {
    world.reset();
    renderer.clearTrail();
    renderer.setAlive(true);
    accumulator = 0;
    overTimer = 0;
    audio.unlock();
    audio.play('start');
    setScreen(SCREEN_PLAY);
    announce(`Descending. Glow ${GLOW.start} percent. The core is 4,000 metres down.`);
  }

  function toTitle() {
    input.releasePointer();
    world.reset();
    renderer.clearTrail();
    renderer.setAlive(true);
    setScreen(SCREEN_TITLE);
    announce('Lumenfall. Press Space or click to descend.');
  }

  function endRun(won) {
    input.releasePointer();
    renderer.setAlive(won);
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    setScreen(won ? SCREEN_WIN : SCREEN_OVER);
    audio.play(won ? 'win' : 'over');
    overTimer = won ? 1.1 : 0.8;
    announce(won
      ? `You reached the core. Final score ${Math.round(world.state.score)}.`
      : `Your light went out at ${Math.round(world.state.depth)} metres. Score ${Math.round(world.state.score)}.`);
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_BACK) {
      if (screen === SCREEN_PLAY) {
        setScreen(SCREEN_PAUSED);
        input.releasePointer();
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        setScreen(SCREEN_PLAY);
        announce('Descending.');
      } else if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
        if (overTimer <= 0) toTitle();
      }
      return;
    }
    if (!(actions & ACTION_CONFIRM)) return;
    if (screen === SCREEN_TITLE) startRun();
    else if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      // A moment's guard, so the keystroke that ended the run does not skip its screen.
      if (overTimer <= 0) startRun();
    } else if (screen === SCREEN_PAUSED) {
      setScreen(SCREEN_PLAY);
      announce('Descending.');
    }
  }

  /** One fixed step of play, with the world's events turned into sound and announcements. */
  function step() {
    const steer = input.steer();
    const events = world.step(STEP, steer, false);
    renderer.react(events, world);
    if (events & EVENT_MOTE) audio.play('mote');
    if (events & EVENT_STAR) audio.play('star');
    if (events & EVENT_HIT) {
      audio.play('hit');
      announce(`Rock. Glow ${Math.max(0, Math.ceil(world.state.glow))} percent.`);
    }
    if (events & EVENT_WALL) audio.play('wall');
    if (events & EVENT_STRATUM) {
      audio.play('stratum');
      announce(`${world.state.stratum} stratum entered.`);
    }
    if (events & EVENT_OVER) endRun(false);
    else if (events & EVENT_WIN) endRun(true);
    audio.context(world.state.stratum, world.state.chain);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions(input.takeActions());
    if (overTimer > 0) overTimer = Math.max(0, overTimer - Math.min(0.05, (now - last) / 1000 + 0.016));

    if (screen === SCREEN_TITLE) {
      // The title's world keeps falling behind the wordmark, so the screen is alive.
      while (accumulator >= STEP) {
        world.step(STEP, { x: 0, y: 0 }, true);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }

    if (screen === SCREEN_TITLE) renderer.step(1 / 60, world);
    else if (screen !== SCREEN_PAUSED) renderer.step(1 / 60, world);
    renderer.frame(world, screen, best);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      setScreen(SCREEN_PAUSED);
      input.releasePointer();
      announce('Paused.');
    }
  });

  announce('Lumenfall. Press Space or click to descend.');
  requestAnimationFrame(frame);
}



if (shot) runShot(shot);
else runGame();
